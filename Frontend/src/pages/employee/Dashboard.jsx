import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  BatteryCharging,
  Clock,
  ClipboardList,
  FileText,
  MapPinned,
  Repeat,
  User,
  Activity,
  Zap,
  ChevronRight,
  ArrowUpRight,
  Trash2,
  AlertCircle,
  Plus,
  TrendingUp,
  Search,
  Filter,
  Car,
} from "lucide-react";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import EmployeeLayout from "../../components/layouts/EmployeeLayout";
import useAuth from "../../hooks/useAuth";
import useVehicleZoneCounts from "../../hooks/useVehicleZoneCounts";
import { apiFetch } from "../../config/api";
import { deleteRiderDraft, listRiderDrafts } from "../../utils/riderDrafts";
import { listBatterySwaps } from "../../utils/batterySwaps";
import { getPaymentDueSummary, listPaymentDues } from "../../utils/paymentDues";
import { listOverdueRentals } from "../../utils/overdueRentals";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYY } from "../../utils/dateFormat";
import { formatElapsedMDHM } from "../../utils/durationFormat";

// --- HELPERS (Logic Intact) ---
const formatINR = (value) => {
  const n = Number(value || 0);
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(n);
  } catch {
    return `₹${Math.round(n)}`;
  }
};

const toDayKey = (value) => {
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  } catch {
    return "";
  }
};

const buildDailySeries = ({ rows, dateField, valueFn, days = 14 }) => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (days - 1));
  const buckets = new Map();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    buckets.set(d.toISOString(), 0);
  }
  (rows || []).forEach((r) => {
    const key = toDayKey(r?.[dateField]);
    if (!key || !buckets.has(key)) return;
    const v = Number(valueFn(r) || 0);
    buckets.set(key, (buckets.get(key) || 0) + v);
  });
  return Array.from(buckets.entries()).map(([k, v]) => ({
    day: formatDateDDMMYYYY(new Date(k), "-"),
    value: v,
  }));
};

const formatDateTime = (value) => formatDateTimeDDMMYYYY(value, "-");

const formatOverdueSince = (expectedEnd) => {
  if (!expectedEnd) return "-";
  const end = new Date(expectedEnd);
  if (Number.isNaN(end.getTime())) return "-";
  const now = new Date();
  const diffMs = now.getTime() - end.getTime();
  if (diffMs <= 0) return "0m";
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(" ");
};

const formatDuration = (startTime) => formatElapsedMDHM(startTime, "-");

const ZONE_COLORS = ["#3B82F6", "#6366F1", "#8B5CF6", "#A855F7", "#D946EF", "#EC4899"];

const highlightCell = (value, query) => {
  const text = String(value ?? "-");
  const q = String(query || "").trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <span className="bg-blue-100 text-blue-900 px-0.5 rounded font-medium">{text.slice(idx, idx + q.length)}</span>
      {text.slice(idx + q.length)}
    </>
  );
};

// --- MAIN DASHBOARD COMPONENT ---

