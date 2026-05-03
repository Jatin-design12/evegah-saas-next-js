import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Bike,
  Gauge,
  IndianRupee,
  MapPinned,
  PackageCheck,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Circle, MapContainer, Marker, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import { apiFetch } from "../../config/api";
import { listAdminZones } from "../../utils/adminZones";

const PIE_COLORS = ["#2563eb", "#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444", "#0ea5e9"];
const MAP_FALLBACK_CENTER = [22.3072, 73.1812];

const liveMarkerIconCache = new Map();

function getLiveMarkerIcon(rawColor) {
  const safeColor = /^#([0-9a-f]{6})$/i.test(String(rawColor || "").trim())
    ? String(rawColor || "").trim()
    : "#2563eb";

  if (liveMarkerIconCache.has(safeColor)) return liveMarkerIconCache.get(safeColor);

  const marker = new L.DivIcon({
    className: "",
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    html: `<span style="display:block;width:14px;height:14px;border-radius:9999px;background:${safeColor};border:2px solid #ffffff;box-shadow:0 0 0 8px ${safeColor}22,0 4px 10px rgba(15,23,42,0.22);"></span>`,
  });

  liveMarkerIconCache.set(safeColor, marker);
  return marker;
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [summary, setSummary] = useState({
    totalRiders: 0,
    totalRentals: 0,
    revenue: 0,
    activeRides: 0,
  });
  const [analyticsSeries, setAnalyticsSeries] = useState([]);
  const [returnsData, setReturnsData] = useState([]);
  const [recentReturns, setRecentReturns] = useState([]);
  const [rentalsByPackageData, setRentalsByPackageData] = useState([]);
  const [rentalsByZoneData, setRentalsByZoneData] = useState([]);
  const [liveZones, setLiveZones] = useState([]);
  const [timeRange, setTimeRange] = useState("6months");

  const inr = useMemo(
    () => new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }),
    []
  );

  useEffect(() => {
    let mounted = true;

    const parseMaybeJson = (value) => {
      if (!value) return null;
      if (typeof value === "object") return value;
      if (typeof value !== "string") return null;
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    };

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [summaryRes, analyticsRes, returnsSeries, returnsRows, packageSeries, zoneSeries, zonesMapData] =
          await Promise.all([
            apiFetch("/api/dashboard/summary"),
            apiFetch(
              `/api/dashboard/analytics-months?range=${encodeURIComponent(timeRange)}&months=${
                timeRange === "6months" ? 6 : 1
              }`
            ),
            apiFetch("/api/dashboard/returns-week"),
            apiFetch("/api/returns"),
            apiFetch("/api/dashboard/rentals-by-package?days=30"),
            apiFetch("/api/dashboard/rentals-by-zone?days=30"),
            listAdminZones(),
          ]);

        if (!mounted) return;

        setSummary({
          totalRiders: Number(summaryRes?.totalRiders || 0),
          totalRentals: Number(summaryRes?.totalRentals || 0),
          revenue: Number(summaryRes?.revenue || 0),
          activeRides: Number(summaryRes?.activeRides || 0),
        });

        setAnalyticsSeries(Array.isArray(analyticsRes) ? analyticsRes : []);
        setReturnsData(Array.isArray(returnsSeries) ? returnsSeries : []);
        setRentalsByPackageData(Array.isArray(packageSeries) ? packageSeries : []);
        setRentalsByZoneData(Array.isArray(zoneSeries) ? zoneSeries : []);
        setLiveZones(Array.isArray(zonesMapData) ? zonesMapData : []);

        const list = Array.isArray(returnsRows) ? returnsRows : [];
        const mapped = list.slice(0, 6).map((r) => {
          const meta = parseMaybeJson(r?.return_meta) || r?.return_meta || {};
          const feedback = meta && typeof meta === "object" ? meta.feedback : "";
          return {
            return_id: r?.return_id,
            rental_id: r?.rental_id,
            returned_at: r?.returned_at,
            condition_notes: r?.condition_notes,
            feedback: feedback || "",
            bike_id: r?.bike_id,
            vehicle_number: r?.vehicle_number,
            rider_full_name: r?.rider_full_name,
            rider_mobile: r?.rider_mobile,
          };
        });
        setRecentReturns(mapped);
      } catch (e) {
        if (!mounted) return;
        setError(String(e?.message || e || "Unable to load dashboard"));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [timeRange]);

  const trendSeries = useMemo(() => {
    return (analyticsSeries || []).map((row, idx) => ({
      label: String(row?.label || row?.month || `M${idx + 1}`),
      revenue: Number(row?.revenue || 0),
      rentals: Number(row?.rentals || 0),
      deposit: Number(row?.deposit || 0),
    }));
  }, [analyticsSeries]);

  const zoneDonutData = useMemo(() => {
    return (rentalsByZoneData || []).map((row) => ({
      name: String(row?.zone || "-"),
      value: Number(row?.rentals || 0),
    }));
  }, [rentalsByZoneData]);

  const packageDonutData = useMemo(() => {
    return (rentalsByPackageData || []).map((row) => ({
      name: String(row?.package || "-"),
      value: Number(row?.rentals || 0),
    }));
  }, [rentalsByPackageData]);

  const riderActivePct = useMemo(() => {
    if (!summary.totalRiders) return 0;
    return Math.round((summary.activeRides / summary.totalRiders) * 100);
  }, [summary.activeRides, summary.totalRiders]);

  const perfRadarData = useMemo(() => {
    const zoneCoverage = Math.min(100, zoneDonutData.length * 16);
    const packageSpread = Math.min(100, packageDonutData.length * 20);
    const returnPulse = Math.min(
      100,
      (returnsData || []).reduce((acc, row) => acc + Number(row?.returns || 0), 0) * 4
    );
    const revenuePulse = Math.min(100, Math.round(summary.revenue / 8000));
    const riderHealth = Math.min(100, riderActivePct);

    return [
      { metric: "Riders", value: riderHealth },
      { metric: "Revenue", value: revenuePulse },
      { metric: "Zones", value: zoneCoverage },
      { metric: "Packages", value: packageSpread },
      { metric: "Returns", value: returnPulse },
    ];
  }, [zoneDonutData.length, packageDonutData.length, returnsData, summary.revenue, riderActivePct]);

  const mixSeries = useMemo(() => {
    const maxLen = Math.max(trendSeries.length, returnsData.length);
    return Array.from({ length: maxLen }, (_v, i) => ({
      bucket: trendSeries[i]?.label || returnsData[i]?.day || `P${i + 1}`,
      rentals: Number(trendSeries[i]?.rentals || 0),
      returns: Number(returnsData[i]?.returns || 0),
    }));
  }, [trendSeries, returnsData]);

  const mapPoints = useMemo(() => {
    return (liveZones || [])
      .map((zone) => ({
        id: Number(zone?.id || 0),
        name: String(zone?.zone_name || zone?.zone_code || "Zone"),
        lat: Number(zone?.latitude),
        lng: Number(zone?.longitude),
        color: String(zone?.color || "#2563eb"),
        activeRides: Number(zone?.active_rides || 0),
      }))
      .filter((zone) => Number.isFinite(zone.lat) && Number.isFinite(zone.lng));
  }, [liveZones]);

  const mapCenter = useMemo(() => {
    if (!mapPoints.length) return MAP_FALLBACK_CENTER;
    const sum = mapPoints.reduce(
      (acc, zone) => {
        acc.lat += zone.lat;
        acc.lng += zone.lng;
        return acc;
      },
      { lat: 0, lng: 0 }
    );
    return [sum.lat / mapPoints.length, sum.lng / mapPoints.length];
  }, [mapPoints]);

  const hotspot = useMemo(() => {
    if (!mapPoints.length) return null;
    const ranked = [...mapPoints].sort((a, b) => b.activeRides - a.activeRides);
    return ranked[0] || null;
  }, [mapPoints]);

  const summaryMomentum = useMemo(() => {
    const first = trendSeries[0] || null;
    const last = trendSeries[trendSeries.length - 1] || null;

    return {
      revenue: getPercentChange(Number(first?.revenue || 0), Number(last?.revenue || 0)),
      rentals: getPercentChange(Number(first?.rentals || 0), Number(last?.rentals || 0)),
    };
  }, [trendSeries]);

  const recentActivityRows = useMemo(() => {
    return recentReturns.slice(0, 5).map((row, idx) => ({
      key: String(row?.return_id || row?.rental_id || idx),
      title: row?.rider_full_name || row?.vehicle_number || row?.bike_id || "Recent return",
      subtitle: row?.bike_id || row?.vehicle_number || row?.rider_mobile || "Checked in",
      badge: row?.returned_at ? new Date(row.returned_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Now",
      badgeClass: idx % 2 === 0 ? "bg-emerald-50 text-emerald-700" : "bg-sky-50 text-sky-700",
    }));
  }, [recentReturns]);

  const activityFeed = useMemo(() => {
    const topZoneLabel = hotspot?.name || "No live zone";
    const topPackageLabel = packageDonutData[0]?.name || "No package data";

    return [
      {
        title: "User confirmation",
        time: "Live",
        dot: "bg-sky-500",
        description: `${summary.totalRiders.toLocaleString()} riders are registered and ${riderActivePct}% are currently active.`,
      },
      {
        title: "Continuous evaluation",
        time: "15m",
        dot: "bg-violet-500",
        description: `${summary.totalRentals.toLocaleString()} rentals processed with ${recentReturns.length} recent returns in the queue.`,
      },
      {
        title: "Promotion",
        time: "Today",
        dot: "bg-amber-500",
        description: `${topZoneLabel} is the busiest live zone and ${topPackageLabel} is the strongest package segment.`,
      },
    ];
  }, [hotspot?.name, packageDonutData, recentReturns.length, riderActivePct, summary.totalRentals, summary.totalRiders]);

  const sparkRevenueData = useMemo(
    () =>
      trendSeries.slice(-6).map((row, idx) => ({
        label: row.label || `M${idx + 1}`,
        value: Number(row.revenue || 0),
      })),
    [trendSeries]
  );

  const sparkRentalData = useMemo(
    () =>
      trendSeries.slice(-6).map((row, idx) => ({
        label: row.label || `M${idx + 1}`,
        value: Number(row.rentals || 0),
      })),
    [trendSeries]
  );

  const sparkZoneData = useMemo(
    () =>
      mapPoints.slice(0, 6).map((row, idx) => ({
        label: row.name || `Z${idx + 1}`,
        value: Number(row.activeRides || 0) + idx + 1,
      })),
    [mapPoints]
  );

  const sparkReturnData = useMemo(
    () =>
      mixSeries.slice(-6).map((row, idx) => ({
        label: row.bucket || `P${idx + 1}`,
        value: Number(row.returns || 0),
      })),
    [mixSeries]
  );

  const completionRows = useMemo(
    () => [
      { label: "Create", value: Math.min(100, Math.round(summary.totalRiders / 8) || 0), gradient: "from-sky-500 to-cyan-400" },
      { label: "Update", value: Math.min(100, riderActivePct + 18), gradient: "from-emerald-500 to-teal-400" },
      { label: "Send", value: Math.min(100, recentReturns.length * 14), gradient: "from-amber-500 to-orange-400" },
      { label: "Debug", value: Math.min(100, Math.round(summary.revenue / 1200)), gradient: "from-violet-500 to-fuchsia-400" },
      { label: "Check", value: Math.min(100, mapPoints.length * 17), gradient: "from-slate-500 to-slate-300" },
    ],
    [mapPoints.length, recentReturns.length, riderActivePct, summary.revenue, summary.totalRiders]
  );

  const taskRows = useMemo(
    () => [
      { label: "Launch New Portfolio", done: false, time: "7:00" },
      { label: "Design Client Website", done: true, time: "1:00" },
      { label: "Develop Client Website", done: false, time: "8:00" },
      { label: "Begin Digital Marketing", done: true, time: "5:00" },
      { label: "Deploy to Staging Server", done: true, time: "2:00" },
      { label: "Client Feedback Review", done: true, time: "10:00" },
    ],
    []
  );

  const storageData = useMemo(
    () => [
      { name: "Live zones", value: Math.max(1, mapPoints.length) },
      { name: "Active riders", value: Math.max(1, summary.activeRides) },
      { name: "Recent returns", value: Math.max(1, recentReturns.length) },
    ],
    [mapPoints.length, recentReturns.length, summary.activeRides]
  );

  const storageLegend = useMemo(
    () => [
      { label: "Live zones", value: mapPoints.length || 0 },
      { label: "Active riders", value: riderActivePct || 0 },
    ],
    [mapPoints.length, riderActivePct]
  );

  const bottomSummaryCards = useMemo(
    () => [
      { label: "Revenue month", value: `₹${inr.format(summary.revenue)}`, icon: IndianRupee, iconBg: "bg-sky-50 text-sky-700" },
      { label: "Spend month", value: inr.format(summary.totalRentals), icon: Bike, iconBg: "bg-emerald-50 text-emerald-700" },
      { label: "Report submit", value: inr.format(recentReturns.length), icon: PackageCheck, iconBg: "bg-violet-50 text-violet-700" },
      { label: "New tasks", value: inr.format(taskRows.filter((task) => !task.done).length), icon: Users, iconBg: "bg-cyan-50 text-cyan-700" },
      { label: "Completed tasks", value: inr.format(taskRows.filter((task) => task.done).length), icon: Gauge, iconBg: "bg-amber-50 text-amber-700" },
      { label: "Ongoing projects", value: inr.format(Math.max(1, mapPoints.length)), icon: MapPinned, iconBg: "bg-rose-50 text-rose-700" },
    ],
    [inr, mapPoints.length, recentReturns.length, summary.revenue, summary.totalRentals, taskRows]
  );

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#f4f7fb] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.10),transparent_32%),radial-gradient(circle_at_top_right,rgba(37,99,235,0.09),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#f4f7fb_38%,#eef4fb_100%)]" />
      <div className="relative z-10 flex min-h-screen w-full">
        <AdminSidebar />
        <div className="flex-1 min-w-0 overflow-y-auto sm:ml-[var(--admin-sidebar-width,16rem)]">
          <AdminTopbar title="General" subtitle="Widgets / general dashboard overview" />

          <div className="px-4 pb-10 pt-6 sm:px-6 lg:px-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">General</h1>
                <p className="mt-1 text-sm text-slate-500">Vehicle, zone, battery and rider performance in one view.</p>
              </div>
              <div className="hidden items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-2 text-xs font-medium text-slate-500 shadow-sm backdrop-blur sm:flex">
                <span className="text-slate-400">⌂</span>
                <span>/</span>
                <span>Widgets</span>
                <span>/</span>
                <span className="text-sky-600">General</span>
              </div>
            </div>

            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-sky-100 bg-white/80 px-4 py-2 text-sm text-slate-500 shadow-sm backdrop-blur">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-sky-400" />
              Don&apos;t Miss Out! Our new update has been released.
              <span className="text-slate-400">👋</span>
            </div>

            {error ? (
              <div className="mb-6 rounded-3xl border border-red-200 bg-red-50 p-5 shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="grid h-11 w-11 place-items-center rounded-2xl bg-red-100 text-red-600">
                    <AlertCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-red-800">Failed to load dashboard</h3>
                    <p className="text-red-600">Try again in a few seconds.</p>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                title="Stocks"
                value={`₹${inr.format(summary.revenue)}`}
                delta={`${summaryMomentum.revenue >= 0 ? "+" : ""}${summaryMomentum.revenue}% / month`}
                tone="sky"
                icon={IndianRupee}
              />
              <MetricCard
                title="Bonds"
                value={inr.format(summary.totalRentals)}
                delta={`${summaryMomentum.rentals >= 0 ? "+" : ""}${summaryMomentum.rentals}% / month`}
                tone="violet"
                icon={Bike}
              />
              <MetricCard
                title="Crypto"
                value={inr.format(summary.totalRiders)}
                delta={`${riderActivePct}% active riders`}
                tone="cyan"
                icon={Users}
              />
              <MetricCard
                title="ETFs"
                value={inr.format(summary.activeRides)}
                delta={`${mapPoints.length} live zones`}
                tone="amber"
                icon={Gauge}
              />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
              <PanelCard className="xl:col-span-4" title="Latest Activity" action={<span className="text-xs font-semibold text-slate-400">...</span>}>
                <div className="space-y-4">
                  {loading ? (
                    <p className="text-sm text-slate-500">Loading recent activity...</p>
                  ) : recentActivityRows.length ? (
                    recentActivityRows.map((item) => (
                      <div key={item.key} className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">{item.title}</p>
                          <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${item.badgeClass}`}>{item.badge}</span>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">No recent returns found.</p>
                  )}
                </div>
              </PanelCard>

              <PanelCard className="xl:col-span-4" title="Activities" action={<span className="text-xs font-semibold text-slate-400">...</span>}>
                <div className="space-y-4">
                  {activityFeed.map((item) => (
                    <div key={item.title} className="flex items-start gap-3">
                      <div className={`mt-1 h-2.5 w-2.5 rounded-full ${item.dot}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-800">{item.title}</p>
                          <span className="text-xs text-slate-400">{item.time}</span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </PanelCard>

              <PanelCard className="xl:col-span-4" title="Project Statistics" action={<span className="text-xs font-semibold text-slate-400">...</span>}>
                <div className="mb-4 flex items-center gap-2 text-xs text-slate-500">
                  <span className="inline-flex h-2.5 w-2.5 rounded-full bg-sky-500" />
                  Revenue and rental trend over the selected range
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={trendSeries.slice(-7)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: "#64748b", fontSize: 12 }} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="rentals" name="Rentals" fill="#0ea5e9" radius={[8, 8, 0, 0]} />
                    <Bar dataKey="revenue" name="Revenue" fill="#a78bfa" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </PanelCard>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
              <MiniInsightCard
                title="App Development"
                subtitle="Marketing Team · 1 week left"
                accent="sky"
                data={sparkRevenueData}
                value={`₹${inr.format(summary.revenue)}`}
                meta={`${mapPoints.length} live zones`}
              />
              <MiniInsightCard
                title="Web Design"
                subtitle="Core UI Team · 2 days left"
                accent="violet"
                data={sparkRentalData}
                value={inr.format(summary.totalRentals)}
                meta="Rental throughput"
              />
              <MiniInsightCard
                title="Business Compare"
                subtitle="Operations · 1 month left"
                accent="cyan"
                data={sparkZoneData}
                value={inr.format(summary.totalRiders)}
                meta="Rider base"
              />
              <MiniInsightCard
                title="Commerce Checkout"
                subtitle="Order Process Team · 3 weeks left"
                accent="amber"
                data={sparkReturnData}
                value={inr.format(summary.activeRides)}
                meta={`${recentReturns.length} recent returns`}
              />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
              <PanelCard className="xl:col-span-5" title="Project Completion" action={<span className="text-xs font-semibold text-slate-400">...</span>}>
                <div className="space-y-4">
                  {completionRows.map((row) => (
                    <div key={row.label}>
                      <div className="mb-1.5 flex items-center justify-between gap-4 text-sm">
                        <span className="font-medium text-slate-700">{row.label}</span>
                        <span className="text-xs font-semibold text-slate-500">{row.value}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100">
                        <div
                          className={`h-2 rounded-full bg-gradient-to-r ${row.gradient}`}
                          style={{ width: `${row.value}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </PanelCard>

              <PanelCard className="xl:col-span-4" title="Tasks" action={<span className="text-xs font-semibold text-slate-400">...</span>}>
                <div className="space-y-3">
                  {taskRows.map((task) => (
                    <label key={task.label} className="flex items-center gap-3 rounded-2xl border border-slate-100 px-3 py-2.5 hover:bg-slate-50">
                      <input type="checkbox" checked={task.done} readOnly className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600" />
                      <span className={`flex-1 text-sm ${task.done ? "text-slate-400 line-through" : "text-slate-700"}`}>{task.label}</span>
                      <span className="text-xs font-semibold text-slate-400">{task.time}</span>
                    </label>
                  ))}
                </div>
              </PanelCard>

              <PanelCard className="xl:col-span-3" title="Server Storage" action={<span className="text-xs font-semibold text-slate-400">...</span>}>
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie data={storageData} dataKey="value" nameKey="name" innerRadius={58} outerRadius={92} paddingAngle={3}>
                      {storageData.map((_, idx) => (
                        <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3 text-center text-xs text-slate-500">
                  {storageLegend.map((item) => (
                    <div key={item.label}>
                      <div className="font-semibold text-slate-900">{item.value}</div>
                      <div>{item.label}</div>
                    </div>
                  ))}
                </div>
              </PanelCard>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-6">
              {bottomSummaryCards.map((card) => (
                <div key={card.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className={`grid h-9 w-9 place-items-center rounded-2xl ${card.iconBg}`}>
                      <card.icon size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-xs text-slate-500">{card.label}</p>
                      <p className="truncate text-lg font-semibold text-slate-900">{card.value}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-12">
              <PanelCard className="xl:col-span-7" title="Live Tracking" action={<Link to="/admin/zones" className="text-xs font-semibold text-sky-600 hover:text-sky-700">See All</Link>}>
                <div className="h-[320px] overflow-hidden rounded-2xl border border-slate-200">
                  <MapContainer center={mapCenter} zoom={12} className="h-full w-full" scrollWheelZoom={false}>
                    <TileLayer
                      attribution='&copy; OpenStreetMap contributors &copy; CARTO'
                      url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                    />

                    {mapPoints.map((zone) => (
                      <Marker key={`${zone.id}-${zone.name}`} position={[zone.lat, zone.lng]} icon={getLiveMarkerIcon(zone.color)} />
                    ))}

                    {hotspot ? (
                      <>
                        <Circle
                          center={[hotspot.lat, hotspot.lng]}
                          radius={500}
                          pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.06, weight: 1.5 }}
                        />
                        <Circle
                          center={[hotspot.lat, hotspot.lng]}
                          radius={220}
                          pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.12, weight: 1.5 }}
                        />
                      </>
                    ) : null}
                  </MapContainer>
                </div>
              </PanelCard>

              <PanelCard className="xl:col-span-5" title="Recent Returns" action={<span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-500">Latest</span>}>
                <div className="space-y-3">
                  {loading ? (
                    <p className="text-sm text-slate-500">Loading recent returns...</p>
                  ) : recentReturns.length === 0 ? (
                    <p className="text-sm text-slate-500">No recent returns found.</p>
                  ) : (
                    recentReturns.map((r) => (
                      <div key={String(r?.return_id || r?.rental_id || "")} className="rounded-2xl border border-slate-100 px-4 py-3">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-sm font-semibold text-slate-800">{r?.rider_full_name || "-"}</p>
                            <p className="text-xs text-slate-500">{r?.bike_id || r?.vehicle_number || "-"}</p>
                          </div>
                          <span className="text-xs text-slate-400">{r?.returned_at ? new Date(r.returned_at).toLocaleDateString() : "-"}</span>
                        </div>
                        <p className="mt-2 text-xs leading-5 text-slate-500">{r?.condition_notes ? String(r.condition_notes) : "Return checked and updated."}</p>
                      </div>
                    ))
                  )}
                </div>
              </PanelCard>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
              <PanelCard title="Operational Performance Radar" action={<span className="text-xs font-semibold text-slate-400">...</span>}>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={perfRadarData}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="metric" tick={{ fill: "#64748b", fontSize: 11 }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fill: "#94a3b8", fontSize: 10 }} />
                    <Radar dataKey="value" stroke="#2563eb" fill="#2563eb" fillOpacity={0.25} />
                    <Tooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </PanelCard>

              <PanelCard title="Active Rider Gauge" action={<span className="text-xs font-semibold text-slate-400">...</span>}>
                <ResponsiveContainer width="100%" height={300}>
                  <RadialBarChart
                    innerRadius="46%"
                    outerRadius="88%"
                    data={[{ name: "Active", value: riderActivePct, fill: "#8b5cf6" }]}
                    startAngle={90}
                    endAngle={-270}
                  >
                    <RadialBar dataKey="value" cornerRadius={10} background />
                    <Tooltip formatter={(v) => [`${v}%`, "Active"]} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <p className="text-center text-sm text-slate-600">{riderActivePct}% of total riders are currently active</p>
              </PanelCard>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ title, value, delta, icon: Icon, tone = "sky" }) {
  const tones = {
    sky: { icon: "bg-sky-100 text-sky-700", delta: "text-emerald-600" },
    violet: { icon: "bg-violet-100 text-violet-700", delta: "text-emerald-600" },
    cyan: { icon: "bg-cyan-100 text-cyan-700", delta: "text-sky-600" },
    amber: { icon: "bg-amber-100 text-amber-700", delta: "text-emerald-600" },
  };
  const style = tones[tone] || tones.sky;

  return (
    <div className="rounded-[26px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500">{title}</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">{value}</h2>
          <p className={`mt-2 text-xs font-semibold ${style.delta}`}>{delta}</p>
        </div>
        {Icon ? (
          <span className={`grid h-12 w-12 place-items-center rounded-2xl ${style.icon}`}>
            <Icon size={20} />
          </span>
        ) : null}
      </div>
    </div>
  );
}

function PanelCard({ title, action, children, className = "" }) {
  return (
    <section className={`rounded-[28px] border border-slate-200/80 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)] ${className}`}>
      <header className="mb-4 flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {action ? <div>{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

function MiniInsightCard({ title, subtitle, value, meta, accent = "sky", data }) {
  const accents = {
    sky: { icon: "bg-sky-100 text-sky-700", line: "#0ea5e9" },
    violet: { icon: "bg-violet-100 text-violet-700", line: "#8b5cf6" },
    cyan: { icon: "bg-cyan-100 text-cyan-700", line: "#06b6d4" },
    amber: { icon: "bg-amber-100 text-amber-700", line: "#f59e0b" },
  };
  const style = accents[accent] || accents.sky;

  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white p-4 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-slate-900">{title}</h4>
          <p className="mt-1 truncate text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className={`grid h-10 w-10 place-items-center rounded-2xl ${style.icon}`}>
          <PackageCheck size={18} />
        </span>
      </div>

      <div className="flex items-end gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">{meta}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
        </div>
        <div className="h-16 w-28 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data}>
              <Line type="monotone" dataKey="value" stroke={style.line} strokeWidth={2.5} dot={false} />
              <Tooltip />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function getPercentChange(start, end) {
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === 0) return 0;
  return Math.round(((end - start) / start) * 100);
}

