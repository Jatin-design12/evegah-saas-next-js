import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Check, ChevronDown, MapPin, Search } from "lucide-react";

import { listAdminZones } from "../../utils/adminZones";

export default function AdminTopbar({ title, subtitle, actions = null }) {
  const [zones, setZones] = useState([]);
  const [zoneMenuOpen, setZoneMenuOpen] = useState(false);
  const [selectedZone, setSelectedZone] = useState("all");
  const zoneMenuRef = useRef(null);

  useEffect(() => {
    let active = true;

    const loadZones = async () => {
      try {
        const payload = await listAdminZones();
        if (!active) return;
        setZones(Array.isArray(payload) ? payload : []);
      } catch {
        if (!active) return;
        setZones([]);
      }
    };

    loadZones();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleOutside = (event) => {
      if (!zoneMenuRef.current) return;
      if (!zoneMenuRef.current.contains(event.target)) {
        setZoneMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const zoneOptions = useMemo(() => {
    const mapped = zones.map((zone) => ({
      id: String(zone.id),
      label: String(zone.zone_name || zone.zone_code || `Zone ${zone.id}`),
      color: String(zone.color || "#0ea5e9"),
    }));

    return [{ id: "all", label: "All Zones", color: "#64748b" }, ...mapped];
  }, [zones]);

  const selectedZoneLabel =
    zoneOptions.find((option) => option.id === selectedZone)?.label || "All Zones";

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="w-full px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-bold text-slate-900">{title}</h1>
            {subtitle ? <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p> : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div ref={zoneMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setZoneMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <MapPin size={15} className="text-emerald-600" />
                {selectedZoneLabel}
                <ChevronDown size={14} className="text-slate-400" />
              </button>

              {zoneMenuOpen ? (
                <div className="absolute left-0 top-full z-50 mt-2 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  {zoneOptions.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => {
                        setSelectedZone(option.id);
                        setZoneMenuOpen(false);
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ backgroundColor: option.color }}
                        />
                        {option.label}
                      </span>
                      {selectedZone === option.id ? <Check size={14} className="text-slate-500" /> : null}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <label className="relative min-w-[180px] flex-1 sm:flex-none">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none transition focus:border-slate-400"
              />
            </label>

            <button
              type="button"
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
              aria-label="Notifications"
            >
              <Bell size={16} />
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-1.5 text-left transition hover:bg-slate-50"
            >
              <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                RK
              </span>
              <span className="hidden text-xs font-semibold text-slate-600 sm:block">Manager</span>
            </button>

            {actions}
          </div>
        </div>
      </div>
    </header>
  );
}
