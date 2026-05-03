import { useEffect, useMemo, useState } from "react";
import { Battery, Bike, PencilLine, Plus, Save, Trash2 } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
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

import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import { listAdminZones } from "../../utils/adminZones";
import {
  createAdminBattery,
  createAdminVehicle,
  deleteAdminBattery,
  deleteAdminVehicle,
  listAdminBatteries,
  listAdminVehicles,
  updateAdminBattery,
  updateAdminVehicle,
} from "../../utils/adminFleet";

const VEHICLE_STATUS_OPTIONS = ["available", "in_use", "maintenance", "inactive"];
const BATTERY_STATUS_OPTIONS = ["available", "charging", "in_use", "maintenance", "inactive"];

const EMPTY_VEHICLE_FORM = {
  vehicleId: "",
  vehicleType: "EV Scooter",
  model: "",
  zoneId: "",
  status: "available",
};

const EMPTY_BATTERY_FORM = {
  batteryId: "",
  batteryType: "Li-ion",
  zoneId: "",
  assignedVehicleId: "",
  healthPercent: "100",
  status: "available",
};

function titleize(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function FleetAssets() {
  const [zones, setZones] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [batteries, setBatteries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [vehicleForm, setVehicleForm] = useState(EMPTY_VEHICLE_FORM);
  const [batteryForm, setBatteryForm] = useState(EMPTY_BATTERY_FORM);
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);

  const [vehicleEdits, setVehicleEdits] = useState({});
  const [batteryEdits, setBatteryEdits] = useState({});

  const loadAll = async () => {
    setError("");
    setLoading(true);
    try {
      const [zoneData, vehicleData, batteryData] = await Promise.all([
        listAdminZones(),
        listAdminVehicles(),
        listAdminBatteries(),
      ]);
      setZones(Array.isArray(zoneData) ? zoneData : []);
      setVehicles(Array.isArray(vehicleData) ? vehicleData : []);
      setBatteries(Array.isArray(batteryData) ? batteryData : []);
    } catch (e) {
      setError(String(e?.message || e || "Unable to load fleet assets"));
      setZones([]);
      setVehicles([]);
      setBatteries([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      if (!mounted) return;
      await loadAll();
    };

    load();
    const timer = setInterval(load, 30000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  const summary = useMemo(() => {
    const activeVehicles = vehicles.filter((item) => item.status !== "inactive").length;
    const assignedVehicles = vehicles.filter((item) => item.zone_id !== null).length;
    const availableBatteries = batteries.filter((item) => item.status === "available").length;
    const assignedBatteries = batteries.filter((item) => item.zone_id !== null).length;

    return {
      totalVehicles: vehicles.length,
      activeVehicles,
      assignedVehicles,
      totalBatteries: batteries.length,
      availableBatteries,
      assignedBatteries,
    };
  }, [vehicles, batteries]);

  const fleetRadialData = useMemo(() => {
    const totalVehicles = summary.totalVehicles || 1;
    const totalBatteries = summary.totalBatteries || 1;
    return [
      {
        name: "Vehicle Assignment",
        value: Math.round((summary.assignedVehicles / totalVehicles) * 100),
        fill: "#2563eb",
      },
      {
        name: "Battery Availability",
        value: Math.round((summary.availableBatteries / totalBatteries) * 100),
        fill: "#14b8a6",
      },
    ];
  }, [summary]);

  const zoneOpsSeries = useMemo(() => {
    return zones.slice(0, 8).map((zone) => {
      const zoneId = Number(zone.id);
      const vehicleCount = vehicles.filter((v) => Number(v.zone_id) === zoneId).length;
      const batteryCount = batteries.filter((b) => Number(b.zone_id) === zoneId).length;
      return {
        zone: String(zone.zone_name || `Zone ${zoneId}`),
        vehicles: vehicleCount,
        batteries: batteryCount,
        target: Math.max(vehicleCount, batteryCount) + 2,
      };
    });
  }, [zones, vehicles, batteries]);

  const healthRadarData = useMemo(() => {
    const groups = {
      healthy: 0,
      warning: 0,
      critical: 0,
      assigned: 0,
      unassigned: 0,
    };

    batteries.forEach((row) => {
      const health = Number(row.health_percent || 0);
      if (health >= 80) groups.healthy += 1;
      else if (health >= 50) groups.warning += 1;
      else groups.critical += 1;

      if (row.assigned_vehicle_id) groups.assigned += 1;
      else groups.unassigned += 1;
    });

    return [
      { metric: "Healthy", value: groups.healthy },
      { metric: "Warning", value: groups.warning },
      { metric: "Critical", value: groups.critical },
      { metric: "Assigned", value: groups.assigned },
      { metric: "Unassigned", value: groups.unassigned },
    ];
  }, [batteries]);

  const handleCreateVehicle = async (e) => {
    e.preventDefault();
    setFormError("");

    const vehicleId = String(vehicleForm.vehicleId || "")
      .trim()
      .toUpperCase();
    if (!vehicleId) {
      setFormError("Vehicle ID is required.");
      return;
    }

    setSaving(true);
    try {
      await createAdminVehicle({
        vehicleId,
        vehicleType: vehicleForm.vehicleType,
        model: vehicleForm.model,
        zoneId: vehicleForm.zoneId || null,
        status: vehicleForm.status,
      });
      setVehicleForm(EMPTY_VEHICLE_FORM);
      await loadAll();
    } catch (e2) {
      setFormError(String(e2?.message || e2 || "Unable to create vehicle"));
    } finally {
      setSaving(false);
    }
  };

  const handleCreateBattery = async (e) => {
    e.preventDefault();
    setFormError("");

    const batteryId = String(batteryForm.batteryId || "")
      .trim()
      .toUpperCase();
    if (!batteryId) {
      setFormError("Battery ID is required.");
      return;
    }

    const healthPercent = Math.max(0, Math.min(100, Number(batteryForm.healthPercent || 0)));

    setSaving(true);
    try {
      await createAdminBattery({
        batteryId,
        batteryType: batteryForm.batteryType,
        zoneId: batteryForm.zoneId || null,
        assignedVehicleId: batteryForm.assignedVehicleId || null,
        healthPercent,
        status: batteryForm.status,
      });
      setBatteryForm(EMPTY_BATTERY_FORM);
      await loadAll();
    } catch (e2) {
      setFormError(String(e2?.message || e2 || "Unable to create battery"));
    } finally {
      setSaving(false);
    }
  };

  const getVehicleEdit = (row) => {
    return (
      vehicleEdits[row.id] || {
        zoneId: row.zone_id ?? "",
        status: row.status || "available",
        assignedBatteryId: row.assigned_battery_id ?? "",
      }
    );
  };

  const getBatteryEdit = (row) => {
    return (
      batteryEdits[row.id] || {
        zoneId: row.zone_id ?? "",
        status: row.status || "available",
        assignedVehicleId: row.assigned_vehicle_id ?? "",
        healthPercent: row.health_percent ?? 100,
      }
    );
  };

  const updateVehicleEdit = (id, patch) => {
    setVehicleEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }));
  };

  const updateBatteryEdit = (id, patch) => {
    setBatteryEdits((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || {}), ...patch },
    }));
  };

  const handleSaveVehicle = async (row) => {
    const edit = getVehicleEdit(row);
    await updateAdminVehicle(row.id, {
      zoneId: edit.zoneId || null,
      status: edit.status,
      assignedBatteryId: edit.assignedBatteryId || null,
    });
    await loadAll();
  };

  const handleSaveBattery = async (row) => {
    const edit = getBatteryEdit(row);
    await updateAdminBattery(row.id, {
      zoneId: edit.zoneId || null,
      status: edit.status,
      assignedVehicleId: edit.assignedVehicleId || null,
      healthPercent: edit.healthPercent,
    });
    await loadAll();
  };

  const handleDeleteVehicle = async (row) => {
    if (!window.confirm(`Delete vehicle ${row.vehicle_id}?`)) return;
    await deleteAdminVehicle(row.id);
    await loadAll();
  };

  const handleDeleteBattery = async (row) => {
    if (!window.confirm(`Delete battery ${row.battery_id}?`)) return;
    await deleteAdminBattery(row.id);
    await loadAll();
  };

  return (
    <div className="h-screen w-full flex bg-[#f7f8fc]">
      <AdminSidebar />

      <main className="flex-1 w-full min-w-0 overflow-x-hidden overflow-y-auto sm:ml-[var(--admin-sidebar-width,16rem)]">
        <AdminTopbar
          title="Fleet Assets"
          subtitle="Add and manage vehicles and batteries. Assign assets to zones from one place."
        />
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        ) : null}

        {formError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{formError}</div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Total Vehicles</div>
            <div className="text-2xl font-bold text-slate-900">{summary.totalVehicles}</div>
            <div className="text-xs text-slate-500">Active: {summary.activeVehicles} | Assigned: {summary.assignedVehicles}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Total Batteries</div>
            <div className="text-2xl font-bold text-slate-900">{summary.totalBatteries}</div>
            <div className="text-xs text-slate-500">Available: {summary.availableBatteries} | Assigned: {summary.assignedBatteries}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Zones Covered</div>
            <div className="text-2xl font-bold text-slate-900">{zones.length}</div>
            <div className="text-xs text-slate-500">Fleet-ready assignment board</div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-12">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Fleet Health Ring</h3>
              <span className="text-xs text-slate-500">Utilization %</span>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <RadialBarChart innerRadius="35%" outerRadius="90%" barSize={14} data={fleetRadialData}>
                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                <RadialBar background dataKey="value" cornerRadius={8} />
                <Tooltip formatter={(v) => [`${v}%`, "Value"]} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="mt-2 space-y-2 text-xs text-slate-600">
              {fleetRadialData.map((item) => (
                <div key={item.name} className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.fill }} />
                    {item.name}
                  </span>
                  <span className="font-semibold text-slate-900">{item.value}%</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Zone Operations Mix</h3>
              <span className="text-xs text-slate-500">Top zones</span>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <ComposedChart data={zoneOpsSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="zone" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="vehicles" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="batteries" fill="#14b8a6" radius={[6, 6, 0, 0]} />
                <Line dataKey="target" stroke="#f59e0b" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">Battery Condition Radar</h3>
              <span className="text-xs text-slate-500">Distribution</span>
            </div>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={healthRadarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: "#64748b", fontSize: 11 }} />
                <PolarRadiusAxis tick={{ fill: "#94a3b8", fontSize: 10 }} />
                <Tooltip />
                <Radar name="Count" dataKey="value" stroke="#8b5cf6" fill="#8b5cf6" fillOpacity={0.25} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <form onSubmit={handleCreateVehicle} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-semibold">
              <Bike size={16} /> Add Vehicle
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Vehicle ID (e.g. EVM5025008)"
                value={vehicleForm.vehicleId}
                onChange={(e) => setVehicleForm((prev) => ({ ...prev, vehicleId: e.target.value }))}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                placeholder="Model"
                value={vehicleForm.model}
                onChange={(e) => setVehicleForm((prev) => ({ ...prev, model: e.target.value }))}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <select
                value={vehicleForm.vehicleType}
                onChange={(e) => setVehicleForm((prev) => ({ ...prev, vehicleType: e.target.value }))}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              >
                <option>EV Scooter</option>
                <option>EV Cycle</option>
                <option>Paddle Cycle</option>
              </select>
              <select
                value={vehicleForm.zoneId}
                onChange={(e) => setVehicleForm((prev) => ({ ...prev, zoneId: e.target.value }))}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              >
                <option value="">Select Zone</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>{zone.zone_name}</option>
                ))}
              </select>
              <select
                value={vehicleForm.status}
                onChange={(e) => setVehicleForm((prev) => ({ ...prev, status: e.target.value }))}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              >
                {VEHICLE_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{titleize(status)}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
            >
              <Plus size={14} /> Create Vehicle
            </button>
          </form>

          <form onSubmit={handleCreateBattery} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-slate-900 font-semibold">
              <Battery size={16} /> Add Battery
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Battery ID (e.g. EVB2583)"
                value={batteryForm.batteryId}
                onChange={(e) => setBatteryForm((prev) => ({ ...prev, batteryId: e.target.value }))}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                placeholder="Battery Type"
                value={batteryForm.batteryType}
                onChange={(e) => setBatteryForm((prev) => ({ ...prev, batteryType: e.target.value }))}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              <select
                value={batteryForm.zoneId}
                onChange={(e) => setBatteryForm((prev) => ({ ...prev, zoneId: e.target.value }))}
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
              >
                <option value="">Zone</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>{zone.zone_name}</option>
                ))}
              </select>
              <select
                value={batteryForm.assignedVehicleId}
                onChange={(e) => setBatteryForm((prev) => ({ ...prev, assignedVehicleId: e.target.value }))}
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
              >
                <option value="">Vehicle</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicle_id}</option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                max="100"
                value={batteryForm.healthPercent}
                onChange={(e) => setBatteryForm((prev) => ({ ...prev, healthPercent: e.target.value }))}
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                placeholder="Health %"
              />
              <select
                value={batteryForm.status}
                onChange={(e) => setBatteryForm((prev) => ({ ...prev, status: e.target.value }))}
                className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
              >
                {BATTERY_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>{titleize(status)}</option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              <Plus size={14} /> Create Battery
            </button>
          </form>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-slate-900 font-semibold">
            <PencilLine size={16} /> Vehicles
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="px-3 py-2">Vehicle</th>
                  <th className="px-3 py-2">Type / Model</th>
                  <th className="px-3 py-2">Zone</th>
                  <th className="px-3 py-2">Battery</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-slate-500">Loading vehicles...</td>
                  </tr>
                ) : vehicles.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-4 text-slate-500">No vehicles available.</td>
                  </tr>
                ) : (
                  vehicles.map((row) => {
                    const edit = getVehicleEdit(row);
                    return (
                      <tr key={row.id} className="border-t border-slate-200">
                        <td className="px-3 py-2 font-semibold text-slate-800">{row.vehicle_id}</td>
                        <td className="px-3 py-2 text-slate-600">{row.vehicle_type || "-"} {row.model ? `• ${row.model}` : ""}</td>
                        <td className="px-3 py-2">
                          <select
                            value={edit.zoneId ?? ""}
                            onChange={(e) => updateVehicleEdit(row.id, { zoneId: e.target.value })}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="">Unassigned</option>
                            {zones.map((zone) => (
                              <option key={zone.id} value={zone.id}>{zone.zone_name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={edit.assignedBatteryId ?? ""}
                            onChange={(e) => updateVehicleEdit(row.id, { assignedBatteryId: e.target.value })}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="">None</option>
                            {batteries.map((battery) => (
                              <option key={battery.id} value={battery.id}>{battery.battery_id}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={edit.status}
                            onChange={(e) => updateVehicleEdit(row.id, { status: e.target.value })}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                          >
                            {VEHICLE_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>{titleize(status)}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveVehicle(row)}
                              className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
                            >
                              <Save size={12} /> Save
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteVehicle(row)}
                              className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                            >
                              <Trash2 size={12} /> Delete
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
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-slate-900 font-semibold">
            <PencilLine size={16} /> Batteries
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600">
                  <th className="px-3 py-2">Battery</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Zone</th>
                  <th className="px-3 py-2">Vehicle</th>
                  <th className="px-3 py-2">Health</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-slate-500">Loading batteries...</td>
                  </tr>
                ) : batteries.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-4 text-slate-500">No batteries available.</td>
                  </tr>
                ) : (
                  batteries.map((row) => {
                    const edit = getBatteryEdit(row);
                    return (
                      <tr key={row.id} className="border-t border-slate-200">
                        <td className="px-3 py-2 font-semibold text-slate-800">{row.battery_id}</td>
                        <td className="px-3 py-2 text-slate-600">{row.battery_type || "-"}</td>
                        <td className="px-3 py-2">
                          <select
                            value={edit.zoneId ?? ""}
                            onChange={(e) => updateBatteryEdit(row.id, { zoneId: e.target.value })}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="">Unassigned</option>
                            {zones.map((zone) => (
                              <option key={zone.id} value={zone.id}>{zone.zone_name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={edit.assignedVehicleId ?? ""}
                            onChange={(e) => updateBatteryEdit(row.id, { assignedVehicleId: e.target.value })}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                          >
                            <option value="">None</option>
                            {vehicles.map((vehicle) => (
                              <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicle_id}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={edit.healthPercent}
                            onChange={(e) => updateBatteryEdit(row.id, { healthPercent: e.target.value })}
                            className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-xs"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={edit.status}
                            onChange={(e) => updateBatteryEdit(row.id, { status: e.target.value })}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
                          >
                            {BATTERY_STATUS_OPTIONS.map((status) => (
                              <option key={status} value={status}>{titleize(status)}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleSaveBattery(row)}
                              className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-700"
                            >
                              <Save size={12} /> Save
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBattery(row)}
                              className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2 py-1 text-xs font-semibold text-red-700"
                            >
                              <Trash2 size={12} /> Delete
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
        </div>
        </div>
      </main>
    </div>
  );
}

