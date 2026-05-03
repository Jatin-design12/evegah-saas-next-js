import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { 
  RefreshCw, 
  BatteryCharging, 
  History, 
  TrendingUp, 
  PieChart as PieIcon, 
  User, 
  Search,
  ChevronDown,
  Info,
  X
} from "lucide-react";

import EmployeeLayout from "../../../components/layouts/EmployeeLayout";
import useAuth from "../../../hooks/useAuth";
import {
  createBatterySwap,
  getBatteryUsage,
  listBatterySwaps,
} from "../../../utils/batterySwaps";
import { BATTERY_ID_OPTIONS } from "../../../utils/batteryIds";
import { filterVehicleIdGroups, flattenVehicleIdGroups } from "../../../utils/vehicleIds";
import { apiFetch } from "../../../config/api";
import { formatDateTimeDDMMYYYY } from "../../../utils/dateFormat";

const normalizeId = (value) => String(value || "").trim().toUpperCase();
const normalizeForCompare = (value) =>
  String(value || "").replace(/[^a-z0-9]+/gi, "").toUpperCase();

const bannerStyles = {
  success: "bg-emerald-50 border-emerald-100 text-emerald-700",
  warning: "bg-amber-50 border-amber-100 text-amber-700",
  info: "bg-blue-50 border-blue-100 text-blue-700",
  error: "bg-rose-50 border-rose-100 text-rose-700",
};

const PIE_COLORS = ["#10B981", "#6366F1", "#F59E0B", "#8B5CF6"];

function KpiCard({ label, value, helper, period, onPeriodChange, showPeriod, icon: Icon }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 transition-all hover:shadow-md">
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 text-slate-600 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600">
          {Icon && <Icon size={20} />}
        </div>
        {showPeriod && (
          <select
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500 outline-none focus:ring-2 focus:ring-indigo-500"
            value={period}
            onChange={(e) => onPeriodChange(e.target.value)}
          >
            <option value="day">Today</option>
            <option value="week">Weekly</option>
            <option value="month">Monthly</option>
          </select>
        )}
      </div>
      <div className="mt-4">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400">{label}</p>
        <div className="flex items-baseline gap-2">
          <p className="text-3xl font-black text-slate-900">{value}</p>
          {helper && <p className="text-[10px] font-medium text-slate-400">{helper}</p>}
        </div>
      </div>
    </div>
  );
}

