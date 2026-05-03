import { useEffect, useMemo, useState } from "react";
import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import { createAuthUser, deleteAuthUser, listAuthUsers, updateAuthUser } from "../../utils/adminUsers";
import { Edit, RefreshCw, Search, Trash2, UserPlus, Shield, Mail, KeyRound, User, AlertCircle, ChevronLeft, ChevronRight } from "lucide-react";

// Upgraded Modal Component
function Modal({ open, title, onClose, children, icon: Icon }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-2xl bg-white rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] scale-in-95 duration-200">
        <div className="flex items-center justify-between p-8 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            {Icon && <div className="p-3 bg-slate-50 text-slate-600 rounded-2xl"><Icon size={24} /></div>}
            <h2 className="text-2xl font-black text-slate-900 tracking-tight">{title}</h2>
          </div>
          <button type="button" className="p-3 text-slate-400 hover:text-slate-800 hover:bg-slate-50 rounded-2xl transition-all" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="p-8 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

export default function AdminUsers() {
  // --- LOGIC AND STATE REMAINS EXACTLY THE SAME ---
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createForm, setCreateForm] = useState({ email: "", password: "", displayName: "", role: "employee" });

  const [editOpen, setEditOpen] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ email: "", displayName: "", role: "employee", disabled: false, password: "" });

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUserTarget, setDeleteUserTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const load = async () => {
    setError(""); setLoading(true);
    try {
      const data = await listAuthUsers();
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (e) {
      setError(String(e?.message || e || "Unable to load users"));
      setUsers([]);
    } finally { setLoading(false); }
  };

  useEffect(() => {
    let mounted = true; load();
    const interval = setInterval(() => { if (!mounted) return; load(); }, 30000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  useEffect(() => { setPage(1); }, [search]);

  const filtered = useMemo(() => {
    const q = String(search || "").trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const email = String(u.email || "").toLowerCase();
      const name = String(u.displayName || "").toLowerCase();
      return email.includes(q) || name.includes(q) || String(u.uid || "").includes(q);
    });
  }, [users, search]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(filtered.length / pageSize)), [filtered.length]);
  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);

  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const handleCreate = async (e) => {
    e.preventDefault(); setCreateError("");
    const email = String(createForm.email || "").trim();
    const password = String(createForm.password || "");
    const role = createForm.role || "employee";

    if (!email || !password) return setCreateError("Email and password are required.");

    setCreating(true);
    try {
      await createAuthUser({ email, password, displayName: String(createForm.displayName || "").trim() || null, role });
      setCreateForm({ email: "", password: "", displayName: "", role: "employee" });
      await load();
    } catch (e2) { setCreateError(String(e2?.message || e2 || "Unable to create user")); } finally { setCreating(false); }
  };

  const openEdit = (u) => {
    setEditUser(u);
    setEditForm({ email: u.email || "", displayName: u.displayName || "", role: u.role || "employee", disabled: Boolean(u.disabled), password: "" });
    setEditError(""); setEditOpen(true);
  };

  const openDelete = (u) => { setDeleteUserTarget(u); setDeleteError(""); setDeleteOpen(true); };

  const handleConfirmDelete = async () => {
    if (!deleteUserTarget?.uid) return;
    setDeleteError(""); setDeleting(true);
    try {
      await deleteAuthUser(deleteUserTarget.uid);
      setDeleteOpen(false); setDeleteUserTarget(null); await load();
    } catch (e) { setDeleteError(String(e?.message || e || "Unable to delete user")); } finally { setDeleting(false); }
  };

  const handleSaveEdit = async () => {
    if (!editUser?.uid) return;
    setEditError(""); setEditSaving(true);
    try {
      await updateAuthUser(editUser.uid, {
        email: String(editForm.email || "").trim() || undefined,
        displayName: String(editForm.displayName || "").trim() || undefined,
        role: editForm.role || undefined,
        disabled: Boolean(editForm.disabled),
        password: editForm.password ? String(editForm.password) : undefined,
      });
      setEditOpen(false); setEditUser(null); await load();
    } catch (e) { setEditError(String(e?.message || e || "Unable to update user")); } finally { setEditSaving(false); }
  };

  const stats = useMemo(() => {
    const admins = users.filter((u) => String(u.role || "").toLowerCase() === "admin").length;
    const disabled = users.filter((u) => Boolean(u.disabled)).length;
    return {
      total: users.length,
      admins,
      employees: Math.max(0, users.length - admins),
      disabled,
    };
  }, [users]);

  return (
    <div className="h-screen w-full flex bg-[#f7f8fc]">
      <AdminSidebar />

      <main className="flex-1 w-full min-w-0 overflow-x-hidden overflow-y-auto sm:ml-[var(--admin-sidebar-width,16rem)]">
        <AdminTopbar title="Users" subtitle="Create and manage platform accounts" />

        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="text-xs text-slate-500">Total Users</div>
              <div className="mt-1 text-3xl font-semibold text-slate-900">{stats.total}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="text-xs text-slate-500">Admins</div>
              <div className="mt-1 inline-flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <Shield size={18} className="text-indigo-600" />
                {stats.admins}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="text-xs text-slate-500">Employees</div>
              <div className="mt-1 inline-flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <User size={18} className="text-sky-600" />
                {stats.employees}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="text-xs text-slate-500">Disabled Accounts</div>
              <div className="mt-1 inline-flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <AlertCircle size={18} className="text-rose-600" />
                {stats.disabled}
              </div>
            </div>
          </div>

          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Create User</h2>
                <p className="text-sm text-slate-500">Add employee/admin credentials</p>
              </div>
              <button
                type="button"
                onClick={load}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
                Refresh
              </button>
            </div>

            <form onSubmit={handleCreate} className="grid gap-3 md:grid-cols-4">
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-medium text-slate-600">Email</span>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((p) => ({ ...p, email: e.target.value }))}
                  placeholder="user@company.com"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">Password</span>
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(e) => setCreateForm((p) => ({ ...p, password: e.target.value }))}
                  placeholder="******"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-medium text-slate-600">Role</span>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm((p) => ({ ...p, role: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                >
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </select>
              </label>

              <label className="space-y-1 md:col-span-3">
                <span className="text-xs font-medium text-slate-600">Display Name</span>
                <input
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm((p) => ({ ...p, displayName: e.target.value }))}
                  placeholder="Full name"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-indigo-500"
                />
              </label>

              <div className="flex items-end md:justify-end">
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50 md:w-auto"
                >
                  <UserPlus size={15} />
                  {creating ? "Creating..." : "Create User"}
                </button>
              </div>
            </form>

            {createError ? <div className="mt-3 text-sm text-rose-600">{createError}</div> : null}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 p-4">
              <div className="grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                <label className="relative">
                  <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by email, name or UID"
                    className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-indigo-500"
                  />
                </label>
                <div className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                  {filtered.length} results
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                    <th className="px-4 py-3">User</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-500">Loading users...</td>
                    </tr>
                  ) : filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-slate-500">No users found.</td>
                    </tr>
                  ) : (
                    pageRows.map((u, index) => {
                      const role = String(u.role || "employee").toLowerCase();
                      return (
                        <tr
                          key={u.uid}
                          className={`border-b border-slate-100 hover:bg-slate-50 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="grid h-9 w-9 place-items-center rounded-full bg-slate-900 text-xs font-semibold uppercase text-white">
                                {String(u.email || "?").slice(0, 2)}
                              </div>
                              <div className="font-medium text-slate-900">{u.email || "-"}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{u.displayName || "-"}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                role === "admin" ? "bg-indigo-50 text-indigo-700" : "bg-sky-50 text-sky-700"
                              }`}
                            >
                              {role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                                u.disabled ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {u.disabled ? "Disabled" : "Active"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => openEdit(u)}
                                className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-blue-50 hover:text-blue-700"
                                title="Edit"
                              >
                                <Edit size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => openDelete(u)}
                                className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-rose-50 hover:text-rose-700"
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 p-4 text-sm">
              <div className="text-slate-500">Page {page} of {totalPages}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  <ChevronLeft size={14} /> Prev
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  Next <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </section>

            {/* Edit Modal */}
            <Modal open={editOpen} title="Modify Record" icon={Edit} onClose={() => setEditOpen(false)}>
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Email Address</label>
                  <input
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 font-bold text-slate-900 focus:ring-4 ring-blue-500/10 transition-all outline-none"
                    value={editForm.email} onChange={(e) => setEditForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Full Name</label>
                  <input
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 font-bold text-slate-900 focus:ring-4 ring-blue-500/10 transition-all outline-none"
                    value={editForm.displayName} onChange={(e) => setEditForm((p) => ({ ...p, displayName: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Authorization Role</label>
                  <select
                    className="w-full bg-slate-50 border-none rounded-2xl px-5 py-3.5 font-bold text-slate-900 focus:ring-4 ring-blue-500/10 transition-all outline-none appearance-none cursor-pointer"
                    value={editForm.role} onChange={(e) => setEditForm((p) => ({ ...p, role: e.target.value }))}
                  >
                    <option value="employee">Standard Employee</option>
                    <option value="admin">System Administrator</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Account State</label>
                  <label className="flex items-center gap-3 p-3.5 bg-slate-50 rounded-2xl cursor-pointer hover:bg-slate-100 transition-colors border border-transparent">
                    <div className="relative flex items-center">
                      <input
                        type="checkbox" checked={Boolean(editForm.disabled)}
                        onChange={(e) => setEditForm((p) => ({ ...p, disabled: e.target.checked }))}
                        className="peer sr-only"
                      />
                      <div className="w-10 h-6 bg-emerald-400 rounded-full peer-checked:bg-rose-500 transition-colors"></div>
                      <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4 shadow-sm"></div>
                    </div>
                    <span className="text-sm font-bold text-slate-700 select-none">
                      {editForm.disabled ? "Account Suspended" : "Account Active"}
                    </span>
                  </label>
                </div>

                <div className="md:col-span-2 p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-2">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Reset Password (Optional)</label>
                  <input
                    className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-3.5 font-bold text-slate-900 focus:ring-4 ring-blue-500/10 transition-all outline-none"
                    type="password" placeholder="Leave blank to maintain current credentials"
                    value={editForm.password} onChange={(e) => setEditForm((p) => ({ ...p, password: e.target.value }))}
                  />
                </div>

                <div className="md:col-span-2 flex items-center justify-end gap-4 pt-4">
                  {editError && <p className="text-sm font-bold text-rose-500 mr-auto"><AlertCircle size={16} className="inline mr-1"/> {editError}</p>}
                  <button type="button" className="px-6 py-3.5 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-all" onClick={() => setEditOpen(false)}>
                    Discard
                  </button>
                  <button
                    type="button" disabled={editSaving} onClick={handleSaveEdit}
                    className="px-8 py-3.5 rounded-2xl bg-slate-900 hover:bg-black text-white text-sm font-black shadow-xl shadow-slate-200 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                  >
                    {editSaving ? "Applying..." : "Apply Changes"}
                  </button>
                </div>
              </div>
            </Modal>

            {/* Delete Modal */}
            <Modal open={deleteOpen} title="Revoke Access" icon={Trash2} onClose={() => { if (!deleting) setDeleteOpen(false); }}>
              <div className="space-y-6">
                <div className="p-6 bg-rose-50 rounded-3xl border border-rose-100 text-rose-800">
                  <h3 className="font-black text-lg mb-1 flex items-center gap-2"><AlertCircle size={20}/> Warning</h3>
                  <p className="text-sm font-medium opacity-90">
                    You are about to permanently purge <span className="font-black">{deleteUserTarget?.email || deleteUserTarget?.uid}</span> from the authentication registry. This action is irreversible.
                  </p>
                </div>

                {deleteError && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl px-5 py-4 text-sm font-bold flex items-center gap-2">
                    <AlertCircle size={18}/> {deleteError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-4">
                  <button type="button" className="px-6 py-3.5 rounded-2xl font-bold text-slate-500 hover:bg-slate-50 transition-all" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                    Cancel
                  </button>
                  <button
                    type="button" disabled={deleting} onClick={handleConfirmDelete}
                    className="px-8 py-3.5 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-black shadow-xl shadow-rose-200 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
                  >
                    {deleting ? "Purging..." : "Confirm Purge"}
                  </button>
                </div>
              </div>
            </Modal>

          </div>
        </main>
    </div>
  );
}