export default function Dashboard() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { counts: zoneCounts, loading: zoneCountsLoading } = useVehicleZoneCounts();

  const DUE_PAGE_SIZE = 10;
  const SWAP_PAGE_SIZE = 10;
  const DRAFT_PAGE_SIZE = 5;

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsRow, setDetailsRow] = useState(null);

  const [drafts, setDrafts] = useState([]);
  const [draftsLoading, setDraftsLoading] = useState(false);
  const [draftPage, setDraftPage] = useState(1);

  const [swaps, setSwaps] = useState([]);
  const [swapsLoading, setSwapsLoading] = useState(false);
  const [swapPage, setSwapPage] = useState(1);

  const [dues, setDues] = useState([]);
  const [duesLoading, setDuesLoading] = useState(false);
  const [dueSummary, setDueSummary] = useState({ due_count: 0, due_total: 0 });

  const [overdueRentals, setOverdueRentals] = useState([]);
  const [overdueLoading, setOverdueLoading] = useState(false);
  const [overdueAlertDismissed, setOverdueAlertDismissed] = useState(false);
  const [activeRentals, setActiveRentals] = useState([]);
  const [activeLoading, setActiveLoading] = useState(false);
  const [banner, setBanner] = useState(null);
  const [duePage, setDuePage] = useState(1);
  const [dueFilter, setDueFilter] = useState("all");
  const [dueQuery, setDueQuery] = useState("");
  const [swapQuery, setSwapQuery] = useState("");

  // --- DATA LOADING LOGIC (Preserved) ---
  useEffect(() => {
    const loadDashboard = async () => {
      if (authLoading || !user?.uid) return;
      try {
        setBanner(null);
        setDraftsLoading(true); setSwapsLoading(true); setDuesLoading(true); setOverdueLoading(true);
        const [draftRows, swapRows, dueRows, dueSummaryRow, overdueRows] = await Promise.all([
          listRiderDrafts(),
          listBatterySwaps(),
          listPaymentDues(),
          getPaymentDueSummary(),
          listOverdueRentals(),
        ]);
        setDrafts(draftRows || []);
        setSwaps(swapRows || []);
        setDues(dueRows || []);
        setDueSummary(dueSummaryRow || { due_count: 0, due_total: 0 });
        setOverdueRentals(Array.isArray(overdueRows) ? overdueRows : []);
      } catch (e) {
        setBanner({ type: "error", message: e?.message || "Unable to load dashboard data." });
      } finally {
        setDraftsLoading(false); setSwapsLoading(false); setDuesLoading(false); setOverdueLoading(false);
      }
    };
    loadDashboard();
  }, [location.pathname, user?.uid, authLoading]);

  useEffect(() => {
    let mounted = true;
    const loadActiveRentals = async () => {
      if (!mounted) return;
      setActiveLoading(true);
      try {
        const rows = await apiFetch("/api/dashboard/active-rentals?limit=5");
        if (!mounted) return;
        setActiveRentals((Array.isArray(rows) ? rows : []).map((r) => ({
          id: r?.id,
          user: r?.full_name || "-",
          vehicle: r?.vehicle_number || "-",
          duration: formatDuration(r?.start_time),
          startLabel: formatDateTime(r?.start_time),
        })));
      } catch { setActiveRentals([]); } finally { if (mounted) setActiveLoading(false); }
    };
    loadActiveRentals();
    const interval = setInterval(loadActiveRentals, 15000);
    return () => { mounted = false; clearInterval(interval); };
  }, []);

  const handleContinueDraft = (draft) => {
    const stepPath = draft?.step_path || draft?.meta?.stepPath || "step-1";
    navigate(`/employee/new-rider/draft/${draft.id}/${stepPath}`);
  };

  const handleDeleteDraft = async (draftId) => {
    try {
      await deleteRiderDraft(draftId);
      setDrafts((prev) => prev.filter((d) => d.id !== draftId));
    } catch { /* ignore */ }
  };

  // --- DERIVED DATA & CHARTS (Preserved) ---
  const swapSeries = buildDailySeries({ rows: swaps, dateField: "swapped_at", valueFn: () => 1, days: 14 });
  const overdueCountTotal = overdueLoading ? 0 : (Array.isArray(overdueRentals) ? overdueRentals.length : 0);
  const paymentOverdueRows = (() => {
    const dRows = (dues || []).filter((d) => d?.status === "due");
    const oRows = (overdueRentals || []).map((r) => ({
      id: `overdue_${r?.rental_id || ""}`,
      rider_name: r?.rider_name || "-",
      rider_phone: r?.rider_phone || "-",
      amount_due: Number(r?.total_amount || 0),
      due_date: r?.expected_end_time || null,
      status: "overdue",
    }));
    return [...oRows, ...dRows];
  })();
  const dueTrendSeries = buildDailySeries({ rows: paymentOverdueRows, dateField: "due_date", valueFn: (row) => Number(row?.amount_due || 0), days: 14 });
  const swapVsDueSeries = useMemo(() => swapSeries.map((row, idx) => ({
    day: row.day,
    swaps: Number(row.value || 0),
    dueAmount: Number(dueTrendSeries[idx]?.value || 0),
  })), [swapSeries, dueTrendSeries]);

  const zoneChartData = useMemo(() => 
    Object.entries(zoneCounts || {}).map(([zone, value]) => ({ name: zone, value: Number(value || 0) }))
      .filter(r => r.value > 0).sort((a, b) => b.value - a.value).slice(0, 6)
  , [zoneCounts]);

  const filteredDueRows = useMemo(() => {
    const q = dueQuery.trim().toLowerCase();
    return paymentOverdueRows.filter((row) => {
      if (dueFilter !== "all" && String(row?.status || "").toLowerCase() !== dueFilter) return false;
      if (!q) return true;
      return [row?.rider_name, row?.rider_phone].some(v => String(v || "").toLowerCase().includes(q));
    });
  }, [paymentOverdueRows, dueFilter, dueQuery]);

  const duePageRows = filteredDueRows.slice((duePage - 1) * DUE_PAGE_SIZE, duePage * DUE_PAGE_SIZE);
  const duePageCount = Math.max(1, Math.ceil(filteredDueRows.length / DUE_PAGE_SIZE));

  const filteredSwapRows = useMemo(() => {
    const q = swapQuery.trim().toLowerCase();
    if (!q) return Array.isArray(swaps) ? swaps : [];
    return (Array.isArray(swaps) ? swaps : []).filter(row => 
      [row?.rider_full_name, row?.vehicle_number].some(v => String(v || "").toLowerCase().includes(q))
    );
  }, [swaps, swapQuery]);

  const swapPageRows = filteredSwapRows.slice((swapPage - 1) * SWAP_PAGE_SIZE, swapPage * SWAP_PAGE_SIZE);
  const swapPageCount = Math.max(1, Math.ceil(filteredSwapRows.length / SWAP_PAGE_SIZE));

  const draftPageRows = drafts.slice((draftPage - 1) * DRAFT_PAGE_SIZE, draftPage * DRAFT_PAGE_SIZE);

  return (
    <EmployeeLayout>
      <div className="flex flex-col min-h-screen bg-slate-50/50">
        
        {/* FLEET PARTNER HEADER PULSE */}
        <div className="sticky top-0 z-40 w-full bg-white border-b border-slate-200 shadow-sm">
          <div className="max-w-[1600px] mx-auto px-4 lg:px-8 py-4 flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="p-2.5 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-100">
                <Car size={24} />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">Fleet Operations</h1>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{user?.displayName || "Operator"}</p>
              </div>
            </div>

            <div className="flex flex-1 items-center justify-end gap-10">
              <div className="hidden sm:block">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Live Fleet</p>
                <div className="flex items-center gap-2">
                   <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                   <span className="text-lg font-bold text-slate-800">{zoneCountsLoading ? "..." : Object.values(zoneCounts || {}).reduce((a,b)=>a+Number(b),0)}</span>
                </div>
              </div>
              <div className="hidden sm:block">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Overdue Risk</p>
                <span className="text-lg font-bold text-rose-600">{overdueCountTotal}</span>
              </div>
              <button 
                onClick={() => navigate("/employee/new-rider/step-1")}
                className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all shadow-md active:scale-95"
              >
                <Plus size={18} />
                Add Rider
              </button>
            </div>
          </div>
        </div>

        {/* MAIN CONTENT CONTAINER (Full Width) */}
        <div className="max-w-[1600px] mx-auto w-full p-4 lg:p-8 space-y-8">

          {/* SECTION 1: VISUAL ANALYTICS (LINEAR) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Efficiency Chart */}
            <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6">
               <div className="flex items-center justify-between mb-6">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <TrendingUp size={16} className="text-blue-500" />
                    Fleet Efficiency (14D)
                  </h3>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-blue-500" />
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Swaps</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="h-2 w-2 rounded-full bg-slate-200" />
                      <span className="text-[10px] font-bold text-slate-500 uppercase">Dues</span>
                    </div>
                  </div>
               </div>
               <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={swapVsDueSeries}>
                      <defs>
                        <linearGradient id="fleetBlue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{fontSize: 10, fontWeight: 600, fill: '#94a3b8'}} />
                      <Tooltip contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'}} />
                      <Area type="monotone" dataKey="swaps" stroke="#3B82F6" strokeWidth={3} fill="url(#fleetBlue)" />
                      <Area type="monotone" dataKey="dueAmount" stroke="#cbd5e1" strokeWidth={2} fill="transparent" strokeDasharray="4 4" />
                    </AreaChart>
                  </ResponsiveContainer>
               </div>
            </div>

            {/* Asset Allocation */}
            <div className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col">
               <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2">
                 <MapPinned size={16} className="text-blue-500" />
                 Zone Allocation
               </h3>
               <div className="flex-1 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={zoneChartData} dataKey="value" nameKey="name" innerRadius={60} outerRadius={85} paddingAngle={5}>
                        {zoneChartData.map((_, i) => <Cell key={i} fill={ZONE_COLORS[i % ZONE_COLORS.length]} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
               </div>
               <div className="grid grid-cols-2 gap-2 mt-4">
                  {zoneChartData.slice(0, 4).map((z, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full" style={{backgroundColor: ZONE_COLORS[i]}} />
                      <span className="text-[10px] font-bold text-slate-500 uppercase truncate">{z.name}</span>
                    </div>
                  ))}
               </div>
            </div>
          </div>

          {/* SECTION 2: LIVE LOGS (FULL WIDTH SINGLE ROW) */}
          <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
            <div className="p-6 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
               <div>
                  <h3 className="text-base font-bold text-slate-900">Payment Reconciliation</h3>
                  <p className="text-xs font-medium text-slate-500">Track and settle rider accounts</p>
               </div>
               <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
                    {["all", "due", "overdue"].map((f) => (
                      <button 
                        key={f}
                        onClick={() => { setDueFilter(f); setDuePage(1); }}
                        className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all ${dueFilter === f ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input 
                      className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none w-64"
                      placeholder="Search rider or phone..."
                      value={dueQuery}
                      onChange={e => setDueQuery(e.target.value)}
                    />
                  </div>
               </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400 border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-4">Rider Information</th>
                    <th className="px-6 py-4">Account Status</th>
                    <th className="px-6 py-4">Amount Due</th>
                    <th className="px-6 py-4">Timeline</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {duePageRows.map((d, i) => (
                    <tr key={i} className="group hover:bg-slate-50/80 transition-colors cursor-pointer" onClick={() => {if(d.status==='overdue'){setDetailsRow(d); setDetailsOpen(true);}}}>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                           <div className="h-9 w-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-xs">
                              {d.rider_name?.[0]}
                           </div>
                           <div>
                              <p className="text-sm font-bold text-slate-800">{highlightCell(d.rider_name, dueQuery)}</p>
                              <p className="text-[10px] font-medium text-slate-400">{d.rider_phone}</p>
                           </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${d.status === 'overdue' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'}`}>
                          <div className={`h-1.5 w-1.5 rounded-full ${d.status === 'overdue' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                          {d.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-900">{formatINR(d.amount_due)}</td>
                      <td className="px-6 py-4 text-xs font-semibold text-slate-500">{formatDateDDMMYYYY(d.due_date, "/")}</td>
                      <td className="px-6 py-4 text-right">
                         <div className="flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                            <button className="p-2 text-slate-400 hover:text-blue-600"><ArrowUpRight size={18} /></button>
                         </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="p-4 bg-slate-50/50 flex items-center justify-between border-t border-slate-100">
               <span className="text-[10px] font-bold text-slate-400 uppercase">Viewing Page {duePage} of {duePageCount}</span>
               <div className="flex gap-2">
                  <button disabled={duePage===1} onClick={()=>setDuePage(p=>p-1)} className="p-2 rounded-lg bg-white border border-slate-200 hover:border-slate-300 disabled:opacity-30"><ChevronRight size={16} className="rotate-180" /></button>
                  <button disabled={duePage>=duePageCount} onClick={()=>setDuePage(p=>p+1)} className="p-2 rounded-lg bg-white border border-slate-200 hover:border-slate-300 disabled:opacity-30"><ChevronRight size={16} /></button>
               </div>
            </div>
          </div>

          {/* SECTION 3: BOTTOM OPERATIONS (FULL WIDTH) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
             {/* Battery Log */}
             <div className="bg-white rounded-[2rem] border border-slate-200 p-6 flex flex-col h-[500px]">
                <div className="flex items-center justify-between mb-6">
                   <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                     <BatteryCharging size={16} className="text-blue-600" />
                     Swap History
                   </h3>
                   <input 
                    className="px-4 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold w-40"
                    placeholder="Search Vehicle..."
                    value={swapQuery}
                    onChange={e => setSwapQuery(e.target.value)}
                  />
                </div>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                   <table className="w-full text-left">
                      <thead className="text-[9px] font-black text-slate-400 uppercase tracking-widest sticky top-0 bg-white">
                        <tr>
                          <th className="pb-4">Vehicle</th>
                          <th className="pb-4">Asset Flow</th>
                          <th className="pb-4 text-right">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {swapPageRows.map((s, i) => (
                          <tr key={i} className="hover:bg-slate-50/50">
                            <td className="py-4">
                              <p className="text-xs font-bold text-slate-800">{s.vehicle_number}</p>
                              <p className="text-[10px] font-medium text-slate-400 truncate w-32">{s.rider_full_name}</p>
                            </td>
                            <td className="py-4">
                               <div className="flex items-center gap-2 text-[10px] font-bold">
                                  <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded-md border border-rose-100">{s.battery_out}</span>
                                  <ChevronRight size={12} className="text-slate-300" />
                                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-md border border-emerald-100">{s.battery_in}</span>
                               </div>
                            </td>
                            <td className="py-4 text-right text-[10px] font-bold text-slate-400 uppercase">
                               {formatDateTime(s.swapped_at).split(' ')[1]}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                   </table>
                </div>
             </div>

             {/* Drafts & Active Session Container */}
             <div className="space-y-8 h-[500px]">
                {/* Onboarding Drafts */}
                <div className="bg-white rounded-[2rem] border border-slate-200 p-6">
                   <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2">
                     <FileText size={16} className="text-blue-600" />
                     Asset Onboarding
                   </h3>
                   <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {draftPageRows.slice(0, 4).map((d, i) => (
                        <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-slate-100 group transition-all hover:bg-white hover:border-blue-200 hover:shadow-md">
                           <div className="flex justify-between items-start mb-2">
                              <span className="px-2 py-0.5 bg-white text-[9px] font-bold text-slate-500 rounded-md uppercase border border-slate-200">{d.step_label || 'Step 1'}</span>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                 <button onClick={()=>handleContinueDraft(d)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg"><ArrowUpRight size={14} /></button>
                                 <button onClick={()=>handleDeleteDraft(d.id)} className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg"><Trash2 size={14} /></button>
                              </div>
                           </div>
                           <p className="text-xs font-bold text-slate-800 truncate">{d.name || "Untitled"}</p>
                           <p className="text-[10px] font-medium text-slate-400">{d.phone || "No Mobile"}</p>
                        </div>
                      ))}
                   </div>
                </div>

                {/* Live Sessions */}
                <div className="bg-white rounded-[2rem] border border-slate-200 p-6 flex-1">
                   <h3 className="text-sm font-bold text-slate-800 mb-6 flex items-center gap-2">
                     <Clock size={16} className="text-blue-600" />
                     Live Fleet Utilization
                   </h3>
                   <div className="space-y-4 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                      {activeRentals.map((r, i) => (
                        <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100/50">
                           <div className="flex items-center gap-3">
                              <div className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                              <div>
                                 <p className="text-xs font-bold text-slate-800">{r.user}</p>
                                 <p className="text-[10px] font-bold text-blue-600 tracking-tighter uppercase">{r.vehicle}</p>
                              </div>
                           </div>
                           <span className="text-xs font-black text-slate-900">{r.duration}</span>
                        </div>
                      ))}
                      {activeRentals.length === 0 && <div className="text-center py-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest">No Active Sessions</div>}
                   </div>
                </div>
             </div>
          </div>
        </div>

        {/* MODAL (Light Fleet Version) */}
        {detailsOpen && detailsRow && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 backdrop-blur-sm bg-slate-900/40">
             <div className="relative w-full max-w-sm overflow-hidden rounded-[2.5rem] bg-white shadow-2xl animate-in zoom-in-95 duration-200">
                <div className="bg-slate-900 p-8 text-white">
                   <div className="flex items-center justify-between mb-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Rider Insight</p>
                      <button onClick={() => setDetailsOpen(false)} className="text-white/60 hover:text-white"><Zap size={18} /></button>
                   </div>
                   <h3 className="text-2xl font-bold">{detailsRow.rider_name}</h3>
                   <p className="text-sm text-white/60 font-medium">{detailsRow.rider_phone}</p>
                </div>
                <div className="p-8 space-y-6">
                   <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                      <p className="text-[10px] font-black uppercase text-slate-400">Account Balance</p>
                      <p className="text-xl font-bold text-slate-900">{formatINR(detailsRow.amount_due)}</p>
                   </div>
                   <div className="flex justify-between items-center border-b border-slate-100 pb-4">
                      <p className="text-[10px] font-black uppercase text-slate-400">Due Timeline</p>
                      <p className="text-xs font-bold text-slate-700">{formatDateTime(detailsRow.due_date)}</p>
                   </div>
                   <button onClick={() => setDetailsOpen(false)} className="w-full rounded-2xl bg-blue-600 hover:bg-blue-700 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg shadow-blue-100 transition-all active:scale-95">
                     Acknowledge Risk
                   </button>
                </div>
             </div>
          </div>
        )}

      </div>
    </EmployeeLayout>
  );
}