export default function BatterySwaps() {
  const { user, loading } = useAuth();
  const [kpiPeriod, setKpiPeriod] = useState("day");
  const [rows, setRows] = useState([]);
  const [rowsLoading, setRowsLoading] = useState(false);
  const [usageRows, setUsageRows] = useState([]);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageQuery, setUsageQuery] = useState("");
  const [usageSort, setUsageSort] = useState("installs");
  const [selectedUsageBatteries, setSelectedUsageBatteries] = useState([]);
  const [usageBatteryDropdownOpen, setUsageBatteryDropdownOpen] = useState(false);
  const [usageBatteryFilterQuery, setUsageBatteryFilterQuery] = useState("");
  const RIDER_PAGE_SIZE = 5;
  const [riderPage, setRiderPage] = useState(1);
  const [riderDetailsOpen, setRiderDetailsOpen] = useState(false);
  const [riderDetailsLoading, setRiderDetailsLoading] = useState(false);
  const [riderDetails, setRiderDetails] = useState(null);
  const [riderSwapRows, setRiderSwapRows] = useState([]);
  const [form, setForm] = useState({ riderId: "", riderName: "", riderPhone: "", vehicleNumber: "", batteryOut: "", batteryIn: "", notes: "" });
  const [errors, setErrors] = useState({});
  const [banner, setBanner] = useState(null);
  const [activeVehicleIds, setActiveVehicleIds] = useState([]);
  const [unavailableBatteryIds, setUnavailableBatteryIds] = useState([]);
  const riderDropdownRef = useRef(null);
  const riderQueryRef = useRef(null);
  const vehicleDropdownRef = useRef(null);
  const vehicleQueryRef = useRef(null);
  const batteryOutDropdownRef = useRef(null);
  const batteryInDropdownRef = useRef(null);
  const batteryOutQueryRef = useRef(null);
  const batteryInQueryRef = useRef(null);
  const usageBatteryDropdownRef = useRef(null);
  const [riderOptions, setRiderOptions] = useState([]);
  const [riderLoading, setRiderLoading] = useState(true);
  const [riderQuery, setRiderQuery] = useState("");
  const [riderDropdownOpen, setRiderDropdownOpen] = useState(false);
  const [vehicleDropdownOpen, setVehicleDropdownOpen] = useState(false);
  const [vehicleQuery, setVehicleQuery] = useState("");
  const [batteryOutDropdownOpen, setBatteryOutDropdownOpen] = useState(false);
  const [batteryOutQuery, setBatteryOutQuery] = useState("");
  const [batteryInDropdownOpen, setBatteryInDropdownOpen] = useState(false);
  const [batteryInQuery, setBatteryInQuery] = useState("");

  const canLoad = useMemo(() => !loading && Boolean(user?.uid), [loading, user?.uid]);
  const activeVehicleSet = useMemo(() => new Set((Array.isArray(activeVehicleIds) ? activeVehicleIds : []).map(normalizeForCompare).filter(Boolean)), [activeVehicleIds]);
  const unavailableBatterySet = useMemo(() => new Set((Array.isArray(unavailableBatteryIds) ? unavailableBatteryIds : []).map(normalizeForCompare).filter(Boolean)), [unavailableBatteryIds]);

  const usageChartRows = useMemo(() => {
    const q = String(usageQuery || "").trim().toUpperCase();
    const selected = Array.isArray(selectedUsageBatteries) ? selectedUsageBatteries : [];
    const selectedSet = new Set(selected.map((v) => normalizeId(v)).filter(Boolean));
    const all = Array.isArray(usageRows) ? usageRows : [];
    const mapped = all.map((u) => {
      const installs = Number(u?.installs || 0);
      const removals = Number(u?.removals || 0);
      return { battery: String(u?.battery_id || "").toUpperCase(), installs, removals, total: installs + removals };
    });
    const filtered = q ? mapped.filter((r) => r.battery.includes(q)) : mapped;
    const filteredBySelection = selectedSet.size ? filtered.filter((r) => selectedSet.has(r.battery)) : filtered;
    const sorted = [...filteredBySelection].sort((a, b) => {
      if (usageSort === "removals") return b.removals - a.removals;
      if (usageSort === "total") return b.total - a.total;
      return b.installs - a.installs;
    });
    return sorted;
  }, [usageRows, usageQuery, usageSort, selectedUsageBatteries]);

  const usageBatteryOptions = useMemo(() => {
    const all = Array.isArray(usageRows) ? usageRows : [];
    return Array.from(new Set(all.map((u) => String(u?.battery_id || "").trim().toUpperCase()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [usageRows]);

  const filteredUsageBatteryOptions = useMemo(() => {
    const q = normalizeForCompare(usageBatteryFilterQuery);
    if (!q) return usageBatteryOptions;
    return usageBatteryOptions.filter((id) => normalizeForCompare(id).includes(q));
  }, [usageBatteryOptions, usageBatteryFilterQuery]);

  const toggleSelectedUsageBattery = (batteryId) => {
    const nextId = normalizeId(batteryId);
    if (!nextId) return;
    setSelectedUsageBatteries((prev) => prev.some((v) => normalizeId(v) === nextId) ? prev.filter((v) => normalizeId(v) !== nextId) : [...prev, nextId]);
  };

  const removeSelectedUsageBattery = (batteryId) => setSelectedUsageBatteries((prev) => prev.filter((v) => normalizeId(v) !== normalizeId(batteryId)));
  const clearSelectedUsageBatteries = () => { setSelectedUsageBatteries([]); setUsageBatteryFilterQuery(""); };
  const usageChartHeight = useMemo(() => Math.max(260, usageChartRows.length * 32), [usageChartRows.length]);

  const swapTrendRows = useMemo(() => {
    const end = new Date();
    const start = new Date(end.getFullYear(), end.getMonth(), end.getDate());
    start.setDate(start.getDate() - 13);
    const buckets = new Map();
    for (let i = 0; i < 14; i += 1) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    (rows || []).forEach((r) => {
      const d = r?.swapped_at ? new Date(r.swapped_at) : null;
      if (!d || Number.isNaN(d.getTime())) return;
      const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, Number(buckets.get(key)) + 1);
    });
    return Array.from(buckets.entries()).map(([dateKey, count]) => ({ day: dateKey.slice(5), swaps: count }));
  }, [rows]);

  const inOutPieData = useMemo(() => {
    const totals = (usageRows || []).reduce((acc, row) => {
      acc.installs += Number(row?.installs || 0);
      acc.removals += Number(row?.removals || 0);
      return acc;
    }, { installs: 0, removals: 0 });
    return [{ name: "IN", value: totals.installs }, { name: "OUT", value: totals.removals }];
  }, [usageRows]);

  const riderGroups = useMemo(() => {
    const all = Array.isArray(rows) ? rows : [];
    const map = new Map();
    for (const r of all) {
      const riderId = r?.rider_id ? String(r.rider_id) : "";
      const key = riderId || `v:${String(r?.vehicle_number || "")}`;
      const swappedAt = r?.swapped_at ? new Date(r.swapped_at).getTime() : 0;
      const prev = map.get(key);
      map.set(key, prev ? {
        ...prev, swapCount: prev.swapCount + 1, lastSwappedAtMs: Math.max(prev.lastSwappedAtMs, swappedAt),
        lastVehicle: swappedAt >= prev.lastSwappedAtMs ? r?.vehicle_number : prev.lastVehicle,
      } : {
        key, rider_id: riderId || null, rider_full_name: r?.rider_full_name || "N/A", rider_mobile: r?.rider_mobile || "N/A",
        swapCount: 1, lastSwappedAtMs: swappedAt, lastVehicle: r?.vehicle_number || "",
      });
    }
    return Array.from(map.values()).sort((a, b) => b.lastSwappedAtMs - a.lastSwappedAtMs)
      .map(g => ({ ...g, lastSwappedAt: g.lastSwappedAtMs ? new Date(g.lastSwappedAtMs).toISOString() : null }));
  }, [rows]);

  const riderTotal = riderGroups.length;
  const riderPageCount = Math.max(1, Math.ceil(riderTotal / RIDER_PAGE_SIZE));
  const riderPageRows = riderGroups.slice((riderPage - 1) * RIDER_PAGE_SIZE, riderPage * RIDER_PAGE_SIZE);

  const openRiderDetails = async (groupRow) => {
    setRiderDetails(groupRow); setRiderDetailsOpen(true); setRiderDetailsLoading(true);
    if (!groupRow.rider_id) { setRiderDetailsLoading(false); return; }
    try {
      const data = await apiFetch(`/api/riders/${encodeURIComponent(groupRow.rider_id)}/battery-swaps`);
      setRiderSwapRows(Array.isArray(data) ? data : []);
    } catch { setRiderSwapRows([]); } finally { setRiderDetailsLoading(false); }
  };

  const kpis = useMemo(() => {
    const all = Array.isArray(rows) ? rows : [];
    const now = new Date();
    const start = kpiPeriod === "day" ? new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() :
                  kpiPeriod === "week" ? now.getTime() - 7 * 86400000 : now.getTime() - 30 * 86400000;
    const periodRows = all.filter(r => new Date(r?.swapped_at).getTime() >= start);
    return {
      swapsInPeriod: periodRows.length,
      swapsTotal: all.length,
      uniqueVehicles: new Set(periodRows.map(r => r?.vehicle_number)).size,
      uniqueBatteries: new Set(periodRows.flatMap(r => [r?.battery_out, r?.battery_in])).size,
    };
  }, [rows, kpiPeriod]);

  useEffect(() => {
    setRiderLoading(true);
    apiFetch("/api/riders?limit=200")
      .then((res) => setRiderOptions(Array.isArray(res?.data) ? res.data : []))
      .catch(() => setRiderOptions([]))
      .finally(() => setRiderLoading(false));
  }, []);

  useEffect(() => {
    const onMouseDown = (e) => {
      if (riderDropdownOpen && !riderDropdownRef.current?.contains(e.target)) setRiderDropdownOpen(false);
      if (vehicleDropdownOpen && !vehicleDropdownRef.current?.contains(e.target)) setVehicleDropdownOpen(false);
      if (batteryOutDropdownOpen && !batteryOutDropdownRef.current?.contains(e.target)) setBatteryOutDropdownOpen(false);
      if (batteryInDropdownOpen && !batteryInDropdownRef.current?.contains(e.target)) setBatteryInDropdownOpen(false);
      if (usageBatteryDropdownOpen && !usageBatteryDropdownRef.current?.contains(e.target)) setUsageBatteryDropdownOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [riderDropdownOpen, vehicleDropdownOpen, batteryOutDropdownOpen, batteryInDropdownOpen, usageBatteryDropdownOpen]);

  const filteredVehicleGroups = useMemo(() => filterVehicleIdGroups(vehicleQuery), [vehicleQuery]);
  const activeOnlyVehicleGroups = useMemo(() => filteredVehicleGroups.map(g => ({
    ...g, ids: g.ids.filter(id => activeVehicleSet.has(normalizeForCompare(id)))
  })).filter(g => g.ids.length > 0), [filteredVehicleGroups, activeVehicleSet]);
  const filteredVehicleIds = useMemo(() => flattenVehicleIdGroups(activeOnlyVehicleGroups), [activeOnlyVehicleGroups]);

  const filteredBatteryOutIds = useMemo(() => batteryOutQuery ? BATTERY_ID_OPTIONS.filter(id => id.includes(batteryOutQuery.toUpperCase())) : BATTERY_ID_OPTIONS, [batteryOutQuery]);
  const filteredBatteryInIds = useMemo(() => {
    const available = BATTERY_ID_OPTIONS.filter(id => normalizeForCompare(id) !== normalizeForCompare(form.batteryOut) && !unavailableBatterySet.has(normalizeForCompare(id)));
    return batteryInQuery ? available.filter(id => id.includes(batteryInQuery.toUpperCase())) : available;
  }, [batteryInQuery, form.batteryOut, unavailableBatterySet]);

  const filteredRiders = useMemo(() => riderQuery ? riderOptions.filter(r => `${r.full_name} ${r.mobile}`.toLowerCase().includes(riderQuery.toLowerCase())) : riderOptions, [riderOptions, riderQuery]);

  const selectRider = async (rider) => {
    setForm(p => ({ ...p, riderId: rider.id, riderName: rider.full_name, riderPhone: rider.mobile.replace(/\D/g, "") }));
    setRiderDropdownOpen(false); setRiderQuery("");
    try {
      const active = await apiFetch(`/api/rentals/active?mobile=${rider.mobile}`);
      if (active) setForm(p => ({ ...p, vehicleNumber: normalizeId(active.vehicle_number), batteryOut: normalizeId(active.current_battery_id) }));
    } catch { setBanner({ type: "warning", message: "Manual selection required." }); }
  };

  const selectVehicleId = (id) => {
    setForm(p => ({ ...p, vehicleNumber: id })); setVehicleDropdownOpen(false);
    apiFetch(`/api/rentals/active?vehicle=${id}`).then(a => a && setForm(p => ({ ...p, batteryOut: normalizeId(a.current_battery_id || a.battery_id) })));
  };

  const loadAll = async () => {
    setRowsLoading(true); setUsageLoading(true);
    try {
      const [s, u] = await Promise.all([listBatterySwaps(), getBatteryUsage()]);
      setRows(s || []); setUsageRows(u || []);
    } catch (e) { setBanner({ type: "error", message: "Failed to load data." }); }
    finally { setRowsLoading(false); setUsageLoading(false); }
  };

  const loadLiveAvailability = async () => {
    try {
      const data = await apiFetch("/api/availability");
      setActiveVehicleIds(data?.unavailableVehicleIds || []);
      setUnavailableBatteryIds(data?.unavailableBatteryIds || []);
    } catch { setActiveVehicleIds([]); setUnavailableBatteryIds([]); }
  };

  useEffect(() => { if (canLoad) { loadAll(); loadLiveAvailability(); const i = setInterval(loadLiveAvailability, 15000); return () => clearInterval(i); } }, [canLoad]);

  const submit = async () => {
    if (!form.vehicleNumber || !form.batteryOut || !form.batteryIn) { setErrors({ vehicleNumber: !form.vehicleNumber ? "Required" : "", batteryOut: !form.batteryOut ? "Required" : "", batteryIn: !form.batteryIn ? "Required" : "" }); return; }
    try {
      const created = await createBatterySwap({ employee_uid: user.uid, employee_email: user.email, vehicle_number: form.vehicleNumber, battery_out: form.batteryOut, battery_in: form.batteryIn, notes: form.notes });
      setBanner({ type: "success", message: "Swap recorded." });
      setForm({ riderId: "", riderName: "", riderPhone: "", vehicleNumber: "", batteryOut: "", batteryIn: "", notes: "" });
      setRows(p => [created, ...p]);
      const usage = await getBatteryUsage(); setUsageRows(usage || []);
      loadLiveAvailability();
    } catch (e) { setBanner({ type: "error", message: e.message }); }
  };

  if (loading) return null;

  return (
    <EmployeeLayout>
      <div className="mx-auto max-w-[1600px] space-y-8 pb-10">
        
        {/* HEADER */}
        <div className="flex flex-col gap-4 border-b border-slate-100 bg-white/50 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">Battery Management</h1>
            <p className="text-sm font-medium text-slate-500">Live operational monitoring and swap registry.</p>
          </div>
          <button onClick={loadAll} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-600 shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors">
            <RefreshCw size={14} className={rowsLoading ? "animate-spin" : ""} />
            Refresh Data
          </button>
        </div>

        {banner && (
          <div className={`flex items-center gap-3 rounded-2xl border px-5 py-4 text-sm font-bold shadow-sm transition-all animate-in slide-in-from-top-2 ${bannerStyles[banner.type]}`}>
            <Info size={18} />
            {banner.message}
          </div>
        )}

        {/* KPI SECTION */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard label="Efficiency" value={kpis.swapsInPeriod} helper="Swaps" period={kpiPeriod} onPeriodChange={setKpiPeriod} showPeriod icon={BatteryCharging} />
          <KpiCard label="Lifetime" value={kpis.swapsTotal} helper="Swaps" icon={History} />
          <KpiCard label="Asset Load" value={kpis.uniqueVehicles} helper="Active E-bikes" icon={TrendingUp} />
          <KpiCard label="Inventory" value={kpis.uniqueBatteries} helper="Swapped Units" icon={PieIcon} />
        </div>

        <div className="grid grid-cols-1 items-start gap-8 xl:grid-cols-12">
          
          {/* LEFT COLUMN: SWAP FORM & RIDERS */}
          <div className="xl:col-span-7 space-y-8">
            
            {/* SWAP FORM */}
            <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
              <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400 mb-8">Registry Protocol</h2>
              
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div ref={riderDropdownRef} className="relative">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Rider Attribution</label>
                  <button onClick={() => setRiderDropdownOpen(!riderDropdownOpen)} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/50 px-5 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                    <span className="truncate">{form.riderName ? `${form.riderName}` : "Search Rider"}</span>
                    <ChevronDown size={16} className={`transition-transform ${riderDropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {riderDropdownOpen && (
                    <div className="absolute z-50 mt-2 w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl animate-in zoom-in-95">
                      <div className="relative mb-2">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input ref={riderQueryRef} autoFocus className="w-full rounded-xl border-none bg-slate-100 pl-9 pr-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Name or Phone..." value={riderQuery} onChange={e => setRiderQuery(e.target.value)} />
                      </div>
                      <div className="max-h-60 overflow-y-auto scrollbar-hide">
                        {filteredRiders.map(r => (
                          <button key={r.id} onClick={() => selectRider(r)} className="flex w-full flex-col rounded-xl px-4 py-2.5 text-left hover:bg-indigo-50 group">
                            <span className="text-xs font-bold text-slate-700 group-hover:text-indigo-700">{r.full_name}</span>
                            <span className="text-[10px] text-slate-400 font-medium group-hover:text-indigo-400">{r.mobile}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div ref={vehicleDropdownRef} className="relative">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Vehicle ID</label>
                  <button onClick={() => setVehicleDropdownOpen(!vehicleDropdownOpen)} className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50/50 px-5 py-3.5 text-sm font-bold text-slate-700 hover:bg-slate-50 transition-colors">
                    <span>{form.vehicleNumber || "Select Bike"}</span>
                    <ChevronDown size={16} />
                  </button>
                  {vehicleDropdownOpen && (
                    <div className="absolute z-50 mt-2 w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl animate-in zoom-in-95">
                      <input ref={vehicleQueryRef} autoFocus className="w-full rounded-xl border-none bg-slate-100 px-4 py-2 text-xs font-bold outline-none mb-2" placeholder="Bike number..." value={vehicleQuery} onChange={e => setVehicleQuery(e.target.value)} />
                      <div className="max-h-60 overflow-y-auto">
                        {activeOnlyVehicleGroups.map(g => (
                          <div key={g.label}>
                            <div className="px-4 py-2 text-[9px] font-black text-slate-300 uppercase tracking-[0.2em]">{g.label}</div>
                            {g.ids.map(id => (
                              <button key={id} onClick={() => selectVehicleId(id)} className="w-full rounded-xl px-4 py-2 text-left text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600">{id}</button>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Asset Removal (OUT)</label>
                  <input readOnly onClick={() => setBatteryOutDropdownOpen(true)} className="w-full rounded-2xl border border-slate-200 bg-rose-50/30 px-5 py-3.5 text-sm font-black text-rose-600 outline-none cursor-pointer" value={form.batteryOut} placeholder="Select Battery OUT" />
                  {batteryOutDropdownOpen && (
                    <div ref={batteryOutDropdownRef} className="absolute z-50 mt-2 w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                      <input autoFocus className="w-full rounded-xl border-none bg-slate-100 px-4 py-2 text-xs font-bold outline-none mb-2" value={batteryOutQuery} onChange={e => setBatteryOutQuery(e.target.value)} placeholder="Battery ID..." />
                      <div className="max-h-40 overflow-y-auto">
                        {filteredBatteryOutIds.map(id => <button key={id} onClick={() => { setForm(p => ({ ...p, batteryOut: id })); setBatteryOutDropdownOpen(false); }} className="w-full rounded-xl px-4 py-2 text-left text-xs font-bold text-slate-600 hover:bg-slate-50">{id}</button>)}
                      </div>
                    </div>
                  )}
                </div>

                <div className="relative">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-2 block">Asset Install (IN)</label>
                  <input readOnly onClick={() => setBatteryInDropdownOpen(true)} className="w-full rounded-2xl border border-slate-200 bg-emerald-50/30 px-5 py-3.5 text-sm font-black text-emerald-600 outline-none cursor-pointer" value={form.batteryIn} placeholder="Select Battery IN" />
                  {batteryInDropdownOpen && (
                    <div ref={batteryInDropdownRef} className="absolute z-50 mt-2 w-full rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
                      <input autoFocus className="w-full rounded-xl border-none bg-slate-100 px-4 py-2 text-xs font-bold outline-none mb-2" value={batteryInQuery} onChange={e => setBatteryInQuery(e.target.value)} placeholder="Battery ID..." />
                      <div className="max-h-40 overflow-y-auto">
                        {filteredBatteryInIds.map(id => <button key={id} onClick={() => { setForm(p => ({ ...p, batteryIn: id })); setBatteryInDropdownOpen(false); }} className="w-full rounded-xl px-4 py-2 text-left text-xs font-bold text-slate-600 hover:bg-slate-50">{id}</button>)}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-8 flex items-center gap-4">
                <input className="flex-1 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3.5 text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20" placeholder="Internal operational notes..." value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
                <button onClick={submit} className="rounded-2xl bg-slate-900 px-8 py-3.5 text-sm font-black uppercase tracking-widest text-white shadow-xl shadow-slate-200 hover:bg-slate-800 transition-all active:scale-95">Complete Swap</button>
              </div>
            </div>

            {/* RIDER RECORDS TABLE */}
            <div className="rounded-[2rem] border border-slate-200 bg-white overflow-hidden shadow-sm">
              <div className="p-8 border-b border-slate-50">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Rider Swap Frequency</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50/50 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                    <tr>
                      <th className="px-8 py-4">Rider Identity</th>
                      <th className="px-4 py-4">Count</th>
                      <th className="px-4 py-4">Vehicle</th>
                      <th className="px-8 py-4 text-right">Last Session</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {riderPageRows.map((g, i) => (
                      <tr key={g.key} onClick={() => g.rider_id && openRiderDetails(g)} className={`group transition-colors hover:bg-slate-50 ${g.rider_id ? 'cursor-pointer' : ''}`}>
                        <td className="px-8 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 font-bold text-[10px]">{g.rider_full_name[0]}</div>
                            <div>
                              <p className="font-bold text-slate-700">{g.rider_full_name}</p>
                              <p className="text-[10px] text-slate-400">{g.rider_mobile}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4"><span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600 uppercase tracking-tighter">{g.swapCount} Swaps</span></td>
                        <td className="px-4 py-4 font-black text-indigo-600 text-xs">{g.lastVehicle}</td>
                        <td className="px-8 py-4 text-right font-medium text-slate-400 text-[10px] uppercase">{g.lastSwappedAt ? formatDateTimeDDMMYYYY(g.lastSwappedAt, "/") : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between bg-slate-50/50 px-8 py-4 border-t border-slate-100">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Page {riderPage} of {riderPageCount}</p>
                <div className="flex gap-2">
                  <button disabled={riderPage === 1} onClick={() => setRiderPage(p => p - 1)} className="rounded-lg border border-slate-200 bg-white p-1.5 hover:bg-slate-50 disabled:opacity-30 transition-colors">
                    <ChevronDown size={14} className="rotate-90" />
                  </button>
                  <button disabled={riderPage >= riderPageCount} onClick={() => setRiderPage(p => p + 1)} className="rounded-lg border border-slate-200 bg-white p-1.5 hover:bg-slate-50 disabled:opacity-30 transition-colors">
                    <ChevronDown size={14} className="-rotate-90" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: ANALYTICS */}
          <div className="xl:col-span-5 space-y-8">
            
            {/* MOST USED BATTERIES (CHART) */}
            <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
              <div className="flex items-center justify-between mb-8">
                <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-400">Asset Velocity</h3>
                <div className="flex gap-2">
                  <select value={usageSort} onChange={e => setUsageSort(e.target.value)} className="rounded-lg bg-slate-50 border-none px-3 py-1.5 text-[10px] font-bold text-slate-500 outline-none uppercase tracking-wider">
                    <option value="installs">IN Load</option>
                    <option value="removals">OUT Load</option>
                  </select>
                </div>
              </div>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={usageChartRows.slice(0, 10)} layout="vertical" margin={{ left: -10 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="battery" width={80} tick={{ fontSize: 9, fontWeight: 700, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                    <Bar dataKey="installs" stackId="a" fill="#10B981" radius={[0, 0, 0, 0]} barSize={12} />
                    <Bar dataKey="removals" stackId="a" fill="#6366F1" radius={[0, 4, 4, 0]} barSize={12} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* BOTTOM CHARTS GRID */}
            <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-6">Swaps Trend (14D)</h3>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={swapTrendRows}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="day" hide />
                      <YAxis hide />
                      <Tooltip />
                      <Line type="monotone" dataKey="swaps" stroke="#6366F1" strokeWidth={4} dot={{ r: 4, fill: '#6366F1', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
                <h3 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 mb-6">Battery Flow Mix</h3>
                <div className="h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={inOutPieData} innerRadius={60} outerRadius={85} paddingAngle={8} dataKey="value">
                        {inOutPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} strokeWidth={0} />)}
                      </Pie>
                      <Tooltip />
                      <Legend verticalAlign="bottom" iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIDER DETAILS MODAL */}
      {riderDetailsOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-4xl rounded-[2.5rem] bg-white shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="bg-slate-900 p-8 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400 mb-1">Rider Audit Log</p>
                  <h3 className="text-2xl font-black">{riderDetails?.rider_full_name}</h3>
                </div>
                <button onClick={() => setRiderDetailsOpen(false)} className="rounded-full bg-white/10 p-2 hover:bg-white/20 transition-colors">
                  <X size={20} />
                </button>
              </div>
            </div>
            <div className="p-8">
              <div className="max-h-[50vh] overflow-y-auto rounded-2xl border border-slate-100 scrollbar-hide">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-400">
                    <tr>
                      <th className="px-6 py-4">Bike</th>
                      <th className="px-6 py-4">Battery Log</th>
                      <th className="px-6 py-4 text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {riderSwapRows.map((r) => (
                      <tr key={r.id}>
                        <td className="px-6 py-4 font-bold text-slate-700">{r.vehicle_number}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-rose-500 font-bold">{r.battery_out}</span>
                            <ChevronDown size={12} className="-rotate-90 text-slate-300" />
                            <span className="text-emerald-500 font-bold">{r.battery_in}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right text-[10px] font-bold text-slate-400">{formatDateTimeDDMMYYYY(r.swapped_at, "/")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-8 flex justify-end">
                <button onClick={() => setRiderDetailsOpen(false)} className="rounded-xl bg-slate-100 px-6 py-2.5 text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-200 transition-colors">Close Record</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </EmployeeLayout>
  );
}