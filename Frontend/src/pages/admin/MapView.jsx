import { useEffect, useMemo, useState, useRef } from "react";
import Image from "next/image";
import { Activity, AlertTriangle, Bike, Navigation, Route, Search } from "lucide-react";
import { GoogleMap, MarkerClusterer, MarkerF, Polyline, OverlayView, useJsApiLoader, useGoogleMap } from "@react-google-maps/api";

import AdminSidebar from "../../components/admin/AdminSidebar";
import AdminTopbar from "../../components/admin/AdminTopbar";
import mapVehicleImage from "../../assets/image_71158d.jpg";
import cityVehicle from "../../assets/city.png";
import minkVehicle from "../../assets/mink.png";
import { apiFetch } from "../../config/api";
import { listAdminZones } from "../../utils/adminZones";

const MAP_FALLBACK_CENTER = { lat: 22.3072, lng: 73.1812 };
const STOP_MIN_MS = 1000 * 60 * 5;
const STOP_RADIUS_METERS = 25;
const STOP_SAMPLE_WINDOW_MS = 1000 * 60 * 120;
const STOP_SAMPLE_MAX = 600;
const OFFLINE_THRESHOLD_MS = 1000 * 60 * 5;
const GHOST_TRAIL_WINDOW_MS = 1000 * 60 * 5;
const MULTI_SELECT_LIMIT = 10;

function resolveAssetSrc(asset) {
  if (!asset) return "";
  if (typeof asset === "string") return asset;
  if (typeof asset === "object" && typeof asset.src === "string") return asset.src;
  return "";
}

