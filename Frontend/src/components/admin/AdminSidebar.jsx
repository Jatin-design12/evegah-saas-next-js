import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  UserCog,
  Bike,
  RotateCcw,
  Repeat,
  BarChart3,
  Navigation,
  MapPinned,
  Warehouse,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from "lucide-react";

import { signOut } from "firebase/auth";
import { auth } from "../../config/firebase";
import { clearAuthSession } from "../../utils/authSession";

import logo from "../../assets/EV-final-logo.png";
import brandLogo from "../../assets/brand.jpeg";

export default function AdminSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [zonesSubmenuOpen, setZonesSubmenuOpen] = useState(false);

  // Persistence Logic
  useEffect(() => {
    try {
      const raw = localStorage.getItem("evegah.admin.sidebarCollapsed.v1");
      if (raw === "1") setCollapsed(true);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("evegah.admin.sidebarCollapsed.v1", collapsed ? "1" : "0");
    } catch { /* ignore */ }
  }, [collapsed]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.style.setProperty(
      "--admin-sidebar-width",
      collapsed ? "5rem" : "17rem"
    );
    return () => {
      document.documentElement.style.removeProperty("--admin-sidebar-width");
    };
  }, [collapsed]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(min-width: 640px)");
    const sync = () => setOpen(mq.matches);
    sync();
    mq.addEventListener?.("change", sync);
    return () => mq.removeEventListener?.("change", sync);
  }, []);

  const handleLogout = async () => {
    try {
      clearAuthSession();
      await signOut(auth);
    } catch { /* ignore */ } 
    finally {
      setOpen(false);
      navigate("/", { replace: true });
    }
  };

  const inZonesSection = location.pathname.startsWith("/admin/zones");

  useEffect(() => {
    if (inZonesSection) setZonesSubmenuOpen(true);
  }, [inZonesSection]);

  // Refined Link Styling
  const linkClass = ({ isActive }) =>
    `group relative flex items-center transition-all duration-300 rounded-2xl mb-1 ${
      collapsed ? "justify-center px-0 h-12 w-12 mx-auto" : "px-4 py-3 gap-3"
    } ${
      isActive
        ? "bg-slate-900 text-white shadow-lg shadow-slate-200"
        : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
    }`;

  const iconContainerClass = (isActive, colorClass) => 
    `w-9 h-9 shrink-0 rounded-xl flex items-center justify-center border transition-all duration-300 ${
      isActive 
        ? "bg-white/10 border-white/20" 
        : `border-slate-100 ${colorClass}`
    }`;

  const fullLogo = logo?.src || logo;
  const markLogo = brandLogo?.src || brandLogo;

  return (
    <>
      {/* Mobile Toggle Button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="sm:hidden fixed top-6 right-6 z-50 w-12 h-12 rounded-2xl bg-slate-900 shadow-xl grid place-items-center text-white hover:scale-105 transition-all"
        >
          <Menu size={20} />
        </button>
      )}

      {/* Backdrop */}
      {open && (
        <div
          className="sm:hidden fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`fixed top-0 left-0 z-50 flex flex-col h-screen bg-white border-r border-slate-100 transition-all duration-500 ease-in-out shadow-xl shadow-slate-900/5 ${
          collapsed ? "w-20" : "w-68"
        } ${open ? "translate-x-0" : "-translate-x-full sm:translate-x-0"}`}
      >
        {/* Header Section */}
        <div className={`pt-8 pb-6 px-4 flex items-center ${collapsed ? "justify-center" : "justify-between"}`}>
          {!collapsed ? (
            <>
              <img src={fullLogo} alt="eVEGAH" className="h-10 w-auto object-contain" style={{ maxWidth: '140px' }} />
              <button 
                onClick={() => setCollapsed(true)}
                className="p-2 rounded-xl bg-slate-50 text-slate-400 hover:text-slate-900 border border-slate-100 transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
            </>
          ) : (
            <button onClick={() => setCollapsed(false)} className="hover:scale-110 transition-transform">
              <img src={markLogo} alt="mark" className="h-10 w-10 rounded-xl object-cover shadow-sm border border-slate-100" />
            </button>
          )}
        </div>

        {/* Navigation Content */}
        <nav className="flex-1 px-3 space-y-8 overflow-y-auto no-scrollbar">
          
          {/* Dashboard Group */}
          <div>
            {!collapsed && <p className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">Core</p>}
            <NavLink to="/admin/dashboard" className={linkClass}>
              {({ isActive }) => (
                <>
                  <div className={iconContainerClass(isActive, "bg-sky-50 text-sky-600")}>
                    <LayoutDashboard size={18} />
                  </div>
                  {!collapsed && (
                    <div className="flex-1 overflow-hidden">
                      <span className="block font-bold text-sm">Dashboard</span>
                      <span className={`block text-[10px] truncate ${isActive ? "text-slate-300" : "text-slate-400"}`}>System Overview</span>
                    </div>
                  )}
                </>
              )}
            </NavLink>
          </div>

          {/* Management Group */}
          <div>
            {!collapsed && <p className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">Operations</p>}
            <div className="space-y-1">
              {[
                { to: "/admin/users", icon: UserCog, label: "Employees", sub: "Staff Mgmt", color: "bg-violet-50 text-violet-600" },
                { to: "/admin/riders", icon: Users, label: "Riders", sub: "Customer Base", color: "bg-indigo-50 text-indigo-600" },
                { to: "/admin/rentals", icon: Bike, label: "Rentals", sub: "Live Fleet", color: "bg-emerald-50 text-emerald-600" },
                { to: "/admin/returns", icon: RotateCcw, label: "Returns", sub: "Check-in", color: "bg-amber-50 text-amber-600" },
                { to: "/admin/battery-swaps", icon: Repeat, label: "Swaps", sub: "Energy Mgmt", color: "bg-cyan-50 text-cyan-600" },
                { to: "/admin/fleet", icon: Warehouse, label: "Fleet Assets", sub: "Inventory", color: "bg-orange-50 text-orange-600" },
                { to: "/admin/map", icon: Navigation, label: "Map", sub: "Zone Tracking", color: "bg-teal-50 text-teal-600" },
              ].map((item) => (
                <NavLink key={item.to} to={item.to} className={linkClass}>
                  {({ isActive }) => (
                    <>
                      <div className={iconContainerClass(isActive, item.color)}>
                        <item.icon size={18} />
                      </div>
                      {!collapsed && (
                        <div className="flex-1 overflow-hidden">
                          <span className="block font-bold text-sm">{item.label}</span>
                          <span className={`block text-[10px] truncate ${isActive ? "text-slate-300" : "text-slate-400"}`}>{item.sub}</span>
                        </div>
                      )}
                    </>
                  )}
                </NavLink>
              ))}

              <div className="pt-1">
                <div className={`group relative flex items-center transition-all duration-300 rounded-2xl mb-1 px-2 py-1 ${inZonesSection ? "bg-slate-900 text-white shadow-lg shadow-slate-200" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}>
                  <NavLink to="/admin/zones/list" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2">
                    <div className={iconContainerClass(inZonesSection, "bg-rose-50 text-rose-600")}>
                      <MapPinned size={18} />
                    </div>
                    {!collapsed && (
                      <div className="flex-1 overflow-hidden">
                        <span className="block font-bold text-sm">Zones</span>
                        <span className={`block text-[10px] truncate ${inZonesSection ? "text-slate-300" : "text-slate-400"}`}>Geofencing</span>
                      </div>
                    )}
                  </NavLink>

                  {!collapsed ? (
                    <button
                      type="button"
                      onClick={() => setZonesSubmenuOpen((prev) => !prev)}
                      className={`mr-1 rounded-lg p-1.5 transition ${inZonesSection ? "text-slate-200 hover:bg-white/10" : "text-slate-500 hover:bg-slate-100"}`}
                      aria-label="Toggle zones submenu"
                      aria-expanded={zonesSubmenuOpen}
                    >
                      <ChevronDown
                        size={16}
                        className={`transition-transform duration-200 ${zonesSubmenuOpen ? "rotate-180" : "rotate-0"}`}
                      />
                    </button>
                  ) : null}
                </div>

                {!collapsed && zonesSubmenuOpen ? (
                  <div className="ml-12 mt-1 space-y-1">
                    {[
                      { key: "list", to: "/admin/zones/list", label: "Zone List", tone: "text-sky-700 bg-sky-50" },
                      { key: "add", to: "/admin/zones/add", label: "Add Zone", tone: "text-emerald-700 bg-emerald-50" },
                      { key: "assign", to: "/admin/zones/assign", label: "Zone Assign", tone: "text-indigo-700 bg-indigo-50" },
                    ].map((sub) => {
                      const subPath = location.pathname.split("/")[3] || "list";
                      const active = inZonesSection && subPath === sub.key;
                      const fallbackActive = inZonesSection && !location.pathname.split("/")[3] && sub.key === "list";
                      return (
                        <NavLink
                          key={sub.key}
                          to={sub.to}
                          className={`block rounded-xl px-3 py-2 text-xs font-bold transition ${
                            active || fallbackActive
                              ? `${sub.tone} shadow-sm`
                              : "text-slate-500 hover:bg-slate-100"
                          }`}
                          onClick={() => setZonesSubmenuOpen(true)}
                        >
                          {sub.label}
                        </NavLink>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          {/* Analytics Group */}
          <div>
            {!collapsed && <p className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4">Reports</p>}
            <NavLink to="/admin/analytics" className={linkClass}>
              {({ isActive }) => (
                <>
                  <div className={iconContainerClass(isActive, "bg-fuchsia-50 text-fuchsia-600")}>
                    <BarChart3 size={18} />
                  </div>
                  {!collapsed && (
                    <div className="flex-1 overflow-hidden">
                      <span className="block font-bold text-sm">Analytics</span>
                      <span className={`block text-[10px] truncate ${isActive ? "text-slate-300" : "text-slate-400"}`}>Market Insights</span>
                    </div>
                  )}
                </>
              )}
            </NavLink>
          </div>
        </nav>

        {/* Footer / Logout */}
        <div className="p-4 border-t border-slate-50 mt-auto">
          <button
            onClick={handleLogout}
            className={`flex items-center w-full transition-all duration-300 rounded-2xl hover:bg-red-50 group ${
              collapsed ? "justify-center h-12" : "px-4 py-3 gap-3"
            }`}
          >
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border border-red-100 bg-red-50 text-red-600 group-hover:bg-red-600 group-hover:text-white transition-all`}>
              <LogOut size={18} />
            </div>
            {!collapsed && (
              <div className="text-left">
                <span className="block font-bold text-sm text-slate-900 group-hover:text-red-600">Logout</span>
                <span className="block text-[10px] text-slate-400 group-hover:text-red-400">Exit Admin Portal</span>
              </div>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}