  import { useCallback, useEffect, useMemo, useState } from "react";
  import {
    Activity,
    BatteryCharging,
    Bike,
    Building2,
    CheckCircle2,
    Globe2,
    IndianRupee,
    LayoutGrid,
    Landmark,
    MapPin,
    Pencil,
    Plus,
    Search,
    Table2,
    Trash2,
    X,
    Eye,
  } from "lucide-react";
  import { Circle, CircleMarker, MapContainer, Marker, Polygon, Rectangle, TileLayer, useMap, useMapEvents } from "react-leaflet";
  import L from "leaflet";
  import "leaflet/dist/leaflet.css";
  import { useLocation, useNavigate } from "react-router-dom";

  import AdminSidebar from "../../components/admin/AdminSidebar";
  import AdminTopbar from "../../components/admin/AdminTopbar";
  import {
    createAdminArea,
    createAdminCity,
    createAdminCountry,
    createAdminState,
    createAdminZone,
    deleteAdminZone,
    geocodeAdminCity,
    listAdminLocations,
    listAdminZones,
    updateAdminZone,
  } from "../../utils/adminZones";
  import {
    listAdminBatteries,
    listAdminVehicles,
    updateAdminBattery,
    updateAdminVehicle,
  } from "../../utils/adminFleet";

  const COLOR_OPTIONS = ["#10B981", "#3B82F6", "#8B5CF6", "#F59E0B", "#EF4444", "#06B6D4"];

  const TAB_OPTIONS = [
    { key: "zones", label: "Zones", icon: MapPin },
    { key: "countries", label: "Countries", icon: Globe2 },
    { key: "states", label: "States", icon: Landmark },
    { key: "cities", label: "Cities", icon: Building2 },
    { key: "areas", label: "Areas", icon: MapPin },
  ];

  const EMPTY_ZONE_FORM = {
    zoneName: "",
    zoneCode: "",
    zoneAddress: "",
    radiusKm: "5",
    latitude: "",
    longitude: "",
    country: "India",
    state: "",
    city: "",
    area: "",
    color: "#10B981",
    isActive: true,
    staffCount: "0",
  };

  const EMPTY_COUNTRY_FORM = { countryName: "", countryCode: "" };
  const EMPTY_STATE_FORM = { countryCode: "", stateName: "", stateCode: "" };
  const EMPTY_CITY_FORM = { countryCode: "", stateCode: "", cityName: "", latitude: "", longitude: "" };
  const EMPTY_AREA_FORM = {
    countryCode: "",
    stateCode: "",
    cityName: "",
    areaName: "",
    latitude: "",
    longitude: "",
  };

  const EMPTY_ASSIGN_FORM = { zoneId: "", vehicleId: "", batteryId: "" };

  function formatMoney(value) {
    const n = Number(value || 0);
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
  }

  function distanceMeters(a, b) {
    const [lat1, lng1] = a;
    const [lat2, lng2] = b;
    const toRad = (v) => (v * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const x = Math.sin(dLat / 2) * Math.sin(dLat / 2);
    const y =
      Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
    const arc = 2 * Math.atan2(Math.sqrt(x + y), Math.sqrt(1 - (x + y)));
    return 6371000 * arc;
  }

  function deriveCircleFromPolygon(points) {
    if (!Array.isArray(points) || points.length < 3) return null;

    const lat = points.reduce((sum, point) => sum + Number(point[0] || 0), 0) / points.length;
    const lng = points.reduce((sum, point) => sum + Number(point[1] || 0), 0) / points.length;
    const center = [lat, lng];
    const radiusMeters = points.reduce((max, point) => {
      return Math.max(max, distanceMeters(center, point));
    }, 0);

    return {
      latitude: Number(lat.toFixed(6)),
      longitude: Number(lng.toFixed(6)),
      radiusKm: Number(Math.max(0.1, radiusMeters / 1000).toFixed(2)),
    };
  }

  function normalizePolygonPoints(raw) {
    if (!Array.isArray(raw)) return [];
    const parsed = raw
      .map((point) => {
        const lat = Number(point?.lat ?? point?.latitude ?? point?.[0]);
        const lng = Number(point?.lng ?? point?.lon ?? point?.longitude ?? point?.[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
        return [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
      })
      .filter(Boolean);
    return parsed;
  }

  function rectangleBoundsFromPoints(start, end) {
    if (!Array.isArray(start) || !Array.isArray(end)) return null;
    const startLat = Number(start[0]);
    const startLng = Number(start[1]);
    const endLat = Number(end[0]);
    const endLng = Number(end[1]);
    if (!Number.isFinite(startLat) || !Number.isFinite(startLng) || !Number.isFinite(endLat) || !Number.isFinite(endLng)) {
      return null;
    }

    const south = Math.min(startLat, endLat);
    const north = Math.max(startLat, endLat);
    const west = Math.min(startLng, endLng);
    const east = Math.max(startLng, endLng);
    return [[south, west], [north, east]];
  }

  function rectangleBoundsToPolygon(bounds) {
    if (!Array.isArray(bounds) || bounds.length !== 2) return [];
    const south = Number(bounds[0]?.[0]);
    const west = Number(bounds[0]?.[1]);
    const north = Number(bounds[1]?.[0]);
    const east = Number(bounds[1]?.[1]);
    if (!Number.isFinite(south) || !Number.isFinite(west) || !Number.isFinite(north) || !Number.isFinite(east)) {
      return [];
    }

    return [
      [north, west],
      [north, east],
      [south, east],
      [south, west],
    ];
  }

  function buildAddressCandidates(rawAddress = "", { area = "", city = "", state = "", country = "" } = {}) {
    const direct = String(rawAddress || "").trim();
    const parts = direct
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    const structured = [area, city, state, country]
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .join(", ");

    return Array.from(
      new Set(
        [
          direct,
          parts.slice(0, 3).join(", "),
          parts.slice(-3).join(", "),
          parts[0] || "",
          parts.length > 1 ? `${parts[0]}, ${country}` : "",
          city,
          structured,
        ]
          .map((value) => String(value || "").trim())
          .filter(Boolean)
      )
    );
  }

  async function geocodeByNominatim(query) {
    const q = String(query || "").trim();
    if (!q) return null;

    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) return null;
    const payload = await response.json();
    const first = Array.isArray(payload) ? payload[0] : null;
    const latitude = Number(first?.lat);
    const longitude = Number(first?.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

    return { latitude, longitude, source: "nominatim" };
  }

  async function resolveBestAddressGeocode({
    address,
    area,
    city,
    state,
    country,
    countryCode,
    stateCode,
  }) {
    const candidates = buildAddressCandidates(address, { area, city, state, country });
    if (!candidates.length) return null;

    for (const candidate of candidates) {
      try {
        const geocoded = await geocodeAdminCity({
          cityName: candidate,
          countryCode: countryCode || undefined,
          stateCode: stateCode || undefined,
        });
        const latitude = Number(geocoded?.latitude);
        const longitude = Number(geocoded?.longitude);
        if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
          return { latitude, longitude, source: geocoded?.source || "server" };
        }
      } catch {
        // Keep trying candidate queries.
      }
    }

    for (const candidate of candidates) {
      try {
        const geocoded = await geocodeByNominatim(candidate);
        if (geocoded) return geocoded;
      } catch {
        // Try next candidate.
      }
    }

    return null;
  }

  const MAP_DEFAULT_CENTER = [22.3072, 73.1812];

  const zoneMarkerIcon = new L.Icon({
    iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41],
  });

  const polygonVertexIcon = L.divIcon({
    className: "zone-vertex-handle",
    html: '<div style="width:12px;height:12px;border-radius:9999px;background:#0f766e;border:2px solid #ffffff;box-shadow:0 0 0 2px rgba(15,118,110,0.35);"></div>',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

  const geofenceResizeIcon = L.divIcon({
    className: "zone-geofence-resize-handle",
    html: '<div style="width:14px;height:14px;border-radius:9999px;background:#0ea5e9;border:2px solid #ffffff;box-shadow:0 0 0 2px rgba(14,165,233,0.35);"></div>',
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });

  function MapViewportController({ center, zoom }) {
    const map = useMap();

    useEffect(() => {
      map.setView(center, zoom, { animate: true });
    }, [map, center, zoom]);

    return null;
  }

  function MapGeofenceEditor({ onMapClick }) {
    useMapEvents({
      click(event) {
        const lat = Number(event?.latlng?.lat);
        const lng = Number(event?.latlng?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          onMapClick(lat, lng);
        }
      },
    });

    return null;
  }

  function MapPointerPreview({ onPointerMove }) {
    useMapEvents({
      mousemove(event) {
        const lat = Number(event?.latlng?.lat);
        const lng = Number(event?.latlng?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          onPointerMove([lat, lng]);
        }
      },
      mouseout() {
        onPointerMove(null);
      },
    });

    return null;
  }

  function rectangleCornersFromBounds(bounds) {
    if (!Array.isArray(bounds) || bounds.length !== 2) return [];
    const south = Number(bounds[0]?.[0]);
    const west = Number(bounds[0]?.[1]);
    const north = Number(bounds[1]?.[0]);
    const east = Number(bounds[1]?.[1]);
    if (![south, west, north, east].every(Number.isFinite)) return [];

    return [
      [north, west],
      [north, east],
      [south, east],
      [south, west],
    ];
  }

  function CtrlWheelMapZoom() {
    const map = useMap();

    useEffect(() => {
      const container = map.getContainer();
      const onWheel = (event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        event.stopPropagation();
        if (event.deltaY < 0) {
          map.zoomIn(1);
        } else {
          map.zoomOut(1);
        }
      };

      container.addEventListener("wheel", onWheel, { passive: false });
      return () => {
        container.removeEventListener("wheel", onWheel);
      };
    }, [map]);

    return null;
  }

  function PolygonVertexHandles({ points, onMovePoint }) {
    return points.map((point, index) => (
      <Marker
        key={`polygon-point-${index}`}
        position={point}
        icon={polygonVertexIcon}
        draggable
        eventHandlers={{
          dragend: (event) => {
            const latlng = event.target.getLatLng();
            onMovePoint(index, Number(latlng.lat), Number(latlng.lng));
          },
        }}
      />
    ));
  }

  export default function ZoneManagement() {
    const location = useLocation();
    const navigate = useNavigate();

    const [activeTab, setActiveTab] = useState("zones");
    const [zonesSubPage, setZonesSubPage] = useState("list");
    const [viewMode, setViewMode] = useState("table");

    const [zones, setZones] = useState([]);
    const [locations, setLocations] = useState({ countries: [], states: [], cities: [], areas: [] });
    const [vehicles, setVehicles] = useState([]);
    const [batteries, setBatteries] = useState([]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [query, setQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [countryFilter, setCountryFilter] = useState("all");

    const [zoneForm, setZoneForm] = useState(EMPTY_ZONE_FORM);
    const [mapSearchQuery, setMapSearchQuery] = useState("");
    const [formError, setFormError] = useState("");
    const [saving, setSaving] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [zoneAddressGeoLoading, setZoneAddressGeoLoading] = useState(false);
    const [zoneAddressGeoMessage, setZoneAddressGeoMessage] = useState("");
    const [updatingLocationId, setUpdatingLocationId] = useState(null);
    const [locationStatusUpdating, setLocationStatusUpdating] = useState(false);

    const [locationError, setLocationError] = useState("");
    const [locationSaving, setLocationSaving] = useState(false);
    const [countryForm, setCountryForm] = useState(EMPTY_COUNTRY_FORM);
    const [stateForm, setStateForm] = useState(EMPTY_STATE_FORM);
    const [cityForm, setCityForm] = useState(EMPTY_CITY_FORM);
    const [areaForm, setAreaForm] = useState(EMPTY_AREA_FORM);
    const [cityGeoMessage, setCityGeoMessage] = useState("");
    const [cityGeoLoading, setCityGeoLoading] = useState(false);

    const [assignmentError, setAssignmentError] = useState("");
    const [assigning, setAssigning] = useState(false);
    const [assignForm, setAssignForm] = useState(EMPTY_ASSIGN_FORM);

    // Location table search and filter state
    const [countrySearch, setCountrySearch] = useState("");
    const [stateSearch, setStateSearch] = useState("");
    const [citySearch, setCitySearch] = useState("");
    const [areaSearch, setAreaSearch] = useState("");
    const [countryStatusFilter, setCountryStatusFilter] = useState("all");
    const [stateStatusFilter, setStateStatusFilter] = useState("all");
    const [cityStatusFilter, setCityStatusFilter] = useState("all");
    const [areaStatusFilter, setAreaStatusFilter] = useState("all");
    
    // Modal for viewing/editing locations
    const [locationModal, setLocationModal] = useState({ open: false, type: null, data: null });
    const [editingLocation, setEditingLocation] = useState(null);

    // Geofence drawing state
    const [geofenceMode, setGeofenceMode] = useState("circle");
    const [polygonPoints, setPolygonPoints] = useState([]);
    const [rectangleBounds, setRectangleBounds] = useState(null);
    const [rectangleStartPoint, setRectangleStartPoint] = useState(null);
    const [circleStartPoint, setCircleStartPoint] = useState(null);
    const [selectedShape, setSelectedShape] = useState(null);
    const [mapPointerPoint, setMapPointerPoint] = useState(null);

    useEffect(() => {
      const segment = String(location.pathname.split("/")[3] || "list").toLowerCase();
      setActiveTab("zones");
      if (segment === "add") {
        setZonesSubPage("form");
        return;
      }
      if (segment === "assign") {
        setZonesSubPage("assign");
        return;
      }
      setZonesSubPage("list");
    }, [location.pathname]);

    const navigateZoneSubPage = useCallback(
      (subPage, replace = false) => {
        const routeBySubPage = {
          list: "/admin/zones/list",
          form: "/admin/zones/add",
          assign: "/admin/zones/assign",
        };
        const nextRoute = routeBySubPage[subPage] || routeBySubPage.list;
        navigate(nextRoute, { replace });
      },
      [navigate]
    );

    const loadAll = useCallback(async () => {
      setError("");
      setLoading(true);
      try {
        const [zonesData, locationData, vehiclesData, batteriesData] = await Promise.all([
          listAdminZones(),
          listAdminLocations(),
          listAdminVehicles(),
          listAdminBatteries(),
        ]);

        setZones(Array.isArray(zonesData) ? zonesData : []);
        setLocations({
          countries: Array.isArray(locationData?.countries) ? locationData.countries : [],
          states: Array.isArray(locationData?.states) ? locationData.states : [],
          cities: Array.isArray(locationData?.cities) ? locationData.cities : [],
          areas: Array.isArray(locationData?.areas) ? locationData.areas : [],
        });
        setVehicles(Array.isArray(vehiclesData) ? vehiclesData : []);
        setBatteries(Array.isArray(batteriesData) ? batteriesData : []);
      } catch (e) {
        setError(String(e?.message || e || "Unable to load zone management data"));
        setZones([]);
        setLocations({ countries: [], states: [], cities: [], areas: [] });
        setVehicles([]);
        setBatteries([]);
      } finally {
        setLoading(false);
      }
    }, []);

    useEffect(() => {
      let mounted = true;

      const run = async () => {
        if (!mounted) return;
        await loadAll();
      };

      run();
      const timer = setInterval(run, 30000);

      return () => {
        mounted = false;
        clearInterval(timer);
      };
    }, [loadAll]);

    const countryCodeByName = useMemo(() => {
      const map = new Map();
      for (const country of locations.countries) {
        map.set(String(country.country_name || ""), String(country.country_code || ""));
      }
      return map;
    }, [locations.countries]);

    const stateCodeByName = useMemo(() => {
      const map = new Map();
      for (const state of locations.states) {
        map.set(`${state.country_code}::${state.state_name}`, String(state.state_code || ""));
      }
      return map;
    }, [locations.states]);

    const selectedCountryCode = countryCodeByName.get(zoneForm.country) || "";
    const selectedStateCode = stateCodeByName.get(`${selectedCountryCode}::${zoneForm.state}`) || "";

    const statesForSelectedCountry = useMemo(() => {
      if (!selectedCountryCode) return [];
      return locations.states.filter((item) => item.country_code === selectedCountryCode);
    }, [locations.states, selectedCountryCode]);

    const citiesForSelectedState = useMemo(() => {
      if (!selectedCountryCode || !selectedStateCode) return [];
      return locations.cities.filter(
        (item) => item.country_code === selectedCountryCode && item.state_code === selectedStateCode
      );
    }, [locations.cities, selectedCountryCode, selectedStateCode]);

    const areasForSelectedCity = useMemo(() => {
      if (!selectedCountryCode || !selectedStateCode || !zoneForm.city) return [];
      return locations.areas.filter(
        (item) =>
          item.country_code === selectedCountryCode &&
          item.state_code === selectedStateCode &&
          item.city_name === zoneForm.city
      );
    }, [locations.areas, selectedCountryCode, selectedStateCode, zoneForm.city]);

    const availableZoneAreas = useMemo(() => {
      const currentArea = String(zoneForm.area || "").trim();
      const base = [...areasForSelectedCity];

      if (currentArea && !base.some((item) => item.area_name === currentArea)) {
        base.unshift({
          id: `legacy-${currentArea}`,
          area_name: currentArea,
          latitude:
            zoneForm.latitude === "" || Number.isNaN(Number(zoneForm.latitude))
              ? null
              : Number(zoneForm.latitude),
          longitude:
            zoneForm.longitude === "" || Number.isNaN(Number(zoneForm.longitude))
              ? null
              : Number(zoneForm.longitude),
        });
      }

      return base;
    }, [areasForSelectedCity, zoneForm.area, zoneForm.latitude, zoneForm.longitude]);

    const hasZoneCoordinates = useMemo(() => {
      const latitudeText = String(zoneForm.latitude ?? "").trim();
      const longitudeText = String(zoneForm.longitude ?? "").trim();
      if (!latitudeText || !longitudeText) return false;

      const latitude = Number(latitudeText);
      const longitude = Number(longitudeText);
      return Number.isFinite(latitude) && Number.isFinite(longitude);
    }, [zoneForm.latitude, zoneForm.longitude]);

    const zoneMapCenter = useMemo(() => {
      if (!hasZoneCoordinates) return MAP_DEFAULT_CENTER;
      return [Number(zoneForm.latitude), Number(zoneForm.longitude)];
    }, [hasZoneCoordinates, zoneForm.latitude, zoneForm.longitude]);

    const zoneMapRadiusMeters = useMemo(() => {
      const radiusKm = Number(zoneForm.radiusKm);
      if (!Number.isFinite(radiusKm) || radiusKm <= 0) return 100;
      return Math.max(100, radiusKm * 1000);
    }, [zoneForm.radiusKm]);

    const hasPolygonGeofence = polygonPoints.length >= 3;
    const hasRectangleGeofence =
      Array.isArray(rectangleBounds) &&
      rectangleBounds.length === 2 &&
      Array.isArray(rectangleBounds[0]) &&
      Array.isArray(rectangleBounds[1]);

    const rectangleCorners = useMemo(
      () => rectangleCornersFromBounds(rectangleBounds),
      [rectangleBounds]
    );

    const rectangleCenter = useMemo(() => {
      if (!hasRectangleGeofence) return null;
      const south = Number(rectangleBounds[0]?.[0]);
      const west = Number(rectangleBounds[0]?.[1]);
      const north = Number(rectangleBounds[1]?.[0]);
      const east = Number(rectangleBounds[1]?.[1]);
      return [(south + north) / 2, (west + east) / 2];
    }, [hasRectangleGeofence, rectangleBounds]);

    const rectangleMetrics = useMemo(() => {
      if (!hasRectangleGeofence || rectangleCorners.length !== 4) {
        return { widthKm: 0, heightKm: 0 };
      }
      const widthMeters = distanceMeters(rectangleCorners[0], rectangleCorners[1]);
      const heightMeters = distanceMeters(rectangleCorners[0], rectangleCorners[3]);
      return {
        widthKm: Number((widthMeters / 1000).toFixed(2)),
        heightKm: Number((heightMeters / 1000).toFixed(2)),
      };
    }, [hasRectangleGeofence, rectangleCorners]);

    const circleResizeHandlePosition = useMemo(() => {
      if (!hasZoneCoordinates) return null;
      if (geofenceMode !== "circle" && selectedShape !== "circle") return null;
      const latitude = Number(zoneForm.latitude);
      const longitude = Number(zoneForm.longitude);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
      const latRad = (latitude * Math.PI) / 180;
      const cosLat = Math.max(0.1, Math.abs(Math.cos(latRad)));
      const deltaLng = zoneMapRadiusMeters / (111320 * cosLat);
      return [latitude, longitude + deltaLng];
    }, [geofenceMode, hasZoneCoordinates, selectedShape, zoneForm.latitude, zoneForm.longitude, zoneMapRadiusMeters]);

    const setZoneCoordinates = useCallback((latitude, longitude) => {
      setZoneForm((prev) => ({
        ...prev,
        latitude: String(Number(latitude).toFixed(6)),
        longitude: String(Number(longitude).toFixed(6)),
      }));
    }, []);

    const setZoneRadiusKm = useCallback((radiusKm) => {
      const safe = Number(radiusKm);
      if (!Number.isFinite(safe) || safe <= 0) return;
      setZoneForm((prev) => ({
        ...prev,
        radiusKm: String(Number(Math.max(0.1, safe).toFixed(2))),
      }));
    }, []);

    const applyDerivedCircleFromPolygon = useCallback(
      (points) => {
        const derived = deriveCircleFromPolygon(points);
        if (!derived) return;
        setZoneCoordinates(derived.latitude, derived.longitude);
        setZoneRadiusKm(derived.radiusKm);
      },
      [setZoneCoordinates, setZoneRadiusKm]
    );

    const updateRadiusByStep = (step) => {
      setZoneForm((prev) => {
        const current = Number(prev.radiusKm || 0);
        const safeCurrent = Number.isFinite(current) && current > 0 ? current : 1;
        const next = Math.max(0.1, Math.min(100, safeCurrent + step));
        return { ...prev, radiusKm: String(Number(next.toFixed(1))) };
      });
    };

    const handleMapClick = useCallback(
      (latitude, longitude) => {
        const point = [Number(latitude), Number(longitude)];

        if (geofenceMode === "polygon") {
          setRectangleBounds(null);
          setRectangleStartPoint(null);
          setCircleStartPoint(null);
          setPolygonPoints((prev) => {
            const next = [...prev, point];
            if (next.length >= 3) {
              applyDerivedCircleFromPolygon(next);
              setSelectedShape("polygon");
            }
            return next;
          });
          return;
        }

        if (geofenceMode === "rectangle") {
          setPolygonPoints([]);
          setCircleStartPoint(null);
          if (!rectangleStartPoint) {
            setRectangleStartPoint(point);
            setZoneCoordinates(point[0], point[1]);
            return;
          }
          const bounds = rectangleBoundsFromPoints(rectangleStartPoint, point);
          setRectangleStartPoint(null);
          if (!bounds) return;
          setRectangleBounds(bounds);
          const polygon = rectangleBoundsToPolygon(bounds);
          applyDerivedCircleFromPolygon(polygon);
          setSelectedShape("rectangle");
          return;
        }

        if (geofenceMode === "circle") {
          setPolygonPoints([]);
          setRectangleBounds(null);
          setRectangleStartPoint(null);
          if (!circleStartPoint) {
            setCircleStartPoint(point);
            setZoneCoordinates(point[0], point[1]);
            return;
          }
          const radiusMeters = distanceMeters(circleStartPoint, point);
          setZoneCoordinates(circleStartPoint[0], circleStartPoint[1]);
          setZoneRadiusKm(Math.max(0.1, radiusMeters / 1000));
          setCircleStartPoint(null);
          setSelectedShape("circle");
          return;
        }

        setPolygonPoints([]);
        setRectangleBounds(null);
        setRectangleStartPoint(null);
        setCircleStartPoint(null);
        setZoneCoordinates(latitude, longitude);
        setSelectedShape("point");
      },
      [
        applyDerivedCircleFromPolygon,
        circleStartPoint,
        geofenceMode,
        rectangleStartPoint,
        setZoneCoordinates,
        setZoneRadiusKm,
      ]
    );

    const handleMovePolygonPoint = useCallback(
      (index, latitude, longitude) => {
        setPolygonPoints((prev) => {
          const next = prev.map((point, pointIndex) =>
            pointIndex === index ? [Number(latitude), Number(longitude)] : point
          );
          if (next.length >= 3) {
            applyDerivedCircleFromPolygon(next);
          }
          return next;
        });
      },
      [applyDerivedCircleFromPolygon]
    );

    const clearPolygonSelection = useCallback(() => {
      setPolygonPoints([]);
      if (selectedShape === "polygon") setSelectedShape(null);
    }, [selectedShape]);

    const switchGeofenceMode = useCallback((mode) => {
      setGeofenceMode(mode);
      setRectangleStartPoint(null);
      setCircleStartPoint(null);

      if (mode !== "polygon") {
        setPolygonPoints([]);
      }
      if (mode !== "rectangle") {
        setRectangleBounds(null);
      }
      setSelectedShape(mode);
    }, []);

    const resizeRectangleByKm = useCallback(
      (nextWidthKm, nextHeightKm) => {
        if (!rectangleCenter) return;
        const widthMeters = Math.max(100, Number(nextWidthKm) * 1000);
        const heightMeters = Math.max(100, Number(nextHeightKm) * 1000);
        if (!Number.isFinite(widthMeters) || !Number.isFinite(heightMeters)) return;

        const centerLat = Number(rectangleCenter[0]);
        const centerLng = Number(rectangleCenter[1]);
        const latDelta = heightMeters / (2 * 111320);
        const cosLat = Math.max(0.1, Math.abs(Math.cos((centerLat * Math.PI) / 180)));
        const lngDelta = widthMeters / (2 * 111320 * cosLat);

        const southWest = [centerLat - latDelta, centerLng - lngDelta];
        const northEast = [centerLat + latDelta, centerLng + lngDelta];
        const bounds = rectangleBoundsFromPoints(southWest, northEast);
        if (!bounds) return;
        setRectangleBounds(bounds);
        const polygon = rectangleBoundsToPolygon(bounds);
        applyDerivedCircleFromPolygon(polygon);
        setSelectedShape("rectangle");
      },
      [applyDerivedCircleFromPolygon, rectangleCenter]
    );

    const handleRectangleCornerMove = useCallback(
      (cornerIndex, latitude, longitude) => {
        if (rectangleCorners.length !== 4) return;
        const oppositeIndexByCorner = { 0: 2, 1: 3, 2: 0, 3: 1 };
        const opposite = rectangleCorners[oppositeIndexByCorner[cornerIndex]];
        if (!opposite) return;
        const bounds = rectangleBoundsFromPoints([latitude, longitude], opposite);
        if (!bounds) return;
        setRectangleBounds(bounds);
        const polygon = rectangleBoundsToPolygon(bounds);
        applyDerivedCircleFromPolygon(polygon);
        setSelectedShape("rectangle");
      },
      [applyDerivedCircleFromPolygon, rectangleCorners]
    );

    const handleCircleResize = useCallback(
      (latitude, longitude) => {
        if (!hasZoneCoordinates) return;
        const center = [Number(zoneForm.latitude), Number(zoneForm.longitude)];
        const radiusMeters = distanceMeters(center, [latitude, longitude]);
        setZoneRadiusKm(Math.max(0.1, radiusMeters / 1000));
        setSelectedShape("circle");
      },
      [hasZoneCoordinates, setZoneRadiusKm, zoneForm.latitude, zoneForm.longitude]
    );

    const completePolygon = useCallback(() => {
      if (polygonPoints.length < 3) {
        setZoneAddressGeoMessage("Add at least 3 points to complete polygon geofence.");
        return;
      }
      applyDerivedCircleFromPolygon(polygonPoints);
      setZoneAddressGeoMessage("Polygon geofence updated.");
    }, [applyDerivedCircleFromPolygon, polygonPoints]);

    const clearSelectedGeofence = useCallback(() => {
      setZoneForm((prev) => ({ ...prev, latitude: "", longitude: "" }));
      setPolygonPoints([]);
      setRectangleBounds(null);
      setRectangleStartPoint(null);
      setCircleStartPoint(null);
      setSelectedShape(null);
    }, []);

    const handleSearchArea = useCallback(async () => {
      const query = String(mapSearchQuery || "").trim();
      if (!query) {
        setZoneAddressGeoMessage("Enter area/city/address to search.");
        return;
      }

      setZoneAddressGeoLoading(true);
      setZoneAddressGeoMessage("Searching location...");
      try {
        const geocoded = await resolveBestAddressGeocode({
          address: query,
          area: zoneForm.area,
          city: zoneForm.city,
          state: zoneForm.state,
          country: zoneForm.country,
          countryCode: selectedCountryCode,
          stateCode: selectedStateCode,
        });

        if (!geocoded) {
          setZoneAddressGeoMessage("Search failed. Try city, state, country format.");
          return;
        }

        const latitude = Number(geocoded?.latitude);
        const longitude = Number(geocoded?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          setZoneAddressGeoMessage("No coordinates found for this search.");
          return;
        }

        setZoneCoordinates(latitude, longitude);
        setZoneAddressGeoMessage("Map moved to searched area.");
      } catch {
        setZoneAddressGeoMessage("Search failed. Try a more specific area name.");
      } finally {
        setZoneAddressGeoLoading(false);
      }
    }, [
      mapSearchQuery,
      selectedCountryCode,
      selectedStateCode,
      setZoneCoordinates,
      zoneForm.area,
      zoneForm.city,
      zoneForm.country,
      zoneForm.state,
    ]);

    const countryFilterOptions = useMemo(() => {
      const unique = new Set();
      for (const zone of zones) {
        const country = String(zone?.country || "").trim();
        if (country) unique.add(country);
      }
      return Array.from(unique).sort((a, b) => a.localeCompare(b));
    }, [zones]);

    const filteredZones = useMemo(() => {
      const q = String(query || "").trim().toLowerCase();
      return zones.filter((zone) => {
        if (statusFilter === "active" && !zone.is_active) return false;
        if (statusFilter === "inactive" && zone.is_active) return false;
        if (countryFilter !== "all" && String(zone.country || "") !== countryFilter) return false;

        if (!q) return true;

        const haystack = [
          zone.zone_name,
          zone.zone_code,
          zone.country,
          zone.state,
          zone.city,
          zone.area,
        ]
          .map((value) => String(value || "").toLowerCase())
          .join(" ");
        return haystack.includes(q);
      });
    }, [zones, query, statusFilter, countryFilter]);

    const summary = useMemo(() => {
      return filteredZones.reduce(
        (acc, zone) => {
          acc.totalZones += 1;
          acc.activeZones += zone.is_active ? 1 : 0;
          acc.totalVehicles += Number(zone.vehicles_count || 0);
          acc.totalBatteries += Number(zone.batteries_count || 0);
          acc.totalRevenue += Number(zone.monthly_revenue || 0);
          return acc;
        },
        {
          totalZones: 0,
          activeZones: 0,
          totalVehicles: 0,
          totalBatteries: 0,
          totalRevenue: 0,
        }
      );
    }, [filteredZones]);

    const openCreate = () => {
      const defaultCountry = locations.countries?.[0]?.country_name || "India";
      setEditTarget(null);
      setZoneForm({ ...EMPTY_ZONE_FORM, country: defaultCountry });
      setGeofenceMode("circle");
      setPolygonPoints([]);
      setRectangleBounds(null);
      setRectangleStartPoint(null);
      setCircleStartPoint(null);
      setSelectedShape("circle");
      setMapPointerPoint(null);
      setMapSearchQuery("");
      setZoneAddressGeoLoading(false);
      setZoneAddressGeoMessage("");
      setFormError("");
      navigateZoneSubPage("form", true);
    };

    const openEdit = (zone) => {
      const existingPolygon = normalizePolygonPoints(zone?.polygon_points || zone?.polygonPoints || []);

      setEditTarget(zone);
      setZoneForm({
        zoneName: String(zone.zone_name || ""),
        zoneCode: String(zone.zone_code || ""),
        zoneAddress: String(zone.zone_address || zone.zoneAddress || ""),
        radiusKm: String(zone.radius_km ?? ""),
        latitude: zone.latitude === null || zone.latitude === undefined ? "" : String(zone.latitude),
        longitude: zone.longitude === null || zone.longitude === undefined ? "" : String(zone.longitude),
        country: String(zone.country || "India"),
        state: String(zone.state || ""),
        city: String(zone.city || ""),
        area: String(zone.area || zone.zone_name || ""),
        color: String(zone.color || "#10B981"),
        isActive: Boolean(zone.is_active),
        staffCount: String(zone.staff_count ?? 0),
      });
      setGeofenceMode(existingPolygon.length >= 3 ? "polygon" : "circle");
      setPolygonPoints(existingPolygon);
      setRectangleBounds(null);
      setRectangleStartPoint(null);
      setCircleStartPoint(null);
      setSelectedShape(existingPolygon.length >= 3 ? "polygon" : "circle");
      setMapPointerPoint(null);
      setMapSearchQuery("");
      setZoneAddressGeoLoading(false);
      setZoneAddressGeoMessage("");
      setFormError("");
      navigateZoneSubPage("form", true);
    };

    const closeZoneForm = () => {
      if (saving) return;
      setFormError("");
      setEditTarget(null);
      setGeofenceMode("circle");
      setPolygonPoints([]);
      setRectangleBounds(null);
      setRectangleStartPoint(null);
      setCircleStartPoint(null);
      setSelectedShape(null);
      setMapPointerPoint(null);
      setMapSearchQuery("");
      setZoneAddressGeoLoading(false);
      setZoneAddressGeoMessage("");
      navigateZoneSubPage("list", true);
    };

    const handleSaveZone = async (e) => {
      e.preventDefault();
      setFormError("");

      const zoneName = String(zoneForm.zoneName || "").trim();
      const zoneCode = String(zoneForm.zoneCode || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9-]+/g, "");
      const area = String(zoneForm.area || "").trim();

      const radiusKm = Number(zoneForm.radiusKm);
      const latitude = zoneForm.latitude === "" ? null : Number(zoneForm.latitude);
      const longitude = zoneForm.longitude === "" ? null : Number(zoneForm.longitude);
      const staffCount = Math.max(0, Math.floor(Number(zoneForm.staffCount || 0)));

      if (!zoneName) return setFormError("Zone name is required.");
      if (!zoneCode) return setFormError("Zone code is required.");
      if (!area) return setFormError("Select an area from the area list.");
      if (!Number.isFinite(radiusKm) || radiusKm <= 0) return setFormError("Radius must be greater than 0.");
      if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
        return setFormError("Latitude must be between -90 and 90.");
      }
      if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
        return setFormError("Longitude must be between -180 and 180.");
      }

      const payload = {
        zoneName,
        zoneCode,
        zoneAddress: String(zoneForm.zoneAddress || "").trim(),
        area,
        country: String(zoneForm.country || "India").trim() || "India",
        state: String(zoneForm.state || "").trim(),
        city: String(zoneForm.city || "").trim(),
        radiusKm,
        latitude,
        longitude,
        color: String(zoneForm.color || "#10B981"),
        isActive: Boolean(zoneForm.isActive),
        staffCount,
      };

      setSaving(true);
      try {
        if (editTarget?.id) {
          await updateAdminZone(editTarget.id, payload);
        } else {
          await createAdminZone(payload);
        }
        closeZoneForm();
        await loadAll();
      } catch (e2) {
        setFormError(String(e2?.message || e2 || "Unable to save zone"));
      } finally {
        setSaving(false);
      }
    };

    const handleGeocodeZoneAddress = async () => {
      const explicitAddress = String(zoneForm.zoneAddress || "").trim();
      const fallbackAddress = [zoneForm.area, zoneForm.city, zoneForm.state, zoneForm.country]
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .join(", ");
      const addressQuery = explicitAddress || fallbackAddress;

      if (!addressQuery) {
        setZoneAddressGeoMessage("Enter zone address first.");
        return;
      }

      setZoneAddressGeoLoading(true);
      setZoneAddressGeoMessage("Finding coordinates from zone address...");
      try {
        const geocoded = await resolveBestAddressGeocode({
          address: addressQuery,
          area: zoneForm.area,
          city: zoneForm.city,
          state: zoneForm.state,
          country: zoneForm.country,
          countryCode: selectedCountryCode,
          stateCode: selectedStateCode,
        });

        if (!geocoded) {
          setZoneAddressGeoMessage("Unable to fetch coordinates for this address. Please include city/state or enter manually.");
          return;
        }

        const latitude = Number(geocoded?.latitude);
        const longitude = Number(geocoded?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
          setZoneAddressGeoMessage("Unable to fetch coordinates for this address. Please include city/state or enter manually.");
          return;
        }

        setZoneCoordinates(latitude, longitude);
        setZoneAddressGeoMessage("Coordinates updated from zone address.");
      } catch {
        setZoneAddressGeoMessage("Unable to fetch coordinates right now. Please enter manually.");
      } finally {
        setZoneAddressGeoLoading(false);
      }
    };

    const handleDeleteZone = async (zone) => {
      const confirmed = window.confirm(`Delete ${zone?.zone_name || "this zone"}?`);
      if (!confirmed) return;

      try {
        await deleteAdminZone(zone.id);
        await loadAll();
      } catch (e) {
        setError(String(e?.message || e || "Unable to delete zone"));
      }
    };

    const handleUpdateLocationStatus = async (locationType, locationId, newStatus) => {
      setUpdatingLocationId(locationId);
      setLocationStatusUpdating(true);
      try {
        // Call appropriate backend update based on type
        const endpoint = `/api/admin/locations/${locationType}/${locationId}`;
        const response = await fetch(endpoint, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: newStatus }),
        });
        
        if (!response.ok) {
          throw new Error(`Status update failed: ${response.statusText}`);
        }
        
        await loadAll();
      } catch (e) {
        setLocationError(String(e?.message || e || "Unable to update status"));
      } finally {
        setUpdatingLocationId(null);
        setLocationStatusUpdating(false);
      }
    };

    const handleDeleteLocation = async (locationType, locationId, locationName) => {
      const confirmed = window.confirm(`Delete ${locationName}? This action cannot be undone.`);
      if (!confirmed) return;

      try {
        setUpdatingLocationId(locationId);
        const endpoint = `/api/admin/locations/${locationType}/${locationId}`;
        const response = await fetch(endpoint, { method: "DELETE" });
        
        if (!response.ok) {
          throw new Error(`Delete failed: ${response.statusText}`);
        }
        
        setLocationModal({ open: false, type: null, data: null });
        await loadAll();
      } catch (e) {
        setLocationError(String(e?.message || e || "Unable to delete location"));
      } finally {
        setUpdatingLocationId(null);
      }
    };

    const openLocationModal = (type, data) => {
      setLocationModal({ open: true, type, data });
      setEditingLocation(data);
    };

    const closeLocationModal = () => {
      setLocationModal({ open: false, type: null, data: null });
      setEditingLocation(null);
    };

    // Filter functions for location tables
    const filteredCountries = useMemo(() => {
      return locations.countries.filter((c) => {
        if (countryStatusFilter !== "all") {
          if (countryStatusFilter === "active" && !c.is_active) return false;
          if (countryStatusFilter === "inactive" && c.is_active) return false;
        }
        const search = String(countrySearch || "").toLowerCase();
        if (!search) return true;
        return (
          String(c.country_name || "").toLowerCase().includes(search) ||
          String(c.country_code || "").toLowerCase().includes(search)
        );
      });
    }, [locations.countries, countrySearch, countryStatusFilter]);

    const filteredStates = useMemo(() => {
      return locations.states.filter((s) => {
        if (stateStatusFilter !== "all") {
          if (stateStatusFilter === "active" && !s.is_active) return false;
          if (stateStatusFilter === "inactive" && s.is_active) return false;
        }
        const search = String(stateSearch || "").toLowerCase();
        if (!search) return true;
        return (
          String(s.state_name || "").toLowerCase().includes(search) ||
          String(s.state_code || "").toLowerCase().includes(search) ||
          String(s.country_code || "").toLowerCase().includes(search)
        );
      });
    }, [locations.states, stateSearch, stateStatusFilter]);

    const filteredCities = useMemo(() => {
      return locations.cities.filter((c) => {
        if (cityStatusFilter !== "all") {
          if (cityStatusFilter === "active" && !c.is_active) return false;
          if (cityStatusFilter === "inactive" && c.is_active) return false;
        }
        const search = String(citySearch || "").toLowerCase();
        if (!search) return true;
        return (
          String(c.city_name || "").toLowerCase().includes(search) ||
          String(c.state_code || "").toLowerCase().includes(search) ||
          String(c.country_code || "").toLowerCase().includes(search)
        );
      });
    }, [locations.cities, citySearch, cityStatusFilter]);

    const filteredAreas = useMemo(() => {
      return locations.areas.filter((a) => {
        if (areaStatusFilter !== "all") {
          if (areaStatusFilter === "active" && !a.is_active) return false;
          if (areaStatusFilter === "inactive" && a.is_active) return false;
        }
        const search = String(areaSearch || "").toLowerCase();
        if (!search) return true;
        return (
          String(a.area_name || "").toLowerCase().includes(search) ||
          String(a.city_name || "").toLowerCase().includes(search) ||
          String(a.state_code || "").toLowerCase().includes(search) ||
          String(a.country_code || "").toLowerCase().includes(search)
        );
      });
    }, [locations.areas, areaSearch, areaStatusFilter]);

    const getColorForIndex = (index) => {
      const colors = [
        "emerald", "sky", "violet", "amber", "rose", "indigo", "cyan", "orange"
      ];
      return colors[index % colors.length];
    };

    const getRowBgColor = (index) => {
      const color = getColorForIndex(index);
      return {
        "emerald": "hover:bg-emerald-50",
        "sky": "hover:bg-sky-50",
        "violet": "hover:bg-violet-50",
        "amber": "hover:bg-amber-50",
        "rose": "hover:bg-rose-50",
        "indigo": "hover:bg-indigo-50",
        "cyan": "hover:bg-cyan-50",
        "orange": "hover:bg-orange-50",
      }[color];
    };

    const createHighlightClass = (index) => {
      const color = getColorForIndex(index);
      const borderClass = {
        "emerald": "border-l-emerald-500",
        "sky": "border-l-sky-500",
        "violet": "border-l-violet-500",
        "amber": "border-l-amber-500",
        "rose": "border-l-rose-500",
        "indigo": "border-l-indigo-500",
        "cyan": "border-l-cyan-500",
        "orange": "border-l-orange-500",
      }[color];
      return borderClass;
    };

    const createHighlightBadgeClass = (index) => {
      const color = getColorForIndex(index);
      const classes = {
        "emerald": "bg-emerald-100 text-emerald-800",
        "sky": "bg-sky-100 text-sky-800",
        "violet": "bg-violet-100 text-violet-800",
        "amber": "bg-amber-100 text-amber-800",
        "rose": "bg-rose-100 text-rose-800",
        "indigo": "bg-indigo-100 text-indigo-800",
        "cyan": "bg-cyan-100 text-cyan-800",
        "orange": "bg-orange-100 text-orange-800",
      }[color];
      return classes;
    };

    const createActionButtonClass = (index) => {
      const color = getColorForIndex(index);
      const classes = {
        "emerald": "text-emerald-600 hover:bg-emerald-100",
        "sky": "text-sky-600 hover:bg-sky-100",
        "violet": "text-violet-600 hover:bg-violet-100",
        "amber": "text-amber-600 hover:bg-amber-100",
        "rose": "text-rose-600 hover:bg-rose-100",
        "indigo": "text-indigo-600 hover:bg-indigo-100",
        "cyan": "text-cyan-600 hover:bg-cyan-100",
        "orange": "text-orange-600 hover:bg-orange-100",
      }[color];
      return classes;
    };

    const createActionDelButtonClass = () => {
      return "text-red-600 hover:bg-red-100";
    };

    const createIcon = (type) => {
      if (type === "view") return Eye;
      if (type === "edit") return Pencil;
      if (type === "delete") return Trash2;
      return null;
    };

    const createImportIcon = () => Eye;

    const handleLocationAction = (action, type, data) => {
      if (action === "view") {
        openLocationModal(type, data);
      } else if (action === "delete") {
        handleDeleteLocation(type, data.id, data[Object.keys(data).find(k => k.includes("name"))]);
      }
    };

    const handleCreateCountry = async (e) => {
      e.preventDefault();
      setLocationError("");

      const countryName = String(countryForm.countryName || "").trim();
      if (!countryName) return setLocationError("Country name is required.");

      setLocationSaving(true);
      try {
        await createAdminCountry({
          countryName,
          countryCode: String(countryForm.countryCode || "").trim().toUpperCase(),
        });
        setCountryForm(EMPTY_COUNTRY_FORM);
        await loadAll();
      } catch (e2) {
        setLocationError(String(e2?.message || e2 || "Unable to add country"));
      } finally {
        setLocationSaving(false);
      }
    };

    const handleCreateState = async (e) => {
      e.preventDefault();
      setLocationError("");

      const countryCode = String(stateForm.countryCode || "").trim().toUpperCase();
      const stateName = String(stateForm.stateName || "").trim();
      if (!countryCode) return setLocationError("Country is required for state.");
      if (!stateName) return setLocationError("State name is required.");

      setLocationSaving(true);
      try {
        await createAdminState({
          countryCode,
          stateName,
          stateCode: String(stateForm.stateCode || "").trim().toUpperCase(),
        });
        setStateForm((prev) => ({ ...EMPTY_STATE_FORM, countryCode: prev.countryCode }));
        await loadAll();
      } catch (e2) {
        setLocationError(String(e2?.message || e2 || "Unable to add state"));
      } finally {
        setLocationSaving(false);
      }
    };

    const handleCreateCity = async (e) => {
      e.preventDefault();
      setLocationError("");

      const countryCode = String(cityForm.countryCode || "").trim().toUpperCase();
      const stateCode = String(cityForm.stateCode || "").trim().toUpperCase();
      const cityName = String(cityForm.cityName || "").trim();
      const latitude = cityForm.latitude === "" ? null : Number(cityForm.latitude);
      const longitude = cityForm.longitude === "" ? null : Number(cityForm.longitude);

      if (!countryCode) return setLocationError("Country is required for city.");
      if (!stateCode) return setLocationError("State is required for city.");
      if (!cityName) return setLocationError("City name is required.");
      if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
        return setLocationError("Latitude must be between -90 and 90.");
      }
      if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
        return setLocationError("Longitude must be between -180 and 180.");
      }

      setLocationSaving(true);
      try {
        await createAdminCity({ countryCode, stateCode, cityName, latitude, longitude });
        setCityForm((prev) => ({ ...EMPTY_CITY_FORM, countryCode: prev.countryCode, stateCode: prev.stateCode }));
        setCityGeoMessage("");
        await loadAll();
      } catch (e2) {
        setLocationError(String(e2?.message || e2 || "Unable to add city"));
      } finally {
        setLocationSaving(false);
      }
    };

    const handleCreateArea = async (e) => {
      e.preventDefault();
      setLocationError("");

      const countryCode = String(areaForm.countryCode || "").trim().toUpperCase();
      const stateCode = String(areaForm.stateCode || "").trim().toUpperCase();
      const cityName = String(areaForm.cityName || "").trim();
      const areaName = String(areaForm.areaName || "").trim();
      const latitude = areaForm.latitude === "" ? null : Number(areaForm.latitude);
      const longitude = areaForm.longitude === "" ? null : Number(areaForm.longitude);

      if (!countryCode) return setLocationError("Country is required for area.");
      if (!stateCode) return setLocationError("State is required for area.");
      if (!cityName) return setLocationError("City is required for area.");
      if (!areaName) return setLocationError("Area name is required.");
      if (latitude !== null && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) {
        return setLocationError("Latitude must be between -90 and 90.");
      }
      if (longitude !== null && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180)) {
        return setLocationError("Longitude must be between -180 and 180.");
      }

      setLocationSaving(true);
      try {
        await createAdminArea({ countryCode, stateCode, cityName, areaName, latitude, longitude });
        setAreaForm((prev) => ({
          ...EMPTY_AREA_FORM,
          countryCode: prev.countryCode,
          stateCode: prev.stateCode,
          cityName: prev.cityName,
        }));
        await loadAll();
      } catch (e2) {
        setLocationError(String(e2?.message || e2 || "Unable to add area"));
      } finally {
        setLocationSaving(false);
      }
    };

    useEffect(() => {
      const countryCode = String(cityForm.countryCode || "").trim().toUpperCase();
      const stateCode = String(cityForm.stateCode || "").trim().toUpperCase();
      const cityName = String(cityForm.cityName || "").trim();

      if (!countryCode || !stateCode || cityName.length < 2) {
        setCityGeoLoading(false);
        if (!cityName) setCityGeoMessage("");
        return;
      }

      let cancelled = false;
      const timer = setTimeout(async () => {
        setCityGeoLoading(true);
        setCityGeoMessage("Auto-detecting latitude/longitude...");

        try {
          const geocoded = await geocodeAdminCity({ countryCode, stateCode, cityName });
          const latitude = Number(geocoded?.latitude);
          const longitude = Number(geocoded?.longitude);

          if (!cancelled && Number.isFinite(latitude) && Number.isFinite(longitude)) {
            setCityForm((prev) => {
              const sameInputs =
                String(prev.countryCode || "").trim().toUpperCase() === countryCode &&
                String(prev.stateCode || "").trim().toUpperCase() === stateCode &&
                String(prev.cityName || "").trim() === cityName;
              if (!sameInputs) return prev;
              return {
                ...prev,
                latitude: String(latitude),
                longitude: String(longitude),
              };
            });
            setCityGeoMessage("Coordinates auto-filled from city name.");
          } else if (!cancelled) {
            setCityGeoMessage("Coordinates not found yet. You can still save this city.");
          }
        } catch {
          if (!cancelled) {
            setCityGeoMessage("Coordinates could not be fetched right now. You can still save this city.");
          }
        } finally {
          if (!cancelled) setCityGeoLoading(false);
        }
      }, 500);

      return () => {
        cancelled = true;
        clearTimeout(timer);
      };
    }, [cityForm.countryCode, cityForm.stateCode, cityForm.cityName]);

    const handleAssignVehicle = async () => {
      setAssignmentError("");
      if (!assignForm.zoneId) return setAssignmentError("Select zone first.");
      if (!assignForm.vehicleId) return setAssignmentError("Select vehicle to assign.");

      setAssigning(true);
      try {
        await updateAdminVehicle(assignForm.vehicleId, { zoneId: assignForm.zoneId });
        setAssignForm((prev) => ({ ...prev, vehicleId: "" }));
        await loadAll();
      } catch (e) {
        setAssignmentError(String(e?.message || e || "Unable to assign vehicle"));
      } finally {
        setAssigning(false);
      }
    };

    const handleAssignBattery = async () => {
      setAssignmentError("");
      if (!assignForm.zoneId) return setAssignmentError("Select zone first.");
      if (!assignForm.batteryId) return setAssignmentError("Select battery to assign.");

      setAssigning(true);
      try {
        await updateAdminBattery(assignForm.batteryId, { zoneId: assignForm.zoneId });
        setAssignForm((prev) => ({ ...prev, batteryId: "" }));
        await loadAll();
      } catch (e) {
        setAssignmentError(String(e?.message || e || "Unable to assign battery"));
      } finally {
        setAssigning(false);
      }
    };

    const statesByCountryCode = useMemo(() => {
      const map = new Map();
      for (const state of locations.states) {
        const key = String(state.country_code || "");
        if (!map.has(key)) map.set(key, []);
        map.get(key).push(state);
      }
      return map;
    }, [locations.states]);

    const statesForCityForm = statesByCountryCode.get(cityForm.countryCode) || [];
    const statesForAreaForm = statesByCountryCode.get(areaForm.countryCode) || [];

    const citiesForAreaForm = useMemo(() => {
      if (!areaForm.countryCode || !areaForm.stateCode) return [];
      return locations.cities.filter(
        (item) => item.country_code === areaForm.countryCode && item.state_code === areaForm.stateCode
      );
    }, [areaForm.countryCode, areaForm.stateCode, locations.cities]);

    return (
      <div className="h-screen w-full flex bg-[#f7f8fc]">
        <AdminSidebar />

        <main className="flex-1 w-full min-w-0 overflow-x-hidden overflow-y-auto sm:ml-[var(--admin-sidebar-width,16rem)] space-y-6">
          <AdminTopbar
            title="Zone Management"
            subtitle="Fleet coverage setup with hierarchy, asset assignment, and operational zones"
          />
          <div className="p-4 sm:p-6 lg:p-8 space-y-6">

          <div className="inline-flex items-center rounded-2xl border border-slate-200 bg-white p-1 shadow-sm">
            {TAB_OPTIONS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    activeTab === tab.key
                      ? "bg-emerald-600 text-white shadow"
                      : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Icon size={15} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          {activeTab === "zones" ? (
            <>
              <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
                <button
                  type="button"
                  onClick={() => navigateZoneSubPage("list")}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    zonesSubPage === "list" ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Table2 size={14} /> List
                </button>
                <button
                  type="button"
                  onClick={openCreate}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    zonesSubPage === "form" ? "bg-emerald-600 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <Plus size={14} /> Add
                </button>
                <button
                  type="button"
                  onClick={() => navigateZoneSubPage("assign")}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    zonesSubPage === "assign" ? "bg-indigo-600 text-white" : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  <BatteryCharging size={14} /> Assign
                </button>
              </div>

              {zonesSubPage === "form" ? (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b px-6 py-4">
                    <div>
                      <h2 className="text-2xl font-semibold text-slate-900">{editTarget ? "Edit Zone" : "Add New Zone"}</h2>
                      <p className="text-slate-600">Production-grade zone configuration for fleet operations.</p>
                    </div>
                    <button
                      type="button"
                      onClick={closeZoneForm}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <X size={16} /> Close
                    </button>
                  </div>

                  <form onSubmit={handleSaveZone} className="space-y-4 px-6 py-5">
                    {formError ? (
                      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{formError}</div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Zone Name</label>
                        <input
                          type="text"
                          value={zoneForm.zoneName}
                          onChange={(e) => setZoneForm((prev) => ({ ...prev, zoneName: e.target.value }))}
                          placeholder="Enter zone name"
                          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Zone Code</label>
                        <input
                          type="text"
                          value={zoneForm.zoneCode}
                          onChange={(e) =>
                            setZoneForm((prev) => ({
                              ...prev,
                              zoneCode: e.target.value.toUpperCase().replace(/[^A-Z0-9-]+/g, ""),
                            }))
                          }
                          placeholder="e.g., MUM-BW-01"
                          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Country</label>
                        <select
                          value={zoneForm.country}
                          onChange={(e) =>
                            setZoneForm((prev) => ({
                              ...prev,
                              country: e.target.value,
                              state: "",
                              city: "",
                              area: "",
                              latitude: "",
                              longitude: "",
                            }))
                          }
                          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-emerald-500"
                        >
                          <option value="">Select</option>
                          {locations.countries.map((country) => (
                            <option key={country.id} value={country.country_name}>{country.country_name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">State</label>
                        <select
                          value={zoneForm.state}
                          onChange={(e) =>
                            setZoneForm((prev) => ({
                              ...prev,
                              state: e.target.value,
                              city: "",
                              area: "",
                              latitude: "",
                              longitude: "",
                            }))
                          }
                          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-emerald-500"
                        >
                          <option value="">Select</option>
                          {statesForSelectedCountry.map((state) => (
                            <option key={state.id} value={state.state_name}>{state.state_name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">City</label>
                        <select
                          value={zoneForm.city}
                          onChange={(e) => {
                            const nextCity = e.target.value;
                            const selectedCity = citiesForSelectedState.find((city) => city.city_name === nextCity);
                            setZoneForm((prev) => ({
                              ...prev,
                              city: nextCity,
                              area: "",
                              latitude:
                                selectedCity?.latitude !== null && selectedCity?.latitude !== undefined
                                  ? String(selectedCity.latitude)
                                  : "",
                              longitude:
                                selectedCity?.longitude !== null && selectedCity?.longitude !== undefined
                                  ? String(selectedCity.longitude)
                                  : "",
                            }));
                          }}
                          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-emerald-500"
                        >
                          <option value="">Select</option>
                          {citiesForSelectedState.map((city) => (
                            <option key={city.id} value={city.city_name}>{city.city_name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Area</label>
                        <select
                          value={zoneForm.area}
                          onChange={(e) => {
                            const nextArea = e.target.value;
                            const selectedArea = availableZoneAreas.find((item) => item.area_name === nextArea);
                            setZoneForm((prev) => ({
                              ...prev,
                              area: nextArea,
                              latitude:
                                selectedArea?.latitude !== null && selectedArea?.latitude !== undefined
                                  ? String(selectedArea.latitude)
                                  : prev.latitude,
                              longitude:
                                selectedArea?.longitude !== null && selectedArea?.longitude !== undefined
                                  ? String(selectedArea.longitude)
                                  : prev.longitude,
                            }));
                          }}
                          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-emerald-500"
                        >
                          <option value="">Select Area</option>
                          {availableZoneAreas.map((area) => (
                            <option key={area.id} value={area.area_name}>{area.area_name}</option>
                          ))}
                        </select>
                        <div className="mt-1 text-xs text-slate-500">Area list is sourced from the Areas tab.</div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-12">
                      <div className="sm:col-span-9">
                        <label className="mb-1 block text-sm font-medium text-slate-700">Zone Address</label>
                        <input
                          type="text"
                          value={zoneForm.zoneAddress}
                          onChange={(e) => {
                            const nextAddress = e.target.value;
                            setZoneForm((prev) => ({ ...prev, zoneAddress: nextAddress }));
                            setZoneAddressGeoMessage("");
                          }}
                          placeholder="Enter full zone address for auto geocoding"
                          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div className="sm:col-span-3 sm:pt-7">
                        <button
                          type="button"
                          onClick={handleGeocodeZoneAddress}
                          disabled={zoneAddressGeoLoading}
                          className="w-full rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                        >
                          {zoneAddressGeoLoading ? "Locating..." : "Use Address"}
                        </button>
                      </div>
                    </div>
                    {zoneAddressGeoMessage ? (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        {zoneAddressGeoMessage}
                      </div>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Radius (km)</label>
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => updateRadiusByStep(-0.5)}
                              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min="0.1"
                              step="0.1"
                              value={zoneForm.radiusKm}
                              onChange={(e) => setZoneForm((prev) => ({ ...prev, radiusKm: e.target.value }))}
                              className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-emerald-500"
                            />
                            <button
                              type="button"
                              onClick={() => updateRadiusByStep(0.5)}
                              className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-100"
                            >
                              +
                            </button>
                          </div>
                          <input
                            type="range"
                            min="0.1"
                            max="50"
                            step="0.1"
                            value={Number(zoneForm.radiusKm || 0.1)}
                            onChange={(e) => setZoneForm((prev) => ({ ...prev, radiusKm: e.target.value }))}
                            className="w-full accent-emerald-600"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Latitude</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={zoneForm.latitude}
                          onChange={(e) => setZoneForm((prev) => ({ ...prev, latitude: e.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-emerald-500"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Longitude</label>
                        <input
                          type="number"
                          step="0.000001"
                          value={zoneForm.longitude}
                          onChange={(e) => setZoneForm((prev) => ({ ...prev, longitude: e.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <div className="rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 via-white to-emerald-50 p-3 shadow-sm">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-slate-800">Interactive Geofence Studio</div>
                          <div className="text-xs text-slate-500">Use Ctrl + mouse wheel to zoom only the map.</div>
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200">
                          Mode: <span className="text-emerald-700">{geofenceMode.toUpperCase()}</span>
                        </div>
                      </div>

                      <div className="relative h-[26rem] overflow-hidden rounded-xl border border-cyan-200 shadow-inner">
                        <div className="pointer-events-none absolute left-3 top-3 z-[550] flex w-[240px] items-center rounded-xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur">
                          <input
                            type="text"
                            value={mapSearchQuery}
                            onChange={(e) => setMapSearchQuery(e.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") {
                                event.preventDefault();
                                handleSearchArea();
                              }
                            }}
                            placeholder="Search Area"
                            className="pointer-events-auto w-full rounded-xl px-3 py-2 text-sm outline-none"
                          />
                        </div>

                        <div className="absolute left-3 top-16 z-[560] flex flex-wrap gap-2">
                          {[
                            { key: "circle", label: "Circle" },
                            { key: "polygon", label: "Polygon" },
                            { key: "rectangle", label: "Rectangle" },
                          ].map((mode) => (
                            <button
                              key={mode.key}
                              type="button"
                              onClick={() => switchGeofenceMode(mode.key)}
                              className={`rounded-xl border px-3 py-1.5 text-xs font-semibold shadow-sm transition ${
                                geofenceMode === mode.key
                                  ? "border-emerald-500 bg-emerald-500 text-white"
                                  : "border-slate-200 bg-white/95 text-slate-700 hover:bg-slate-100"
                              }`}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>

                        <div className="absolute right-3 top-3 z-[560] flex items-center gap-2">
                          {geofenceMode === "polygon" ? (
                            <button
                              type="button"
                              onClick={completePolygon}
                              className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 shadow-sm hover:bg-emerald-100"
                            >
                              Complete Polygon
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={clearPolygonSelection}
                            className="rounded-xl border border-slate-200 bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
                          >
                            Clear Points
                          </button>
                          <button
                            type="button"
                            onClick={clearSelectedGeofence}
                            className="rounded-xl border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-100"
                          >
                            Delete Selected Area
                          </button>
                        </div>

                        <div className="absolute right-3 bottom-3 z-[560] max-w-[320px] rounded-xl border border-slate-200 bg-white/95 p-3 text-xs text-slate-700 shadow-lg backdrop-blur">
                          {selectedShape === "circle" ? (
                            <div className="space-y-2">
                              <div className="font-semibold text-slate-800">Circle Selected</div>
                              <div>Drag the blue handle to resize, or use slider below.</div>
                              <input
                                type="range"
                                min="0.1"
                                max="50"
                                step="0.1"
                                value={Number(zoneForm.radiusKm || 0.1)}
                                onChange={(e) => setZoneRadiusKm(e.target.value)}
                                className="w-full accent-sky-500"
                              />
                              <div>Radius: {Number(zoneForm.radiusKm || 0).toFixed(2)} km</div>
                            </div>
                          ) : null}

                          {selectedShape === "rectangle" ? (
                            <div className="space-y-2">
                              <div className="font-semibold text-slate-800">Rectangle Selected</div>
                              <div>Drag corner points or adjust dimensions.</div>
                              <div className="grid grid-cols-2 gap-2">
                                <label className="text-[11px] text-slate-600">
                                  Width (km)
                                  <input
                                    type="number"
                                    min="0.1"
                                    step="0.1"
                                    value={rectangleMetrics.widthKm || 0}
                                    onChange={(e) => resizeRectangleByKm(e.target.value, rectangleMetrics.heightKm || 0.1)}
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-500"
                                  />
                                </label>
                                <label className="text-[11px] text-slate-600">
                                  Height (km)
                                  <input
                                    type="number"
                                    min="0.1"
                                    step="0.1"
                                    value={rectangleMetrics.heightKm || 0}
                                    onChange={(e) => resizeRectangleByKm(rectangleMetrics.widthKm || 0.1, e.target.value)}
                                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs outline-none focus:border-emerald-500"
                                  />
                                </label>
                              </div>
                            </div>
                          ) : null}

                          {selectedShape === "polygon" ? (
                            <div className="space-y-1">
                              <div className="font-semibold text-slate-800">Polygon Selected</div>
                              <div>Drag teal vertex points to reshape polygon.</div>
                            </div>
                          ) : null}

                          {(selectedShape === "point" || !selectedShape) ? (
                            <div>
                              Click map to place point. Move cursor to preview point location.
                            </div>
                          ) : null}
                        </div>

                        <MapContainer center={zoneMapCenter} zoom={14} className="h-full w-full" scrollWheelZoom={false} zoomControl={false}>
                          <MapViewportController center={zoneMapCenter} zoom={14} />
                          <CtrlWheelMapZoom />
                          <MapGeofenceEditor onMapClick={handleMapClick} />
                          <MapPointerPreview onPointerMove={setMapPointerPoint} />
                          <TileLayer
                            attribution='&copy; OpenStreetMap contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                          />

                          {mapPointerPoint ? (
                            <CircleMarker
                              center={mapPointerPoint}
                              radius={5}
                              pathOptions={{ color: "#0891b2", fillColor: "#22d3ee", fillOpacity: 0.9, weight: 1 }}
                            />
                          ) : null}

                          {hasPolygonGeofence ? (
                            <>
                              <Polygon
                                positions={polygonPoints}
                                eventHandlers={{ click: () => setSelectedShape("polygon") }}
                                pathOptions={{
                                  color: zoneForm.color || "#10B981",
                                  fillColor: zoneForm.color || "#10B981",
                                  fillOpacity: 0.24,
                                  weight: 3,
                                }}
                              />
                              <PolygonVertexHandles points={polygonPoints} onMovePoint={handleMovePolygonPoint} />
                            </>
                          ) : null}

                          {hasRectangleGeofence ? (
                            <>
                              <Rectangle
                                bounds={rectangleBounds}
                                eventHandlers={{ click: () => setSelectedShape("rectangle") }}
                                pathOptions={{
                                  color: zoneForm.color || "#10B981",
                                  fillColor: zoneForm.color || "#10B981",
                                  fillOpacity: 0.24,
                                  weight: 3,
                                }}
                              />
                              {rectangleCorners.map((corner, index) => (
                                <Marker
                                  key={`rect-corner-${index}`}
                                  position={corner}
                                  icon={geofenceResizeIcon}
                                  draggable
                                  eventHandlers={{
                                    dragend: (event) => {
                                      const latlng = event.target.getLatLng();
                                      handleRectangleCornerMove(index, Number(latlng.lat), Number(latlng.lng));
                                    },
                                  }}
                                />
                              ))}
                            </>
                          ) : null}

                          {hasZoneCoordinates ? (
                            <>
                              <Marker
                                position={zoneMapCenter}
                                icon={zoneMarkerIcon}
                                draggable={!hasPolygonGeofence && !hasRectangleGeofence}
                                eventHandlers={{
                                  click: () => setSelectedShape(geofenceMode === "circle" ? "circle" : "point"),
                                  dragend: (event) => {
                                    const latlng = event.target.getLatLng();
                                    setZoneCoordinates(Number(latlng.lat), Number(latlng.lng));
                                  },
                                }}
                              />
                              {geofenceMode === "circle" && !hasPolygonGeofence && !hasRectangleGeofence ? (
                                <Circle
                                  center={zoneMapCenter}
                                  radius={zoneMapRadiusMeters}
                                  eventHandlers={{ click: () => setSelectedShape("circle") }}
                                  pathOptions={{
                                    color: zoneForm.color || "#10B981",
                                    fillColor: zoneForm.color || "#10B981",
                                    fillOpacity: 0.22,
                                    weight: 3,
                                  }}
                                />
                              ) : null}
                              {circleResizeHandlePosition ? (
                                <Marker
                                  position={circleResizeHandlePosition}
                                  icon={geofenceResizeIcon}
                                  draggable
                                  eventHandlers={{
                                    dragend: (event) => {
                                      const latlng = event.target.getLatLng();
                                      handleCircleResize(Number(latlng.lat), Number(latlng.lng));
                                    },
                                  }}
                                />
                              ) : null}
                            </>
                          ) : null}
                        </MapContainer>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Zone Color</label>
                        <div className="flex items-center gap-2">
                          {COLOR_OPTIONS.map((color) => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setZoneForm((prev) => ({ ...prev, color }))}
                              className={`h-9 w-9 rounded-lg border-2 ${
                                zoneForm.color === color ? "border-slate-800" : "border-transparent"
                              }`}
                              style={{ backgroundColor: color }}
                              title={color}
                            />
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-700">Staff Count</label>
                        <input
                          type="number"
                          min="0"
                          value={zoneForm.staffCount}
                          onChange={(e) => setZoneForm((prev) => ({ ...prev, staffCount: e.target.value }))}
                          className="w-full rounded-xl border border-slate-300 px-4 py-2.5 outline-none focus:border-emerald-500"
                        />
                      </div>
                    </div>

                    <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        checked={zoneForm.isActive}
                        onChange={(e) => setZoneForm((prev) => ({ ...prev, isActive: e.target.checked }))}
                        className="h-4 w-4 rounded border-slate-300 text-emerald-600"
                      />
                      Active Zone
                    </label>

                    <div className="flex items-center justify-end gap-3 pt-2">
                      <button
                        type="button"
                        onClick={closeZoneForm}
                        disabled={saving}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={saving}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        <Activity size={15} />
                        {saving ? "Saving..." : editTarget ? "Update Zone" : "Create Zone"}
                      </button>
                    </div>
                  </form>
                </div>
              ) : null}

              {zonesSubPage === "list" ? (
                <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
                      <MapPin size={18} />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-900">{summary.totalZones}</div>
                      <div className="text-sm text-slate-600">Total Zones</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-green-100 text-green-700">
                      <CheckCircle2 size={18} />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-900">{summary.activeZones}</div>
                      <div className="text-sm text-slate-600">Active Zones</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-100 text-blue-700">
                      <Bike size={18} />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-900">{summary.totalVehicles}</div>
                      <div className="text-sm text-slate-600">Vehicles</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-100 text-indigo-700">
                      <BatteryCharging size={18} />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-900">{summary.totalBatteries}</div>
                      <div className="text-sm text-slate-600">Batteries</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
                      <IndianRupee size={18} />
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-slate-900">{formatMoney(summary.totalRevenue)}</div>
                      <div className="text-sm text-slate-600">Monthly Revenue</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 lg:grid-cols-12 lg:items-center">
                  <div className="relative lg:col-span-4">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search zones..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-9 py-2.5 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>

                  <div className="lg:col-span-3">
                    <select
                      value={countryFilter}
                      onChange={(e) => setCountryFilter(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                    >
                      <option value="all">All Countries</option>
                      {countryFilterOptions.map((country) => (
                        <option key={country} value={country}>{country}</option>
                      ))}
                    </select>
                  </div>

                  <div className="lg:col-span-3">
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                    >
                      <option value="all">All Status</option>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-end gap-2 lg:col-span-2">
                    <button
                      type="button"
                      onClick={() => setViewMode("table")}
                      className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                        viewMode === "table"
                          ? "border-slate-800 bg-slate-800 text-white"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      <Table2 size={13} /> Table
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("cards")}
                      className={`inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold ${
                        viewMode === "cards"
                          ? "border-slate-800 bg-slate-800 text-white"
                          : "border-slate-300 bg-white text-slate-700"
                      }`}
                    >
                      <LayoutGrid size={13} /> Cards
                    </button>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">Loading zones...</div>
              ) : filteredZones.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">No zones found.</div>
              ) : viewMode === "cards" ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {filteredZones.map((zone) => {
                    const topBorder = zone.color || "#10B981";
                    const coordinateText =
                      zone.latitude !== null && zone.longitude !== null
                        ? `${zone.latitude}, ${zone.longitude}`
                        : "Coordinates not set";

                    return (
                      <article
                        key={zone.id}
                        className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                        style={{ borderTopWidth: 4, borderTopColor: topBorder }}
                      >
                        <div className="mb-3 flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="grid h-11 w-11 place-items-center rounded-xl text-sm font-bold text-white"
                              style={{ backgroundColor: topBorder }}
                            >
                              C
                            </div>
                            <div>
                              <div className="text-xl font-semibold text-slate-900 leading-tight">{zone.zone_name}</div>
                              <div className="text-xs text-slate-500">{coordinateText}</div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(zone)}
                              className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"
                              title="Edit zone"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteZone(zone)}
                              className="grid h-8 w-8 place-items-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                              title="Delete zone"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>

                        <div className="mb-2 text-xs text-slate-600">
                          {zone.country || "-"} / {zone.state || "-"} / {zone.city || "-"} / {zone.area || "-"}
                        </div>

                        <div className="mb-3 flex items-center justify-between">
                          <div className="text-sm text-slate-500">Status</div>
                          <span
                            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                              zone.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {zone.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>

                        <div className="mb-3 grid grid-cols-4 rounded-xl bg-slate-50 px-3 py-3 text-center">
                          <div>
                            <div className="inline-flex items-center gap-1 text-xl font-bold text-slate-900">
                              <Bike size={13} className="text-slate-500" />
                              {zone.vehicles_count}
                            </div>
                            <div className="text-[11px] text-slate-500">Vehicles</div>
                          </div>
                          <div className="border-x border-slate-200">
                            <div className="inline-flex items-center gap-1 text-xl font-bold text-slate-900">
                              <BatteryCharging size={13} className="text-slate-500" />
                              {zone.batteries_count}
                            </div>
                            <div className="text-[11px] text-slate-500">Batteries</div>
                          </div>
                          <div className="border-r border-slate-200">
                            <div className="inline-flex items-center gap-1 text-xl font-bold text-slate-900">
                              <Building2 size={13} className="text-slate-500" />
                              {zone.staff_count}
                            </div>
                            <div className="text-[11px] text-slate-500">Staff</div>
                          </div>
                          <div>
                            <div className="inline-flex items-center gap-1 text-xl font-bold text-slate-900">
                              <Activity size={13} className="text-slate-500" />
                              {zone.active_rides}
                            </div>
                            <div className="text-[11px] text-slate-500">Active</div>
                          </div>
                        </div>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-emerald-800">
                            <span className="inline-flex items-center gap-1.5"><IndianRupee size={13} /> Monthly Revenue</span>
                            <span className="font-semibold">?{formatMoney(zone.monthly_revenue)}</span>
                          </div>
                          <div className="flex items-center justify-between text-slate-600">
                            <span className="inline-flex items-center gap-1.5"><MapPin size={13} /> Coverage Radius</span>
                            <span className="font-semibold text-slate-900">{zone.radius_km} km</span>
                          </div>
                          <div className="flex items-center justify-between text-slate-600">
                            <span>Code</span>
                            <span className="font-semibold text-slate-900">{zone.zone_code}</span>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-slate-700 border-b border-slate-200 bg-slate-50">
                        <th className="px-4 py-3 bg-slate-100">Zone ID</th>
                        <th className="px-4 py-3 bg-slate-100">Zone Name</th>
                        <th className="px-4 py-3">Hierarchy (Country / State / City / Area)</th>
                        <th className="px-4 py-3">Vehicles</th>
                        <th className="px-4 py-3">Batteries</th>
                        <th className="px-4 py-3">Active Rides</th>
                        <th className="px-4 py-3 bg-slate-100">Revenue</th>
                        <th className="px-4 py-3 bg-slate-100">Status</th>
                        <th className="px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredZones.map((zone, index) => (
                        <tr
                          key={zone.id}
                          className={`border-b border-slate-100 hover:bg-slate-50 ${index % 2 === 0 ? "bg-white" : "bg-slate-50/40"}`}
                        >
                          <td className="px-4 py-3 font-semibold text-slate-900 bg-slate-50">{zone.zone_code}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900 bg-slate-50">{zone.zone_name}</td>
                          <td className="px-4 py-3 text-slate-600">
                            {zone.country || "-"} / {zone.state || "-"} / {zone.city || "-"} / {zone.area || "-"}
                          </td>
                          <td className="px-4 py-3">{zone.vehicles_count}</td>
                          <td className="px-4 py-3">{zone.batteries_count}</td>
                          <td className="px-4 py-3">{zone.active_rides}</td>
                          <td className="px-4 py-3 font-semibold text-slate-900 bg-slate-50">{formatMoney(zone.monthly_revenue)}</td>
                          <td className="px-4 py-3 bg-slate-50">
                            <span
                              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                                zone.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {zone.is_active ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEdit(zone)}
                                className="grid h-8 w-8 place-items-center rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"
                                title="Edit zone"
                              >
                                <Pencil size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteZone(zone)}
                                className="grid h-8 w-8 place-items-center rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                                title="Delete zone"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
                </>
              ) : null}

              {zonesSubPage === "assign" ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Zone Assignment</div>
                      <div className="text-xs text-slate-500">Assign vehicles and batteries to selected zones.</div>
                    </div>
                  </div>

                  <div className="grid gap-3 lg:grid-cols-3">
                    <select
                      value={assignForm.zoneId}
                      onChange={(e) => setAssignForm((prev) => ({ ...prev, zoneId: e.target.value }))}
                      className="rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    >
                      <option value="">Select Zone</option>
                      {zones.map((zone) => (
                        <option key={zone.id} value={zone.id}>{zone.zone_name}</option>
                      ))}
                    </select>

                    <div className="flex gap-2">
                      <select
                        value={assignForm.vehicleId}
                        onChange={(e) => setAssignForm((prev) => ({ ...prev, vehicleId: e.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      >
                        <option value="">Select Vehicle</option>
                        {vehicles.map((vehicle) => (
                          <option key={vehicle.id} value={vehicle.id}>{vehicle.vehicle_id}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAssignVehicle}
                        disabled={assigning}
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        Assign Vehicle
                      </button>
                    </div>

                    <div className="flex gap-2">
                      <select
                        value={assignForm.batteryId}
                        onChange={(e) => setAssignForm((prev) => ({ ...prev, batteryId: e.target.value }))}
                        className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
                      >
                        <option value="">Select Battery</option>
                        {batteries.map((battery) => (
                          <option key={battery.id} value={battery.id}>{battery.battery_id}</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={handleAssignBattery}
                        disabled={assigning}
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        Assign Battery
                      </button>
                    </div>
                  </div>

                  {assignmentError ? (
                    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{assignmentError}</div>
                  ) : null}
                </div>
              ) : null}
            </>
          ) : null}

          {activeTab === "countries" ? (
            <div className="space-y-4">
              {locationError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{locationError}</div>
              ) : null}

              <form onSubmit={handleCreateCountry} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm grid gap-3 md:grid-cols-3">
                <input
                  type="text"
                  placeholder="Country Name"
                  value={countryForm.countryName}
                  onChange={(e) => setCountryForm((prev) => ({ ...prev, countryName: e.target.value }))}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  placeholder="Country Code (optional)"
                  value={countryForm.countryCode}
                  onChange={(e) => setCountryForm((prev) => ({ ...prev, countryCode: e.target.value.toUpperCase() }))}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={locationSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Plus size={15} /> Add Country
                </button>
              </form>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="relative">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={countrySearch}
                      onChange={(e) => setCountrySearch(e.target.value)}
                      placeholder="Search countries..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-9 py-2.5 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                  <select
                    value={countryStatusFilter}
                    onChange={(e) => setCountryStatusFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                      <th className="px-4 py-3">Country</th>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCountries.map((country, index) => (
                      <tr key={country.id} className={`border-b border-slate-100 border-l-4 ${createHighlightClass(index)} ${getRowBgColor(index)}`}>
                        <td className="px-4 py-3 font-semibold text-slate-900">{country.country_name}</td>
                        <td className="px-4 py-3 text-slate-600">{country.country_code}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${createHighlightBadgeClass(index)}`}>
                            {country.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openLocationModal("countries", country)}
                              className={`grid h-8 w-8 place-items-center rounded-lg transition ${createActionButtonClass(index)}`}
                              title="View details"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openLocationModal("countries", { ...country, isEdit: true })}
                              className={`grid h-8 w-8 place-items-center rounded-lg transition ${createActionButtonClass(index)}`}
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLocation("countries", country.id, country.country_name)}
                              className={`grid h-8 w-8 place-items-center rounded-lg transition ${createActionDelButtonClass()}`}
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {activeTab === "states" ? (
            <div className="space-y-4">
              {locationError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{locationError}</div>
              ) : null}

              <form onSubmit={handleCreateState} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm grid gap-3 md:grid-cols-4">
                <select
                  value={stateForm.countryCode}
                  onChange={(e) => setStateForm((prev) => ({ ...prev, countryCode: e.target.value }))}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="">Select Country</option>
                  {locations.countries.map((country) => (
                    <option key={country.id} value={country.country_code}>{country.country_name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="State Name"
                  value={stateForm.stateName}
                  onChange={(e) => setStateForm((prev) => ({ ...prev, stateName: e.target.value }))}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  placeholder="State Code (optional)"
                  value={stateForm.stateCode}
                  onChange={(e) => setStateForm((prev) => ({ ...prev, stateCode: e.target.value.toUpperCase() }))}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={locationSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Plus size={15} /> Add State
                </button>
              </form>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="relative">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={stateSearch}
                      onChange={(e) => setStateSearch(e.target.value)}
                      placeholder="Search states..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-9 py-2.5 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                  <select
                    value={stateStatusFilter}
                    onChange={(e) => setStateStatusFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                      <th className="px-4 py-3">State</th>
                      <th className="px-4 py-3">Code</th>
                      <th className="px-4 py-3">Country</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStates.map((state, index) => (
                      <tr key={state.id} className={`border-b border-slate-100 border-l-4 ${createHighlightClass(index)} ${getRowBgColor(index)}`}>
                        <td className="px-4 py-3 font-semibold text-slate-900">{state.state_name}</td>
                        <td className="px-4 py-3 text-slate-600">{state.state_code}</td>
                        <td className="px-4 py-3 text-slate-600">{state.country_code}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${createHighlightBadgeClass(index)}`}>
                            {state.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openLocationModal("states", state)}
                              className={`grid h-8 w-8 place-items-center rounded-lg transition ${createActionButtonClass(index)}`}
                              title="View details"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openLocationModal("states", { ...state, isEdit: true })}
                              className={`grid h-8 w-8 place-items-center rounded-lg transition ${createActionButtonClass(index)}`}
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLocation("states", state.id, state.state_name)}
                              className={`grid h-8 w-8 place-items-center rounded-lg transition ${createActionDelButtonClass()}`}
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {activeTab === "cities" ? (
            <div className="space-y-4">
              {locationError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{locationError}</div>
              ) : null}

              <form onSubmit={handleCreateCity} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm grid gap-3 md:grid-cols-6">
                <select
                  value={cityForm.countryCode}
                  onChange={(e) => {
                    setCityGeoMessage("");
                    setCityForm((prev) => ({
                      ...prev,
                      countryCode: e.target.value,
                      stateCode: "",
                      latitude: "",
                      longitude: "",
                    }));
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="">Select Country</option>
                  {locations.countries.map((country) => (
                    <option key={country.id} value={country.country_code}>{country.country_name}</option>
                  ))}
                </select>
                <select
                  value={cityForm.stateCode}
                  onChange={(e) => {
                    setCityGeoMessage("");
                    setCityForm((prev) => ({ ...prev, stateCode: e.target.value, latitude: "", longitude: "" }));
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="">Select State</option>
                  {statesForCityForm.map((state) => (
                    <option key={state.id} value={state.state_code}>{state.state_name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="City Name"
                  value={cityForm.cityName}
                  onChange={(e) => setCityForm((prev) => ({ ...prev, cityName: e.target.value }))}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
                <input
                  type="number"
                  step="0.000001"
                  placeholder="Latitude"
                  value={cityForm.latitude}
                  onChange={(e) => setCityForm((prev) => ({ ...prev, latitude: e.target.value }))}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
                <input
                  type="number"
                  step="0.000001"
                  placeholder="Longitude"
                  value={cityForm.longitude}
                  onChange={(e) => setCityForm((prev) => ({ ...prev, longitude: e.target.value }))}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={locationSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Plus size={15} /> Add City
                </button>
              </form>

              {cityGeoMessage ? (
                <div className={`rounded-xl border px-4 py-2 text-xs ${
                  cityGeoLoading
                    ? "border-sky-200 bg-sky-50 text-sky-700"
                    : "border-slate-200 bg-slate-50 text-slate-700"
                }`}>
                  {cityGeoMessage}
                </div>
              ) : null}

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="relative">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={citySearch}
                      onChange={(e) => setCitySearch(e.target.value)}
                      placeholder="Search cities..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-9 py-2.5 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                  <select
                    value={cityStatusFilter}
                    onChange={(e) => setCityStatusFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                      <th className="px-4 py-3">City</th>
                      <th className="px-4 py-3">State</th>
                      <th className="px-4 py-3">Country</th>
                      <th className="px-4 py-3">Latitude</th>
                      <th className="px-4 py-3">Longitude</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCities.map((city, index) => (
                      <tr key={city.id} className={`border-b border-slate-100 border-l-4 ${createHighlightClass(index)} ${getRowBgColor(index)}`}>
                        <td className="px-4 py-3 font-semibold text-slate-900">{city.city_name}</td>
                        <td className="px-4 py-3 text-slate-600">{city.state_code}</td>
                        <td className="px-4 py-3 text-slate-600">{city.country_code}</td>
                        <td className="px-4 py-3 text-slate-600">{city.latitude ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-600">{city.longitude ?? "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${createHighlightBadgeClass(index)}`}>
                            {city.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openLocationModal("cities", city)}
                              className={`grid h-8 w-8 place-items-center rounded-lg transition ${createActionButtonClass(index)}`}
                              title="View details"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openLocationModal("cities", { ...city, isEdit: true })}
                              className={`grid h-8 w-8 place-items-center rounded-lg transition ${createActionButtonClass(index)}`}
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLocation("cities", city.id, city.city_name)}
                              className={`grid h-8 w-8 place-items-center rounded-lg transition ${createActionDelButtonClass()}`}
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {activeTab === "areas" ? (
            <div className="space-y-4">
              {locationError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{locationError}</div>
              ) : null}

              <form onSubmit={handleCreateArea} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm grid gap-3 md:grid-cols-7">
                <select
                  value={areaForm.countryCode}
                  onChange={(e) =>
                    setAreaForm((prev) => ({
                      ...prev,
                      countryCode: e.target.value,
                      stateCode: "",
                      cityName: "",
                      latitude: "",
                      longitude: "",
                    }))
                  }
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="">Select Country</option>
                  {locations.countries.map((country) => (
                    <option key={country.id} value={country.country_code}>{country.country_name}</option>
                  ))}
                </select>
                <select
                  value={areaForm.stateCode}
                  onChange={(e) =>
                    setAreaForm((prev) => ({
                      ...prev,
                      stateCode: e.target.value,
                      cityName: "",
                      latitude: "",
                      longitude: "",
                    }))
                  }
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="">Select State</option>
                  {statesForAreaForm.map((state) => (
                    <option key={state.id} value={state.state_code}>{state.state_name}</option>
                  ))}
                </select>
                <select
                  value={areaForm.cityName}
                  onChange={(e) => {
                    const nextCityName = e.target.value;
                    const city = citiesForAreaForm.find((item) => item.city_name === nextCityName);
                    setAreaForm((prev) => ({
                      ...prev,
                      cityName: nextCityName,
                      latitude:
                        city?.latitude !== null && city?.latitude !== undefined
                          ? String(city.latitude)
                          : "",
                      longitude:
                        city?.longitude !== null && city?.longitude !== undefined
                          ? String(city.longitude)
                          : "",
                    }));
                  }}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                >
                  <option value="">Select City</option>
                  {citiesForAreaForm.map((city) => (
                    <option key={city.id} value={city.city_name}>{city.city_name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  placeholder="Area Name"
                  value={areaForm.areaName}
                  onChange={(e) => setAreaForm((prev) => ({ ...prev, areaName: e.target.value }))}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
                <input
                  type="number"
                  step="0.000001"
                  placeholder="Latitude"
                  value={areaForm.latitude}
                  onChange={(e) => setAreaForm((prev) => ({ ...prev, latitude: e.target.value }))}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
                <input
                  type="number"
                  step="0.000001"
                  placeholder="Longitude"
                  value={areaForm.longitude}
                  onChange={(e) => setAreaForm((prev) => ({ ...prev, longitude: e.target.value }))}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500"
                />
                <button
                  type="submit"
                  disabled={locationSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  <Plus size={15} /> Add Area
                </button>
              </form>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="relative">
                    <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={areaSearch}
                      onChange={(e) => setAreaSearch(e.target.value)}
                      placeholder="Search areas..."
                      className="w-full rounded-xl border border-slate-200 bg-white px-9 py-2.5 text-sm outline-none focus:border-emerald-500"
                    />
                  </div>
                  <select
                    value={areaStatusFilter}
                    onChange={(e) => setAreaStatusFilter(e.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-500"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left text-slate-600">
                      <th className="px-4 py-3">Area</th>
                      <th className="px-4 py-3">City</th>
                      <th className="px-4 py-3">State</th>
                      <th className="px-4 py-3">Country</th>
                      <th className="px-4 py-3">Latitude</th>
                      <th className="px-4 py-3">Longitude</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAreas.map((area, index) => (
                      <tr key={area.id} className={`border-b border-slate-100 border-l-4 ${createHighlightClass(index)} ${getRowBgColor(index)}`}>
                        <td className="px-4 py-3 font-semibold text-slate-900">{area.area_name}</td>
                        <td className="px-4 py-3 text-slate-600">{area.city_name}</td>
                        <td className="px-4 py-3 text-slate-600">{area.state_code}</td>
                        <td className="px-4 py-3 text-slate-600">{area.country_code}</td>
                        <td className="px-4 py-3 text-slate-600">{area.latitude ?? "-"}</td>
                        <td className="px-4 py-3 text-slate-600">{area.longitude ?? "-"}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${createHighlightBadgeClass(index)}`}>
                            {area.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openLocationModal("areas", area)}
                              className={`grid h-8 w-8 place-items-center rounded-lg transition ${createActionButtonClass(index)}`}
                              title="View details"
                            >
                              <Eye size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => openLocationModal("areas", { ...area, isEdit: true })}
                              className={`grid h-8 w-8 place-items-center rounded-lg transition ${createActionButtonClass(index)}`}
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteLocation("areas", area.id, area.area_name)}
                              className={`grid h-8 w-8 place-items-center rounded-lg transition ${createActionDelButtonClass()}`}
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          </div>
        </main>
      </div>
    );
  }