function toCsvValue(value) {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (raw.includes(",") || raw.includes("\n") || raw.includes("\"")) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function buildRideHistoryCsv(vehicle, rides) {
  const header = [
    "vehicleId",
    "vehicleLabel",
    "rideId",
    "startTime",
    "endTime",
    "durationMinutes",
    "distanceKm",
    "batteryStart",
    "batteryEnd",
    "pointCount",
  ];
  const rows = (rides || []).map((ride) => {
    const durationMinutes = Math.round((ride.endTime - ride.startTime) / 1000 / 60);
    const distanceKm = Number.isFinite(Number(ride.distance)) ? (Number(ride.distance) / 1000).toFixed(2) : "";
    return [
      vehicle?.vehicleId || "",
      vehicle?.vehicleLabel || "",
      ride.id || "",
      ride.startTime?.toISOString ? ride.startTime.toISOString() : "",
      ride.endTime?.toISOString ? ride.endTime.toISOString() : "",
      Number.isFinite(durationMinutes) ? durationMinutes : "",
      distanceKm,
      ride.startBattery ?? "",
      ride.endBattery ?? "",
      ride.pointCount ?? "",
    ];
  });

  return [header, ...rows].map((row) => row.map(toCsvValue).join(",")).join("\n");
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineMeters(a, b) {
  if (!a || !b) return 0;
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const dLat = lat2 - lat1;
  const dLng = toRadians(b[1] - a[1]);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function filterPathByDistance(points, minMeters) {
  if (!Array.isArray(points) || points.length < 2) return points || [];

  const filtered = [points[0]];
  let lastPoint = points[0];

  for (let i = 1; i < points.length; i += 1) {
    const currentPoint = points[i];
    const dist = haversineMeters(lastPoint, currentPoint);

    // Only add point if it moved more than the threshold
    // This removes the "zigzag" mess when a vehicle is stationary
    if (dist >= minMeters) {
      filtered.push(currentPoint);
      lastPoint = currentPoint;
    }
  }

  // Always keep the last known point for accuracy
  if (filtered[filtered.length - 1] !== points[points.length - 1]) {
    filtered.push(points[points.length - 1]);
  }

  return filtered;
}

function normalizeTelemetryPoint(entry, index) {
  if (!entry || typeof entry !== "object") return null;
  const lat = Number(entry.lat ?? entry.latitude ?? entry[0]);
  const lng = Number(entry.lng ?? entry.longitude ?? entry[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const rawTs = entry.ts ?? entry.timestamp ?? entry.createdAt ?? entry.updatedAt ?? entry.time ?? null;
  const ts = rawTs ? new Date(rawTs).getTime() : null;
  const rawSeq = entry.seq ?? entry.sequence ?? entry.index ?? entry.i ?? null;
  const seq = Number.isFinite(Number(rawSeq)) ? Number(rawSeq) : null;
  const accuracy = Number(entry.accuracy ?? entry.acc ?? entry.hacc ?? entry.horizontalAccuracy ?? entry.gps_accuracy);
  return {
    lat,
    lng,
    ts: Number.isFinite(ts) ? ts : null,
    order: seq ?? index,
    accuracy: Number.isFinite(accuracy) ? accuracy : null,
  };
}

function buildCleanSegments(points, options = {}) {
  const {
    minMeters = 25,
    maxJumpMeters = 500,
    maxSpeedKmh = 80,
    maxGapMs = 1000 * 60 * 5,
  } = options;

  const normalized = (points || [])
    .map(normalizeTelemetryPoint)
    .filter(Boolean)
    .sort((a, b) => {
      const aKey = Number.isFinite(a.ts) ? a.ts : Number.isFinite(a.order) ? a.order : 0;
      const bKey = Number.isFinite(b.ts) ? b.ts : Number.isFinite(b.order) ? b.order : 0;
      return aKey - bKey;
    });

  if (normalized.length < 2) return [];

  const segments = [];
  let currentSegment = [];
  let lastPoint = null;

  for (const point of normalized) {
    if (!lastPoint) {
      currentSegment = [point];
      lastPoint = point;
      continue;
    }

    const dist = haversineMeters([lastPoint.lat, lastPoint.lng], [point.lat, point.lng]);
    const timeDiffMs = point.ts - lastPoint.ts;
    const hasTime = Number.isFinite(timeDiffMs) && timeDiffMs > 0;
    const speedKmh = hasTime ? (dist / 1000) / (timeDiffMs / 3600000) : 0;

    // Logic to break path into segments if there's a huge jump or gap
    const isJitter = dist < 5;
    const isTeleportation = (speedKmh > maxSpeedKmh && dist > 100) || dist > maxJumpMeters;
    const isLongGap = hasTime && timeDiffMs > maxGapMs;
    const isUnknownGap = !hasTime && dist > maxJumpMeters;

    if (isTeleportation || isLongGap || isUnknownGap) {
      if (currentSegment.length > 1) segments.push(currentSegment);
      currentSegment = [point];
      lastPoint = point;
      continue;
    }

    if (!isJitter) {
      const accuracyOk = Number.isFinite(point.accuracy) ? point.accuracy < 20 : true;
      if (accuracyOk && dist > 10) {
        currentSegment.push(point);
        lastPoint = point;
      }
    }
  }

  if (currentSegment.length > 1) segments.push(currentSegment);

  const cleanedSegments = segments
    .map((segment) => segment.map((p) => [p.lat, p.lng]))
    .map((segment) => filterPathByDistance(segment, minMeters))
    .filter((segment) => segment.length >= 2);

  return cleanedSegments;
}

function flattenSegments(segments) {
  if (!Array.isArray(segments)) return [];
  return segments.flat();
}

function selectPrimarySegment(segments, startPoint, endPoint) {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  if (segments.length === 1) return segments[0];

  const start = startPoint && Number.isFinite(Number(startPoint.lat)) && Number.isFinite(Number(startPoint.lng))
    ? [Number(startPoint.lat), Number(startPoint.lng)]
    : null;
  const end = endPoint && Number.isFinite(Number(endPoint.lat)) && Number.isFinite(Number(endPoint.lng))
    ? [Number(endPoint.lat), Number(endPoint.lng)]
    : null;

  if (start || end) {
    let best = segments[0];
    let bestScore = Number.POSITIVE_INFINITY;
    for (const segment of segments) {
      if (!segment.length) continue;
      let score = 0;
      if (start) score += haversineMeters(start, segment[0]);
      if (end) score += haversineMeters(end, segment[segment.length - 1]);
      if (score < bestScore) {
        bestScore = score;
        best = segment;
      }
    }
    return best;
  }

  return segments.slice().sort((a, b) => b.length - a.length)[0];
}

function selectLastSegment(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return [];
  return segments[segments.length - 1];
}

function interpolatePosition(start, end, t) {
  return [
    start[0] + (end[0] - start[0]) * t,
    start[1] + (end[1] - start[1]) * t,
  ];
}

function formatStopLabel(index) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  if (index < alphabet.length) return alphabet[index];
  return String(index + 1);
}

function formatStopDuration(durationMs) {
  const totalMinutes = Math.max(1, Math.round(durationMs / 60000));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

function buildStopMarkers(points, options = {}) {
  const {
    minStopMs = STOP_MIN_MS,
    radiusMeters = STOP_RADIUS_METERS,
    minPoints = 2,
  } = options;

  const normalized = (points || [])
    .map(normalizeTelemetryPoint)
    .filter((point) => point && Number.isFinite(point.ts))
    .sort((a, b) => a.ts - b.ts);

  if (normalized.length < minPoints) return [];

  const stops = [];
  let cluster = null;

  const finalizeCluster = () => {
    if (!cluster) return;
    const durationMs = cluster.endTs - cluster.startTs;
    if (durationMs >= minStopMs && cluster.count >= minPoints) {
      stops.push({
        lat: cluster.sumLat / cluster.count,
        lng: cluster.sumLng / cluster.count,
        startTs: cluster.startTs,
        endTs: cluster.endTs,
        durationMs,
        pointCount: cluster.count,
      });
    }
  };

  for (const point of normalized) {
    if (!cluster) {
      cluster = {
        startTs: point.ts,
        endTs: point.ts,
        sumLat: point.lat,
        sumLng: point.lng,
        count: 1,
        lat: point.lat,
        lng: point.lng,
      };
      continue;
    }

    const dist = haversineMeters([cluster.lat, cluster.lng], [point.lat, point.lng]);
    if (dist <= radiusMeters) {
      cluster.sumLat += point.lat;
      cluster.sumLng += point.lng;
      cluster.count += 1;
      cluster.endTs = point.ts;
      cluster.lat = cluster.sumLat / cluster.count;
      cluster.lng = cluster.sumLng / cluster.count;
      continue;
    }

    finalizeCluster();
    cluster = {
      startTs: point.ts,
      endTs: point.ts,
      sumLat: point.lat,
      sumLng: point.lng,
      count: 1,
      lat: point.lat,
      lng: point.lng,
    };
  }

  finalizeCluster();
  return stops;
}

function getHeadingDegrees(from, to) {
  if (!from || !to) return null;
  const lat1 = toRadians(from[0]);
  const lat2 = toRadians(to[0]);
  const dLng = toRadians(to[1] - from[1]);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  const bearing = Math.atan2(y, x) * (180 / Math.PI);
  return (bearing + 360) % 360;
}

// Select vehicle image based on brand or model name
function selectVehicleImage(brandName, modelName) {
  const brand = String(brandName || "").toUpperCase();
  const model = String(modelName || "").toUpperCase();

  if (brand.includes("XEROS") || model.includes("MINK")) {
    return minkVehicle;
  }
  if (brand.includes("FLY") || model.includes("FLY")) {
    return cityVehicle;
  }
  // Default to city.png for other models
  return cityVehicle;
}

function buildCircleSymbol(color, scale = 6, strokeWeight = 2) {
  if (typeof window === "undefined" || !window.google?.maps) return undefined;
  return {
    path: window.google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight,
    scale,
  };
}

function scaleForCount(count, minScale = 4, maxScale = 14) {
  const value = Number(count || 0);
  if (!Number.isFinite(value) || value <= 0) return minScale;
  const scaled = Math.round(minScale + Math.log(value + 1) * 4);
  return Math.min(maxScale, Math.max(minScale, scaled));
}

function formatAmount(value) {
  const amount = Number(value || 0);
  if (!Number.isFinite(amount)) return "0";
  return amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}

function getVehicleMarkerIcon(asset, size = { width: 58, height: 38 }) {
  if (typeof window === "undefined" || !window.google?.maps) return undefined;
  const src = resolveAssetSrc(asset || mapVehicleImage);
  return {
    url: src,
    scaledSize: new window.google.maps.Size(size.width, size.height),
    anchor: new window.google.maps.Point(size.width / 2, size.height / 2),
  };
}

function VehicleOverlay({ position, heading, image }) {
  if (!position) return null;
  const rotation = Number.isFinite(heading) ? heading : 0;
  const size = { width: 72, height: 48 };

  return (
    <OverlayView position={position} mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}>
      <div
        style={{
          transform: `translate(-50%, -50%) rotate(${rotation}deg) rotateX(22deg)`,
          width: `${size.width}px`,
          height: `${size.height}px`,
          pointerEvents: "none",
          filter: "drop-shadow(0 6px 12px rgba(15, 23, 42, 0.35))",
        }}
      >
        <Image
          src={resolveAssetSrc(image || mapVehicleImage)}
          alt="vehicle"
          width={size.width}
          height={size.height}
          className="h-full w-full object-contain"
        />
      </div>
    </OverlayView>
  );
}

function MapFocusController({ target, enabled = true, speedKmh = null }) {
  const map = useGoogleMap();

  useEffect(() => {
    if (!map || !enabled || !target) return;
    const lat = Number(target.lat);
    const lng = Number(target.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    map.panTo({ lat, lng });
    const desiredZoom = getZoomForSpeed(speedKmh);
    const nextZoom = Math.max(desiredZoom, map.getZoom() || desiredZoom);
    map.setZoom(nextZoom);
  }, [map, target, enabled, speedKmh]);

  return null;
}

function pickNumber(source, keys) {
  for (const key of keys) {
    const value = Number(source?.[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function pickFirstFiniteNumber(...values) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseSnapshotSpeed(snapshot) {
  const payload = snapshot?.payload || {};
  return pickFirstFiniteNumber(payload.speed, payload.sp, payload?.attributes?.speed, payload?.attributes?.sp);
}

function parseSnapshotEngineState(snapshot) {
  const payload = snapshot?.payload || {};
  const out1 = payload?.attributes?.out1 ?? payload?.out1 ?? payload?.output1 ?? payload?.attributes?.output1;
  if (out1 === undefined || out1 === null || out1 === "") return null;
  if (String(out1) === "1" || out1 === true) return true;
  if (String(out1) === "0" || out1 === false) return false;
  return null;
}

function computeTripState({ speed, engineOn, lastSeenMs }) {
  if (!Number.isFinite(lastSeenMs)) return "Unknown";
  if (Date.now() - lastSeenMs > OFFLINE_THRESHOLD_MS) return "Offline";
  if (Number.isFinite(speed) && speed > 2) return "Moving";
  if (engineOn === true) return "Idle";
  return "Stopped";
}

function getZoomForSpeed(speedKmh) {
  const speed = Number(speedKmh);
  if (!Number.isFinite(speed)) return 15;
  if (speed < 5) return 16;
  if (speed < 15) return 15;
  if (speed < 30) return 14;
  if (speed < 50) return 13;
  return 12;
}

export default function AdminMapView() {
  const [zones, setZones] = useState([]);
  const [devices, setDevices] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [selectedVehicleIds, setSelectedVehicleIds] = useState([]);
  const [isolateSelected, setIsolateSelected] = useState(false);
  const [selectedRideId, setSelectedRideId] = useState(null);
  const [showRideHistory, setShowRideHistory] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [batteryMin, setBatteryMin] = useState(0);
  const [batteryMax, setBatteryMax] = useState(100);
  const [cityFilter, setCityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [autoFollow, setAutoFollow] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playIndex, setPlayIndex] = useState(0);
  const [animatedPos, setAnimatedPos] = useState(null);
  const [animatedHeading, setAnimatedHeading] = useState(0);
  const playbackTimerRef = useRef(null);
  const playbackAnimRef = useRef(null);
  const animationRef = useRef(null);
  const liveTrailRef = useRef(new Map());
  const [liveTrailVersion, setLiveTrailVersion] = useState(0);
  const liveSamplesRef = useRef(new Map());
  const [liveSamplesVersion, setLiveSamplesVersion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mqttSnapshots, setMqttSnapshots] = useState({});
  const [analytics, setAnalytics] = useState(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsError, setAnalyticsError] = useState("");
  const [showIdleHeatmap, setShowIdleHeatmap] = useState(false);
  const [showStartHotspots, setShowStartHotspots] = useState(false);
  const [showEndHotspots, setShowEndHotspots] = useState(false);
  const googleMapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
  const googleMapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || "";
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey,
    mapIds: googleMapId ? [googleMapId] : undefined,
  });

  const trackedIds = useMemo(() => {
    if (selectedVehicleIds.length) return selectedVehicleIds;
    if (selectedVehicleId) return [selectedVehicleId];
    return [];
  }, [selectedVehicleIds, selectedVehicleId]);

  const mqttSnapshotMap = useMemo(() => {
    const map = new Map();
    Object.entries(mqttSnapshots || {}).forEach(([key, snapshot]) => {
      if (key) map.set(String(key).toLowerCase(), snapshot);
    });
    return map;
  }, [mqttSnapshots]);

  const getSnapshotForVehicle = (vehicle) => {
    if (!vehicle) return null;
    const keys = [vehicle.vehicleId, vehicle.lockNumber, vehicle.imeiNumber].filter(Boolean);
    for (const key of keys) {
      const snapshot = mqttSnapshotMap.get(String(key).toLowerCase());
      if (snapshot) return snapshot;
    }
    return null;
  };

  const analyticsSummary = useMemo(() => {
    const ridesByDay = analytics?.rides?.byDay || [];
    const ridesByWeek = analytics?.rides?.byWeek || [];
    const ridesByMonth = analytics?.rides?.byMonth || [];
    const latestDay = ridesByDay[ridesByDay.length - 1]?.rides || 0;
    const latestWeek = ridesByWeek[ridesByWeek.length - 1]?.rides || 0;
    const latestMonth = ridesByMonth[ridesByMonth.length - 1]?.rides || 0;
    const revenueTotal = analytics?.revenue?.total || 0;
    const utilizationAvg = analytics?.utilization?.averagePct || 0;
    const avgDrain = analytics?.battery?.avgDrainPerKm || null;
    const lowBatteryCount = analytics?.battery?.lowBattery?.length || 0;
    return {
      latestDay,
      latestWeek,
      latestMonth,
      revenueTotal,
      utilizationAvg,
      avgDrain,
      lowBatteryCount,
    };
  }, [analytics]);

  const analyticsTopRevenue = useMemo(
    () => (analytics?.revenue?.byVehicle || []).slice(0, 5),
    [analytics]
  );

  const analyticsTopUtilization = useMemo(
    () => (analytics?.utilization?.byVehicle || []).slice(0, 5),
    [analytics]
  );

  const analyticsTopAreas = useMemo(
    () => (analytics?.location?.topAreas || []).slice(0, 5),
    [analytics]
  );

  const analyticsTopCities = useMemo(
    () => (analytics?.location?.topCities || []).slice(0, 5),
    [analytics]
  );

  const analyticsIdleHeatmap = useMemo(
    () => analytics?.location?.idleHeatmap || [],
    [analytics]
  );

  const analyticsStartHotspots = useMemo(
    () => analytics?.location?.startHotspots || [],
    [analytics]
  );

  const analyticsEndHotspots = useMemo(
    () => analytics?.location?.endHotspots || [],
    [analytics]
  );

  useEffect(() => {
    let active = true;

    const load = async () => {
      try {
        setError("");
        if (active) setLoading(true);

        const params = new URLSearchParams();
        if (statusFilter !== "all") params.append("status", statusFilter);
        if (batteryMin > 0) params.append("batteryMin", batteryMin);
        if (batteryMax < 100) params.append("batteryMax", batteryMax);
        if (cityFilter) params.append("city", cityFilter);
        if (dateFrom) params.append("from", dateFrom);
        if (dateTo) params.append("to", dateTo);
        const query = params.toString();
        const url = query ? `/api/admin/iot/map?${query}` : "/api/admin/iot/map";

        const [mapPayload, zonesPayload] = await Promise.all([apiFetch(url), listAdminZones()]);

        if (!active) return;
        setDevices(Array.isArray(mapPayload?.devices) ? mapPayload.devices : []);
        setRoutes(Array.isArray(mapPayload?.routes) ? mapPayload.routes : []);
        setZones(Array.isArray(zonesPayload) ? zonesPayload : []);
      } catch (e) {
        if (!active) return;
        setError(String(e?.message || e || "Unable to load IoT map data"));
        setDevices([]);
        setRoutes([]);
        setZones([]);
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    const timer = setInterval(load, 15000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [statusFilter, batteryMin, batteryMax, cityFilter, dateFrom, dateTo]);

  useEffect(() => {
    let active = true;

    const loadAnalytics = async () => {
      try {
        if (active) {
          setAnalyticsLoading(true);
          setAnalyticsError("");
        }

        const params = new URLSearchParams();
        if (dateFrom) params.append("from", dateFrom);
        if (dateTo) params.append("to", dateTo);
        const query = params.toString();
        const url = query ? `/api/admin/analytics/fleet?${query}` : "/api/admin/analytics/fleet";

        const payload = await apiFetch(url);
        if (!active) return;
        setAnalytics(payload || null);
      } catch (e) {
        if (!active) return;
        setAnalyticsError(String(e?.message || e || "Unable to load analytics"));
        setAnalytics(null);
      } finally {
        if (active) setAnalyticsLoading(false);
      }
    };

    loadAnalytics();
    const timer = setInterval(loadAnalytics, 60000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (showRideHistory) {
      setMqttSnapshots({});
      return;
    }

    let active = true;

    const loadSnapshots = async () => {
      if (!trackedIds.length) {
        if (active) setMqttSnapshots({});
        return;
      }

      const entries = await Promise.all(
        trackedIds.map(async (id) => {
          try {
            const snapshot = await apiFetch(`/api/v1/iot/mqtt/device/${encodeURIComponent(String(id))}/snapshot`);
            return [String(id).toLowerCase(), snapshot || null];
          } catch {
            return [String(id).toLowerCase(), null];
          }
        })
      );

      if (!active) return;
      const next = {};
      entries.forEach(([key, snapshot]) => {
        next[key] = snapshot;
      });
      setMqttSnapshots(next);
    };

    loadSnapshots();
    const timer = setInterval(loadSnapshots, 10000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [trackedIds, showRideHistory]);

  const zoneMarkers = useMemo(() => {
    return zones
      .map((zone) => {
        const latitude = pickNumber(zone, ["latitude", "lat"]);
        const longitude = pickNumber(zone, ["longitude", "lng", "lon"]);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
        return { id: String(zone.id), name: String(zone.zone_name || zone.zone_code || `Zone ${zone.id}`), center: [latitude, longitude] };
      })
      .filter(Boolean);
  }, [zones]);

  const routeByVehicleId = useMemo(() => {
    const map = new Map();
    const timeByKey = new Map();
    for (const route of routes) {
      const keys = Array.isArray(route?.vehicleKeys) && route.vehicleKeys.length ? route.vehicleKeys : [route?.vehicleId];
      const routeTime = new Date(route?.updatedAt || route?.createdAt || 0).getTime();
      for (const rawKey of keys) {
        const key = String(rawKey || "").trim().toLowerCase();
        if (!key) continue;
        const existingTime = timeByKey.get(key);
        if (existingTime === undefined || routeTime > existingTime) {
          timeByKey.set(key, routeTime);
          map.set(key, route);
        }
      }
    }
    return map;
  }, [routes]);

  const allRoutesByVehicleId = useMemo(() => {
    const map = new Map();
    for (const route of routes) {
      const keys = Array.isArray(route?.vehicleKeys) && route.vehicleKeys.length ? route.vehicleKeys : [route?.vehicleId];
      for (const rawKey of keys) {
        const key = String(rawKey || "").trim().toLowerCase();
        if (key) {
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(route);
        }
      }
    }
    // Sort routes by updatedAt desc for each vehicle
    for (const [, routeList] of map) {
      routeList.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    }
    return map;
  }, [routes]);

  const vehicleRows = useMemo(() => {
    return devices
      .map((device) => {
        const vehicleId = String(device?.vehicleId || device?.id || "").trim();
        if (!vehicleId) return null;

        const route = routeByVehicleId.get(vehicleId.toLowerCase()) || null;
        const routePointsCount = Array.isArray(route?.points) && route.points.length
          ? route.points.length
          : Array.isArray(route?.beeponPoints) && route.beeponPoints.length
          ? route.beeponPoints.length
          : Array.isArray(route?.beepoffPoints) && route.beepoffPoints.length
          ? route.beepoffPoints.length
          : 0;
        const batteryPercent = Number(device?.batteryPercent);
        const speedKmh = Number(device?.speedKmh);

        return {
          ...device,
          vehicleId,
          vehicleLabel: String(device?.lockNumber || device?.imeiNumber || `Device ${vehicleId}`),
          route,
          routePointCount: routePointsCount,
          batteryPercent: Number.isFinite(batteryPercent) ? batteryPercent : null,
          speedKmh: Number.isFinite(speedKmh) ? speedKmh : null,
          modelName: device?.modelName || null,
          brandName: device?.brandName || null,
          color: device?.color || null,
        };
      })
      .filter(Boolean)
      .filter((device) => {
        const q = String(searchQuery || "").trim().toLowerCase();
        if (!q) return true;
        return (
          String(device.vehicleId || "").toLowerCase().includes(q) ||
          String(device.vehicleLabel || "").toLowerCase().includes(q) ||
          String(device.lockNumber || "").toLowerCase().includes(q) ||
          String(device.imeiNumber || "").toLowerCase().includes(q) ||
          String(device.modelName || "").toLowerCase().includes(q) ||
          String(device.brandName || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(b.lastUpdatedAt || 0).getTime() - new Date(a.lastUpdatedAt || 0).getTime());
  }, [devices, routeByVehicleId, searchQuery]);

  const visibleVehicles = useMemo(() => {
    if (showRideHistory && selectedVehicleId) {
      return vehicleRows.filter((vehicle) => String(vehicle.vehicleId) === String(selectedVehicleId));
    }
    if (selectedVehicleIds.length) {
      const idSet = new Set(selectedVehicleIds.map((id) => String(id)));
      return vehicleRows.filter((vehicle) => idSet.has(String(vehicle.vehicleId)));
    }
    if (!isolateSelected || !selectedVehicleId) return vehicleRows;
    return vehicleRows.filter((vehicle) => String(vehicle.vehicleId) === String(selectedVehicleId));
  }, [vehicleRows, isolateSelected, selectedVehicleId, showRideHistory, selectedVehicleIds]);

  useEffect(() => {
    const trailMap = liveTrailRef.current;
    const samplesMap = liveSamplesRef.current;
    let trailChanged = false;
    let samplesChanged = false;
    const now = Date.now();
    const trailCutoff = now - 1000 * 60 * 30;
    const sampleCutoff = now - STOP_SAMPLE_WINDOW_MS;

    for (const device of devices) {
      const vehicleId = String(device?.vehicleId || device?.id || "").trim();
      if (!vehicleId) continue;
      const status = String(device?.status || "").toLowerCase();

      const lat = Number(device?.lat);
      const lng = Number(device?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      const key = vehicleId.toLowerCase();
      if (status === "in_use") {
        const trail = trailMap.get(key) || [];
        const last = trail[trail.length - 1];
        const isSame = last && Math.abs(last.lat - lat) < 0.000001 && Math.abs(last.lng - lng) < 0.000001;

        if (!isSame) {
          const nextTrail = [...trail, { lat, lng, ts: now }];
          if (nextTrail.length > 120) nextTrail.splice(0, nextTrail.length - 120);
          trailMap.set(key, nextTrail);
          trailChanged = true;
        }
      }

      const samples = samplesMap.get(key) || [];
      const nextSamples = [...samples, { lat, lng, ts: now }];
      const trimmedSamples = nextSamples.filter((point) => point.ts >= sampleCutoff);
      if (trimmedSamples.length > STOP_SAMPLE_MAX) {
        trimmedSamples.splice(0, trimmedSamples.length - STOP_SAMPLE_MAX);
      }
      samplesMap.set(key, trimmedSamples);
      samplesChanged = true;
    }

    for (const [key, trail] of trailMap.entries()) {
      const last = trail[trail.length - 1];
      if (!last || last.ts < trailCutoff) {
        trailMap.delete(key);
        trailChanged = true;
      }
    }

    for (const [key, samples] of samplesMap.entries()) {
      const trimmed = samples.filter((point) => point.ts >= sampleCutoff);
      if (trimmed.length === 0) {
        samplesMap.delete(key);
        samplesChanged = true;
      } else if (trimmed.length !== samples.length) {
        samplesMap.set(key, trimmed);
        samplesChanged = true;
      }
    }

    if (trailChanged) setLiveTrailVersion((version) => version + 1);
    if (samplesChanged) setLiveSamplesVersion((version) => version + 1);
  }, [devices]);

  useEffect(() => {
    if (!vehicleRows.length) {
      setSelectedVehicleId("");
      return;
    }

    const exists = vehicleRows.some((vehicle) => vehicle.vehicleId === selectedVehicleId);
    if (!exists) setSelectedVehicleId(vehicleRows[0].vehicleId);
  }, [selectedVehicleId, vehicleRows]);

  useEffect(() => {
    return () => {
      if (playbackTimerRef.current) {
        clearInterval(playbackTimerRef.current);
        playbackTimerRef.current = null;
      }
      if (playbackAnimRef.current) {
        cancelAnimationFrame(playbackAnimRef.current);
        playbackAnimRef.current = null;
      }
    };
  }, []);

  function stopPlayback() {
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    if (playbackAnimRef.current) {
      cancelAnimationFrame(playbackAnimRef.current);
      playbackAnimRef.current = null;
    }
    setIsPlaying(false);
    setPlayIndex(0);
    setAnimatedPos(null);
    setAnimatedHeading(0);
  }

  function pausePlayback() {
    if (playbackTimerRef.current) {
      clearInterval(playbackTimerRef.current);
      playbackTimerRef.current = null;
    }
    if (playbackAnimRef.current) {
      cancelAnimationFrame(playbackAnimRef.current);
      playbackAnimRef.current = null;
    }
    setIsPlaying(false);
  }

  function startPlayback(points, startIndex = 0) {
    if (!Array.isArray(points) || !points.length) return;
    stopPlayback();
    setIsPlaying(true);
    setPlayIndex(startIndex);
    let idx = startIndex;

    const step = () => {
      if (idx >= points.length - 1) {
        stopPlayback();
        return;
      }

      const startPoint = points[idx];
      const endPoint = points[idx + 1];
      let progress = 0;
      const stepSize = Math.min(0.2, Math.max(0.01, 0.02 * playbackSpeed));

      const frame = () => {
        progress += stepSize;
        if (progress >= 1) {
          idx += 1;
          setPlayIndex(idx);
          step();
          return;
        }

        const interpolated = interpolatePosition(startPoint, endPoint, progress);
        setAnimatedPos(interpolated);

        const heading = getHeadingDegrees(startPoint, endPoint);
        if (Number.isFinite(heading)) setAnimatedHeading(heading);

        playbackAnimRef.current = requestAnimationFrame(frame);
      };

      frame();
    };

    step();
  }

  const selectedVehicle = useMemo(() => {
    if (!vehicleRows.length) return null;
    return vehicleRows.find((vehicle) => vehicle.vehicleId === selectedVehicleId) || vehicleRows[0];
  }, [selectedVehicleId, vehicleRows]);

  const selectedVehicleSnapshot = useMemo(() => getSnapshotForVehicle(selectedVehicle), [selectedVehicle, mqttSnapshotMap]);
  const selectedVehicleSpeed = useMemo(
    () => parseSnapshotSpeed(selectedVehicleSnapshot) ?? selectedVehicle?.speedKmh ?? null,
    [selectedVehicleSnapshot, selectedVehicle]
  );
  const selectedVehicleEngineOn = useMemo(
    () => parseSnapshotEngineState(selectedVehicleSnapshot),
    [selectedVehicleSnapshot]
  );
  const selectedVehicleLastSeenMs = useMemo(() => {
    const snapshotTime = selectedVehicleSnapshot?.receivedAt ? new Date(selectedVehicleSnapshot.receivedAt).getTime() : null;
    if (Number.isFinite(snapshotTime)) return snapshotTime;
    const fallback = selectedVehicle?.lastUpdatedAt ? new Date(selectedVehicle.lastUpdatedAt).getTime() : null;
    return Number.isFinite(fallback) ? fallback : null;
  }, [selectedVehicleSnapshot, selectedVehicle]);
  const selectedVehicleTripState = useMemo(
    () => computeTripState({ speed: selectedVehicleSpeed, engineOn: selectedVehicleEngineOn, lastSeenMs: selectedVehicleLastSeenMs }),
    [selectedVehicleSpeed, selectedVehicleEngineOn, selectedVehicleLastSeenMs]
  );

  const toggleTrackedVehicle = (vehicleId) => {
    const id = String(vehicleId);
    setSelectedVehicleIds((prev) => {
      const exists = prev.some((v) => String(v) === id);
      if (exists) return prev.filter((v) => String(v) !== id);
      if (prev.length >= MULTI_SELECT_LIMIT) return prev;
      return [...prev, id];
    });
  };

  const clearTrackedVehicles = () => {
    setSelectedVehicleIds([]);
  };

  const vehicleRideHistory = useMemo(() => {
    if (!selectedVehicleId) return [];
    const allRoutes = allRoutesByVehicleId.get(selectedVehicleId.toLowerCase()) || [];
    return allRoutes.map((route) => ({
      id: route.id,
      startTime: route.createdAt ? new Date(route.createdAt) : new Date(0),
      endTime: route.updatedAt ? new Date(route.updatedAt) : new Date(route.createdAt || 0),
      distance: route.distanceMeters,
      pointCount: Array.isArray(route.points) ? route.points.length : 0,
      startBattery: route.rideStartBatteryPercent,
      endBattery: route.rideEndBatteryPercent,
      route,
    }));
  }, [selectedVehicleId, allRoutesByVehicleId]);

  useEffect(() => {
    if (!showRideHistory) return;
    setIsolateSelected(true);
    if (!vehicleRideHistory.length) {
      if (selectedRideId !== null) setSelectedRideId(null);
      return;
    }
    const exists = vehicleRideHistory.some((ride) => String(ride.id) === String(selectedRideId));
    if (!selectedRideId || !exists) {
      setSelectedRideId(vehicleRideHistory[0].id);
    }
  }, [showRideHistory, vehicleRideHistory, selectedRideId]);

  const downloadRideHistoryCsv = () => {
    if (!selectedVehicle) return;
    const csv = buildRideHistoryCsv(selectedVehicle, vehicleRideHistory);
    if (!csv) return;

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const baseName = selectedVehicle.vehicleLabel || selectedVehicle.vehicleId || "vehicle";
    const safeName = String(baseName).replace(/[^a-z0-9-_]+/gi, "-").replace(/^-+|-+$/g, "");

    link.href = url;
    link.download = `ride-history-${safeName || "vehicle"}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const selectedRoute = useMemo(() => {
    if (showRideHistory && selectedRideId) {
      const ride = vehicleRideHistory.find(r => r.id === selectedRideId);
      return ride?.route || null;
    }
    return selectedVehicle?.route || null;
  }, [showRideHistory, selectedRideId, vehicleRideHistory, selectedVehicle]);

  const selectedRoutePoints = useMemo(() => {
    if (!selectedRoute) return [];
    if (Array.isArray(selectedRoute.points) && selectedRoute.points.length) return selectedRoute.points;
    if (Array.isArray(selectedRoute.beeponPoints) && selectedRoute.beeponPoints.length) return selectedRoute.beeponPoints;
    if (Array.isArray(selectedRoute.beepoffPoints) && selectedRoute.beepoffPoints.length) return selectedRoute.beepoffPoints;
    return [];
  }, [selectedRoute]);

  useEffect(() => {
    // Reset playback when route changes
    stopPlayback();
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
  }, [selectedRoute?.id]);

  const selectedRouteSegments = useMemo(() => {
    if (!Array.isArray(selectedRoutePoints) || selectedRoutePoints.length === 0) return [];
    return buildCleanSegments(selectedRoutePoints, { minMeters: 25, maxJumpMeters: 300, maxSpeedKmh: 70 });
  }, [selectedRoutePoints]);

  const selectedLiveSegments = useMemo(() => {
    if (!selectedVehicle) return [];
    if (String(selectedVehicle.status || "").toLowerCase() !== "in_use") return [];
    const key = String(selectedVehicle.vehicleId || "").toLowerCase();
    const trail = liveTrailRef.current.get(key) || [];
    return buildCleanSegments(trail, { minMeters: 16, maxJumpMeters: 140, maxSpeedKmh: 50, maxGapMs: 1000 * 60 * 4 });
  }, [selectedVehicle, liveTrailVersion]);

  const ghostTrailSegments = useMemo(() => {
    if (showRideHistory) return new Map();
    const now = Date.now();
    const cutoff = now - GHOST_TRAIL_WINDOW_MS;
    const map = new Map();
    const ids = trackedIds.length ? trackedIds : [];
    ids.forEach((id) => {
      const key = String(id).toLowerCase();
      const trail = liveTrailRef.current.get(key) || [];
      const recent = trail.filter((point) => point.ts >= cutoff);
      const segments = buildCleanSegments(recent, { minMeters: 10, maxJumpMeters: 140, maxSpeedKmh: 50, maxGapMs: 1000 * 60 * 2 });
      if (segments.length) map.set(key, segments);
    });
    return map;
  }, [trackedIds, liveTrailVersion, showRideHistory]);

  const selectedRoutePrimarySegment = useMemo(() => {
    return selectPrimarySegment(selectedRouteSegments, selectedRoute?.startPoint, selectedRoute?.endPoint);
  }, [selectedRouteSegments, selectedRoute]);

  const selectedLivePrimarySegment = useMemo(() => {
    return selectLastSegment(selectedLiveSegments);
  }, [selectedLiveSegments]);

  const selectedRoutePlaybackPoints = useMemo(
    () => flattenSegments(selectedRoutePrimarySegment.length ? [selectedRoutePrimarySegment] : []),
    [selectedRoutePrimarySegment]
  );

  const selectedLivePlaybackPoints = useMemo(
    () => flattenSegments(selectedLivePrimarySegment.length ? [selectedLivePrimarySegment] : []),
    [selectedLivePrimarySegment]
  );

  function animateVehicle(path) {
    if (!Array.isArray(path) || path.length < 2) return;
    if (animationRef.current) cancelAnimationFrame(animationRef.current);

    let i = 0;

    const step = () => {
      if (i >= path.length - 1) return;
      const start = path[i];
      const end = path[i + 1];

      let progress = 0;

      const frame = () => {
        progress += 0.05;

        if (progress >= 1) {
          i += 1;
          step();
          return;
        }

        const interpolated = interpolatePosition(start, end, progress);
        setAnimatedPos(interpolated);

        const heading = getHeadingDegrees(start, end);
        if (Number.isFinite(heading)) setAnimatedHeading(heading);

        animationRef.current = requestAnimationFrame(frame);
      };

      frame();
    };

    step();
  }

  useEffect(() => {
    if (!showRideHistory && selectedLivePlaybackPoints.length > 2) {
      animateVehicle(selectedLivePlaybackPoints);
    }
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [selectedLivePlaybackPoints, showRideHistory]);

  const selectedPathSegments = useMemo(() => {
    if (showRideHistory) {
      return selectedRideId && selectedRoutePrimarySegment.length ? [selectedRoutePrimarySegment] : [];
    }
    return selectedLivePrimarySegment.length ? [selectedLivePrimarySegment] : [];
  }, [showRideHistory, selectedRideId, selectedRoutePrimarySegment, selectedLivePrimarySegment]);

  const selectedLiveSamples = useMemo(() => {
    if (!selectedVehicleId) return [];
    const key = String(selectedVehicleId).toLowerCase();
    return liveSamplesRef.current.get(key) || [];
  }, [selectedVehicleId, liveSamplesVersion]);

  const selectedStopInfo = useMemo(() => {
    if (showRideHistory && selectedRoutePoints.length) {
      return { points: selectedRoutePoints, source: "history" };
    }
    if (selectedLiveSamples.length >= 2) {
      return { points: selectedLiveSamples, source: "live" };
    }
    if (selectedRoutePoints.length) {
      return { points: selectedRoutePoints, source: "history" };
    }
    return { points: [], source: "none" };
  }, [showRideHistory, selectedRoutePoints, selectedLiveSamples]);

  const selectedStops = useMemo(() => {
    if (!selectedStopInfo.points.length) return [];
    return buildStopMarkers(selectedStopInfo.points, { minStopMs: STOP_MIN_MS, radiusMeters: STOP_RADIUS_METERS });
  }, [selectedStopInfo]);

  const stopSourceLabel = useMemo(() => {
    if (selectedStopInfo.source === "live") {
      return `Live stops (last ${formatStopDuration(STOP_SAMPLE_WINDOW_MS)})`;
    }
    if (selectedStopInfo.source === "history") return "Ride stops";
    return "Stops";
  }, [selectedStopInfo]);

  const stopMarkers = useMemo(
    () => selectedStops.map((stop, index) => ({ ...stop, label: formatStopLabel(index) })),
    [selectedStops]
  );

  const selectedLiveHeading = useMemo(() => {
    if (selectedLivePlaybackPoints.length < 2) return null;
    const lastIndex = selectedLivePlaybackPoints.length - 1;
    return getHeadingDegrees(selectedLivePlaybackPoints[lastIndex - 1], selectedLivePlaybackPoints[lastIndex]);
  }, [selectedLivePlaybackPoints]);

  const playbackHeading = useMemo(() => {
    if (!selectedRoutePlaybackPoints.length || playIndex <= 0) return null;
    const prev = selectedRoutePlaybackPoints[playIndex - 1];
    const curr = selectedRoutePlaybackPoints[playIndex];
    if (!prev || !curr) return null;
    return getHeadingDegrees([Number(prev[0]), Number(prev[1])], [Number(curr[0]), Number(curr[1])]);
  }, [selectedRoutePlaybackPoints, playIndex]);

  const selectedPathColor = useMemo(() => {
    if (showRideHistory) return "#0f172a";
    return "#10b981";
  }, [showRideHistory]);

  const mapCenter = useMemo(() => {
    if (selectedPathSegments.length) {
      return { lat: selectedPathSegments[0][0][0], lng: selectedPathSegments[0][0][1] };
    }
    if (selectedVehicle && Number.isFinite(Number(selectedVehicle.lat)) && Number.isFinite(Number(selectedVehicle.lng))) {
      return { lat: Number(selectedVehicle.lat), lng: Number(selectedVehicle.lng) };
    }
    if (zoneMarkers.length) {
      return { lat: zoneMarkers[0].center[0], lng: zoneMarkers[0].center[1] };
    }
    return MAP_FALLBACK_CENTER;
  }, [selectedPathSegments, selectedVehicle, zoneMarkers]);

  const selectedMarker = animatedPos && (isPlaying || (!showRideHistory && selectedLivePlaybackPoints.length > 2))
    ? { lat: Number(animatedPos[0]), lng: Number(animatedPos[1]) }
    : selectedVehicle && Number.isFinite(Number(selectedVehicle.lat)) && Number.isFinite(Number(selectedVehicle.lng))
      ? { lat: Number(selectedVehicle.lat), lng: Number(selectedVehicle.lng) }
      : null;

  const shouldCluster = !showRideHistory && visibleVehicles.length >= 100;

  const trackedCount = vehicleRows.length;
  const movingCount = useMemo(
    () => vehicleRows.filter((vehicle) => String(vehicle.status || "").toLowerCase() === "in_use").length,
    [vehicleRows]
  );
  const lowBatteryCount = useMemo(
    () => vehicleRows.filter((vehicle) => Number.isFinite(Number(vehicle.batteryPercent)) && Number(vehicle.batteryPercent) <= 30).length,
    [vehicleRows]
  );

  const routeStart = showRideHistory && selectedRoutePrimarySegment.length
    ? { lat: selectedRoutePrimarySegment[0][0], lng: selectedRoutePrimarySegment[0][1] }
    : null;
  const routeEnd = showRideHistory && selectedRoutePrimarySegment.length
    ? { lat: selectedRoutePrimarySegment[selectedRoutePrimarySegment.length - 1][0], lng: selectedRoutePrimarySegment[selectedRoutePrimarySegment.length - 1][1] }
    : null;

  const mapOptions = useMemo(() => {
    return {
      mapId: googleMapId || undefined,
      mapTypeId: "roadmap",
      tilt: 67.5,
      heading: 25,
      mapTypeControl: false,
      rotateControl: true,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
      gestureHandling: "greedy",
    };
  }, [googleMapId]);

  const mapContainerStyle = useMemo(() => ({ width: "100%", height: "100%" }), []);

  const zoneSymbol = useMemo(() => buildCircleSymbol("#16a34a", 6, 2), [isLoaded]);
  const startSymbol = useMemo(() => buildCircleSymbol("#22c55e", 6, 2), [isLoaded]);
  const endSymbol = useMemo(() => buildCircleSymbol("#ef4444", 6, 2), [isLoaded]);
  const stopSymbol = useMemo(() => buildCircleSymbol("#ef4444", 7, 2), [isLoaded]);

  return (
    <div className="h-screen w-full flex bg-[#f7f8fc]">
      <AdminSidebar />

      <main className="flex-1 w-full min-w-0 overflow-x-hidden overflow-y-auto sm:ml-[var(--admin-sidebar-width,16rem)] space-y-6">
        <AdminTopbar title="Live Vehicle Map" subtitle="Real-time GPS path and battery tracking from IoT tables" />

        <div className="p-4 sm:p-6 lg:p-8 space-y-5">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="text-xs text-slate-500">Tracked Vehicles</div>
              <div className="mt-1 inline-flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <Bike size={18} className="text-emerald-600" />
                {trackedCount}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="text-xs text-slate-500">Running</div>
              <div className="mt-1 inline-flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <Activity size={18} className="text-emerald-600" />
                {movingCount}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="text-xs text-slate-500">Low Battery</div>
              <div className="mt-1 inline-flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <AlertTriangle size={18} className="text-rose-500" />
                {lowBatteryCount}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <div className="text-xs text-slate-500">Route History</div>
              <div className="mt-1 inline-flex items-center gap-2 text-3xl font-semibold text-slate-900">
                <Route size={18} className="text-blue-600" />
                {routes.length}
              </div>
            </div>
          </div>

          {error ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

          <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 py-1 text-sm font-semibold text-slate-700">
                    <Navigation size={14} /> Vehicle GPS Path
                  </div>
                  <div className="text-xs text-slate-500">Select a vehicle to draw its actual path</div>
                </div>

                <div className="grid gap-2 md:grid-cols-3 mb-2">
                  <div>
                    <label className="block text-xs text-slate-500">Status</label>
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full rounded-md border px-2 py-1 text-sm">
                      <option value="all">All</option>
                      <option value="in_use">Running</option>
                      <option value="available">Available</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500">Battery % Range</label>
                    <div className="flex gap-2">
                      <input type="number" min={0} max={100} value={batteryMin} onChange={(e) => setBatteryMin(Number(e.target.value || 0))} className="w-1/2 rounded-md border px-2 py-1 text-sm" />
                      <input type="number" min={0} max={100} value={batteryMax} onChange={(e) => setBatteryMax(Number(e.target.value || 100))} className="w-1/2 rounded-md border px-2 py-1 text-sm" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500">City</label>
                    <input value={cityFilter} onChange={(e) => setCityFilter(e.target.value)} placeholder="City ID" className="w-full rounded-md border px-2 py-1 text-sm" />
                  </div>
                </div>

                <div className="grid gap-2 md:grid-cols-3 mb-3">
                  <div>
                    <label className="block text-xs text-slate-500">From</label>
                    <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full rounded-md border px-2 py-1 text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500">To</label>
                    <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full rounded-md border px-2 py-1 text-sm" />
                  </div>
                  <div className="flex items-end gap-2">
                    <button type="button" onClick={() => { setDateFrom(""); setDateTo(""); setBatteryMin(0); setBatteryMax(100); setStatusFilter("all"); setCityFilter(""); }} className="px-3 py-1 rounded-md bg-slate-100 text-sm">Reset</button>
                    {isolateSelected ? (
                      <button
                        type="button"
                        onClick={() => setIsolateSelected(false)}
                        className="px-3 py-1 rounded-md bg-indigo-100 text-indigo-700 text-sm"
                      >
                        Show all
                      </button>
                    ) : null}
                  </div>
                </div>

                <label className="relative block">
                  <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search vehicle, lock number, IMEI, model or brand"
                    className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-500"
                  />
                </label>
              </div>

              <div className="h-[64vh]">
                {!googleMapsApiKey ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-500">
                    Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to enable the map.
                  </div>
                ) : loadError ? (
                  <div className="h-full flex items-center justify-center text-sm text-rose-600">
                    Unable to load Google Maps.
                  </div>
                ) : !isLoaded ? (
                  <div className="h-full flex items-center justify-center text-sm text-slate-500">
                    Loading Google Maps...
                  </div>
                ) : (
                  <GoogleMap
                    mapContainerStyle={mapContainerStyle}
                    center={mapCenter}
                    zoom={14}
                    options={mapOptions}
                  >
                    <MapFocusController target={selectedMarker} enabled={autoFollow} speedKmh={selectedVehicleSpeed} />

                    {zoneMarkers.map((zone) => (
                      <MarkerF
                        key={`zone-${zone.id}`}
                        position={{ lat: zone.center[0], lng: zone.center[1] }}
                        icon={zoneSymbol}
                        clickable={false}
                      />
                    ))}

                    {showIdleHeatmap && analyticsIdleHeatmap.length
                      ? analyticsIdleHeatmap.map((point, idx) => (
                        <MarkerF
                          key={`idle-${idx}`}
                          position={{ lat: point.lat, lng: point.lng }}
                          icon={buildCircleSymbol("#f59e0b", scaleForCount(point.vehicles, 5, 14), 1)}
                          clickable={false}
                        />
                      ))
                      : null}

                    {showStartHotspots && analyticsStartHotspots.length
                      ? analyticsStartHotspots.map((point, idx) => (
                        <MarkerF
                          key={`hotspot-start-${idx}`}
                          position={{ lat: point.lat, lng: point.lng }}
                          icon={buildCircleSymbol("#22c55e", scaleForCount(point.rides, 4, 12), 1)}
                          clickable={false}
                        />
                      ))
                      : null}

                    {showEndHotspots && analyticsEndHotspots.length
                      ? analyticsEndHotspots.map((point, idx) => (
                        <MarkerF
                          key={`hotspot-end-${idx}`}
                          position={{ lat: point.lat, lng: point.lng }}
                          icon={buildCircleSymbol("#ef4444", scaleForCount(point.rides, 4, 12), 1)}
                          clickable={false}
                        />
                      ))
                      : null}

                    {ghostTrailSegments.size ? (
                      Array.from(ghostTrailSegments.entries()).map(([key, segments]) =>
                        segments.map((segment, idx) => (
                          <Polyline
                            key={`ghost-${key}-${idx}`}
                            path={segment.map((point) => ({ lat: point[0], lng: point[1] }))}
                            options={{ strokeColor: "#64748b", strokeOpacity: 0.25, strokeWeight: 3 }}
                          />
                        ))
                      )
                    ) : null}

                    {selectedPathSegments.length ? (
                      selectedPathSegments.map((segment, idx) => (
                        <Polyline
                          key={`path-${idx}`}
                          path={segment.map((point) => ({ lat: point[0], lng: point[1] }))}
                          options={{ strokeColor: selectedPathColor, strokeOpacity: 0.9, strokeWeight: 5 }}
                        />
                      ))
                    ) : null}

                    {stopMarkers.map((stop) => (
                      <MarkerF
                        key={`stop-${stop.label}-${stop.startTs}`}
                        position={{ lat: stop.lat, lng: stop.lng }}
                        icon={stopSymbol}
                        label={{
                          text: stop.label,
                          color: "#ffffff",
                          fontWeight: "700",
                          fontSize: "12px",
                        }}
                        title={`Stop ${stop.label} - ${formatStopDuration(stop.durationMs)}`}
                        zIndex={6}
                      />
                    ))}

                    {animatedPos ? (
                      <VehicleOverlay
                        position={{ lat: Number(animatedPos[0]), lng: Number(animatedPos[1]) }}
                        heading={isPlaying ? playbackHeading : animatedHeading}
                        image={selectVehicleImage(selectedVehicle?.brandName, selectedVehicle?.modelName)}
                      />
                    ) : null}

                    {routeStart ? (
                      <MarkerF position={routeStart} icon={startSymbol} clickable={false} />
                    ) : null}

                    {routeEnd ? (
                      <MarkerF position={routeEnd} icon={endSymbol} clickable={false} />
                    ) : null}

                    {shouldCluster ? (
                      <MarkerClusterer>
                        {(clusterer) => (
                          visibleVehicles.map((vehicle) => {
                            const position = { lat: Number(vehicle.lat), lng: Number(vehicle.lng) };
                            const isSelected = String(vehicle.vehicleId) === String(selectedVehicleId);
                            const vehicleImage = selectVehicleImage(vehicle.brandName, vehicle.modelName);

                            if (isSelected && Number.isFinite(selectedLiveHeading)) {
                              return null;
                            }

                            return (
                              <MarkerF
                                key={`vehicle-${vehicle.vehicleId}`}
                                position={position}
                                icon={getVehicleMarkerIcon(vehicleImage)}
                                clusterer={clusterer}
                                onClick={() => {
                                  setSelectedVehicleId(vehicle.vehicleId);
                                  setIsolateSelected(true);
                                }}
                              />
                            );
                          })
                        )}
                      </MarkerClusterer>
                    ) : (
                      visibleVehicles.map((vehicle) => {
                        const position = { lat: Number(vehicle.lat), lng: Number(vehicle.lng) };
                        const isSelected = String(vehicle.vehicleId) === String(selectedVehicleId);
                        const vehicleImage = selectVehicleImage(vehicle.brandName, vehicle.modelName);

                        if (isSelected && Number.isFinite(selectedLiveHeading)) {
                          return (
                            <VehicleOverlay
                              key={`vehicle-${vehicle.vehicleId}`}
                              position={position}
                              heading={selectedLiveHeading}
                              image={vehicleImage}
                            />
                          );
                        }

                        return (
                          <MarkerF
                            key={`vehicle-${vehicle.vehicleId}`}
                            position={position}
                            icon={getVehicleMarkerIcon(vehicleImage)}
                            onClick={() => {
                              setSelectedVehicleId(vehicle.vehicleId);
                              setIsolateSelected(true);
                            }}
                          />
                        );
                      })
                    )}

                    {selectedVehicle && Number.isFinite(selectedLiveHeading) && !shouldCluster ? (
                      <VehicleOverlay
                        position={{ lat: Number(selectedVehicle.lat), lng: Number(selectedVehicle.lng) }}
                        heading={selectedLiveHeading}
                        image={selectVehicleImage(selectedVehicle.brandName, selectedVehicle.modelName)}
                      />
                    ) : null}
                  </GoogleMap>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-semibold text-slate-900">Smart Analytics</div>
                  <div className="text-xs text-slate-500">
                    Fleet, battery, and location insights from ride history
                  </div>
                </div>
                <div className="text-[11px] text-slate-500">
                  Range: {dateFrom || "last 30 days"} {dateTo ? `to ${dateTo}` : ""}
                </div>
              </div>

              {analyticsError ? (
                <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  {analyticsError}
                </div>
              ) : null}

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase text-slate-500">Fleet Insights</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                    <div>Rides today: <span className="font-semibold text-slate-900">{analyticsSummary.latestDay}</span></div>
                    <div>Rides this week: <span className="font-semibold text-slate-900">{analyticsSummary.latestWeek}</span></div>
                    <div>Rides this month: <span className="font-semibold text-slate-900">{analyticsSummary.latestMonth}</span></div>
                    <div>Revenue: <span className="font-semibold text-slate-900">INR {formatAmount(analyticsSummary.revenueTotal)}</span></div>
                    <div>Avg utilization: <span className="font-semibold text-slate-900">{analyticsSummary.utilizationAvg}%</span></div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase text-slate-500">Battery Intelligence</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                    <div>Avg drain: <span className="font-semibold text-slate-900">{analyticsSummary.avgDrain ?? "-"} %/km</span></div>
                    <div>Low battery vehicles: <span className="font-semibold text-slate-900">{analyticsSummary.lowBatteryCount}</span></div>
                  </div>
                  <div className="mt-3 text-[11px] text-slate-500">Top drains</div>
                  <div className="mt-1 space-y-1">
                    {(analytics?.battery?.byVehicle || []).slice(0, 3).map((row) => (
                      <div key={`drain-${row.lockId || row.lockNumber}`} className="flex items-center justify-between text-xs text-slate-600">
                        <span className="truncate">{row.lockNumber || row.lockId}</span>
                        <span className="font-semibold text-slate-800">{row.avgDrainPerKm ?? "-"}</span>
                      </div>
                    ))}
                    {!analyticsLoading && (!analytics?.battery?.byVehicle || analytics?.battery?.byVehicle?.length === 0) ? (
                      <div className="text-xs text-slate-400">No battery drain data</div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase text-slate-500">Location Intelligence</div>
                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                    <div>Idle clusters: <span className="font-semibold text-slate-900">{analyticsIdleHeatmap.length}</span></div>
                    <div>Start hotspots: <span className="font-semibold text-slate-900">{analyticsStartHotspots.length}</span></div>
                    <div>End hotspots: <span className="font-semibold text-slate-900">{analyticsEndHotspots.length}</span></div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={showIdleHeatmap} onChange={(e) => setShowIdleHeatmap(e.target.checked)} />
                      Idle heatmap
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={showStartHotspots} onChange={(e) => setShowStartHotspots(e.target.checked)} />
                      Start hotspots
                    </label>
                    <label className="flex items-center gap-2 text-xs text-slate-600">
                      <input type="checkbox" checked={showEndHotspots} onChange={(e) => setShowEndHotspots(e.target.checked)} />
                      End hotspots
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-100 px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase text-slate-500">Top Revenue Vehicles</div>
                  <div className="mt-2 space-y-1">
                    {analyticsTopRevenue.map((row) => (
                      <div key={`rev-${row.lockId || row.lockNumber}`} className="flex items-center justify-between text-xs text-slate-700">
                        <span className="truncate">{row.lockNumber || row.lockId}</span>
                        <span className="font-semibold">INR {formatAmount(row.revenue)}</span>
                      </div>
                    ))}
                    {!analyticsLoading && analyticsTopRevenue.length === 0 ? (
                      <div className="text-xs text-slate-400">No revenue data</div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase text-slate-500">Top Utilization</div>
                  <div className="mt-2 space-y-1">
                    {analyticsTopUtilization.map((row) => (
                      <div key={`util-${row.lockId || row.lockNumber}`} className="flex items-center justify-between text-xs text-slate-700">
                        <span className="truncate">{row.lockNumber || row.lockId}</span>
                        <span className="font-semibold">{row.utilizationPct}%</span>
                      </div>
                    ))}
                    {!analyticsLoading && analyticsTopUtilization.length === 0 ? (
                      <div className="text-xs text-slate-400">No utilization data</div>
                    ) : null}
                  </div>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-100 px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase text-slate-500">Top Areas</div>
                  <div className="mt-2 space-y-1">
                    {analyticsTopAreas.map((row) => (
                      <div key={`area-${row.areaId || row.areaName}`} className="flex items-center justify-between text-xs text-slate-700">
                        <span className="truncate">{row.areaName || row.areaId}</span>
                        <span className="font-semibold">{row.rides}</span>
                      </div>
                    ))}
                    {!analyticsLoading && analyticsTopAreas.length === 0 ? (
                      <div className="text-xs text-slate-400">No area data</div>
                    ) : null}
                  </div>
                </div>

                <div className="rounded-xl border border-slate-100 px-3 py-3">
                  <div className="text-[11px] font-semibold uppercase text-slate-500">Top Cities</div>
                  <div className="mt-2 space-y-1">
                    {analyticsTopCities.map((row) => (
                      <div key={`city-${row.mapCityId || row.mapCityName}`} className="flex items-center justify-between text-xs text-slate-700">
                        <span className="truncate">{row.mapCityName || row.mapCityId}</span>
                        <span className="font-semibold">{row.rides}</span>
                      </div>
                    ))}
                    {!analyticsLoading && analyticsTopCities.length === 0 ? (
                      <div className="text-xs text-slate-400">No city data</div>
                    ) : null}
                  </div>
                </div>
              </div>

              {analyticsLoading ? (
                <div className="mt-3 text-xs text-slate-500">Refreshing analytics...</div>
              ) : null}
            </div>
            </div>

            <aside className="h-[74vh] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="text-lg font-semibold text-slate-900">IoT Vehicles</div>
                <div className="mt-1 text-xs text-slate-500">Live GPS and battery snapshots from the database</div>
              </div>

              <div className="border-b border-slate-100">
                <div className="flex gap-2 px-4 py-2">
                  <button
                    type="button"
                    onClick={() => { setShowRideHistory(false); setSelectedRideId(null); }}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition ${
                      !showRideHistory
                        ? "bg-indigo-100 text-indigo-700"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Live Vehicles
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowRideHistory(true)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition ${
                      showRideHistory
                        ? "bg-indigo-100 text-indigo-700"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    Ride History ({vehicleRideHistory.length})
                  </button>
                </div>
              </div>

              {!showRideHistory ? (
                <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-slate-100 text-xs text-slate-500">
                  <span>Tracking: {selectedVehicleIds.length || (selectedVehicleId ? 1 : 0)}/{MULTI_SELECT_LIMIT}</span>
                  {selectedVehicleIds.length ? (
                    <button type="button" onClick={clearTrackedVehicles} className="rounded-md bg-slate-100 px-2 py-1 text-[11px] text-slate-600">
                      Clear selection
                    </button>
                  ) : null}
                </div>
              ) : null}

              <div className="h-[calc(74vh-62px)] overflow-y-auto px-3 py-3 space-y-3">
                {selectedVehicle ? (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{selectedVehicle.vehicleLabel}</div>
                        <div className="text-xs text-slate-500">{selectedVehicle.modelName || "Unknown Model"}</div>
                        <div className="text-xs text-slate-500">{selectedVehicle.brandName || "Unknown Brand"}</div>
                      </div>
                      <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-700">
                        {selectedVehicle.status || "available"}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-600">Battery: {selectedVehicle.batteryPercent ?? "N/A"}%</div>
                    <div className="mt-1 text-xs text-slate-600">Speed: {selectedVehicleSpeed ?? 0} km/h</div>
                    <div className="mt-1 text-xs text-slate-600">Trip state: {selectedVehicleTripState}</div>
                    <div className="mt-1 text-xs text-slate-600">Engine: {selectedVehicleEngineOn === null ? "Unknown" : selectedVehicleEngineOn ? "On" : "Off"}</div>
                    <div className="mt-1 text-xs text-slate-600">Route points: {selectedVehicle.routePointCount}</div>
                    <div className="mt-1 text-xs text-slate-600">Stops (&gt;=5 min): {selectedStops.length}</div>
                    {stopMarkers.length ? (
                      <div className="mt-2 rounded-lg bg-white/70 px-2 py-2">
                        <div className="text-[11px] font-semibold uppercase text-slate-500">{stopSourceLabel}</div>
                        <div className="mt-1 space-y-1">
                          {stopMarkers.slice(0, 5).map((stop) => (
                            <div key={`stop-row-${stop.label}-${stop.startTs}`} className="flex items-center justify-between text-xs text-slate-700">
                              <span className="font-semibold text-rose-600">Stop {stop.label}</span>
                              <span className="text-slate-600">{formatStopDuration(stop.durationMs)}</span>
                            </div>
                          ))}
                          {stopMarkers.length > 5 ? (
                            <div className="text-[11px] text-slate-500">+{stopMarkers.length - 5} more</div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-1 text-xs text-slate-600">Source: inventory.tbl_lock_detail + admin.tbl_ride_booking</div>
                  </div>
                ) : null}

                {showRideHistory && selectedVehicle && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                    <div className="text-sm font-semibold text-slate-900">{selectedVehicle.vehicleLabel} - Ride History</div>
                    <div className="text-xs text-slate-500">Total rides: {vehicleRideHistory.length}</div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!selectedRoutePlaybackPoints.length) return;
                          if (isPlaying) {
                            pausePlayback();
                          } else {
                            startPlayback(selectedRoutePlaybackPoints, playIndex || 0);
                          }
                        }}
                        className="px-3 py-1 rounded-md bg-indigo-100 text-indigo-700 text-sm"
                      >
                        {isPlaying ? "Pause" : "Play"}
                      </button>
                      <button
                        type="button"
                        onClick={() => stopPlayback()}
                        className="px-3 py-1 rounded-md bg-slate-100 text-sm"
                      >
                        Stop
                      </button>
                      <button
                        type="button"
                        onClick={downloadRideHistoryCsv}
                        className="px-3 py-1 rounded-md bg-emerald-100 text-emerald-700 text-sm"
                      >
                        Export CSV
                      </button>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        Speed
                        <select value={playbackSpeed} onChange={(e) => setPlaybackSpeed(Number(e.target.value))} className="rounded-md border px-2 py-1 text-sm">
                          <option value={0.5}>0.5x</option>
                          <option value={1}>1x</option>
                          <option value={2}>2x</option>
                          <option value={4}>4x</option>
                        </select>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-slate-500">
                        <input type="checkbox" checked={autoFollow} onChange={(e) => setAutoFollow(e.target.checked)} />
                        Auto-follow
                      </label>
                    </div>
                  </div>
                )}

                {loading ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                    Loading IoT map data...
                  </div>
                ) : null}

                {!loading && vehicleRows.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                    No vehicles with live GPS coordinates were found.
                  </div>
                ) : null}

                {!showRideHistory && (
                  <div className="space-y-2">
                    {vehicleRows.map((vehicle) => {
                      const battery = Number(vehicle.batteryPercent);
                      const snapshot = getSnapshotForVehicle(vehicle);
                      const speedValue = parseSnapshotSpeed(snapshot) ?? vehicle.speedKmh ?? 0;
                      const engineOn = parseSnapshotEngineState(snapshot);
                      const lastSeenMs = snapshot?.receivedAt
                        ? new Date(snapshot.receivedAt).getTime()
                        : vehicle?.lastUpdatedAt
                        ? new Date(vehicle.lastUpdatedAt).getTime()
                        : null;
                      const tripState = computeTripState({ speed: speedValue, engineOn, lastSeenMs });
                      const batteryTone = Number.isFinite(battery)
                        ? battery <= 30
                          ? "bg-rose-50 text-rose-700"
                          : battery <= 60
                          ? "bg-amber-50 text-amber-700"
                          : "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-600";

                      const vehicleImage = selectVehicleImage(vehicle.brandName, vehicle.modelName);

                      return (
                        <button
                          key={vehicle.vehicleId}
                          type="button"
                          onClick={() => {
                            setSelectedVehicleId(vehicle.vehicleId);
                            setIsolateSelected(true);
                          }}
                          className={`w-full rounded-xl border bg-white p-3 text-left transition ${
                            String(selectedVehicleId) === String(vehicle.vehicleId)
                              ? "border-indigo-300 ring-2 ring-indigo-100"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={selectedVehicleIds.some((id) => String(id) === String(vehicle.vehicleId))}
                              onChange={(event) => {
                                event.stopPropagation();
                                toggleTrackedVehicle(vehicle.vehicleId);
                              }}
                              className="h-4 w-4 rounded border-slate-300"
                              title={`Track up to ${MULTI_SELECT_LIMIT} vehicles`}
                            />
                            <Image
                              src={resolveAssetSrc(vehicleImage)}
                              alt="vehicle"
                              width={40}
                              height={40}
                              className="h-10 w-10 rounded-full border border-slate-200 object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-semibold text-slate-900">{vehicle.vehicleLabel}</div>
                              <div className="truncate text-xs text-slate-500">
                                {vehicle.brandName && vehicle.modelName ? `${vehicle.brandName} - ${vehicle.modelName}` : vehicle.modelName || "Unknown Model"}
                              </div>
                              <div className="truncate text-[11px] font-semibold text-slate-500">
                                {tripState} · {engineOn === null ? "Engine ?" : engineOn ? "Engine On" : "Engine Off"}
                              </div>
                              <div className="truncate text-[11px] font-semibold text-slate-500">
                                {vehicle.routePointCount ? `${vehicle.routePointCount} route points` : "No route history"}
                              </div>
                            </div>
                            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${batteryTone}`}>
                              {Number.isFinite(battery) ? `${battery}%` : "N/A"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {showRideHistory && selectedVehicle && (
                  <div className="space-y-2">
                    {vehicleRideHistory.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-sm text-slate-500">
                        No ride history found for this vehicle.
                      </div>
                    ) : (
                      vehicleRideHistory.map((ride) => (
                        <button
                          key={ride.id}
                          type="button"
                          onClick={() => {
                            setSelectedRideId(ride.id);
                            setIsolateSelected(true);
                          }}
                          className={`w-full rounded-xl border bg-white p-3 text-left transition ${
                            String(selectedRideId) === String(ride.id)
                              ? "border-indigo-300 ring-2 ring-indigo-100"
                              : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className="text-sm font-semibold text-slate-900">
                            {ride.startTime.toLocaleDateString()} {ride.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            Duration: {Math.round((ride.endTime - ride.startTime) / 1000 / 60)}min
                          </div>
                          {Number.isFinite(Number(ride.distance)) ? (
                            <div className="text-xs text-slate-600 mt-1">
                              Distance: {(Number(ride.distance) / 1000).toFixed(2)}km
                            </div>
                          ) : null}
                          <div className="text-xs text-slate-600">
                            Battery: {ride.startBattery ? `${ride.startBattery}%` : "N/A"} → {ride.endBattery ? `${ride.endBattery}%` : "N/A"}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            Points: {ride.pointCount}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}
