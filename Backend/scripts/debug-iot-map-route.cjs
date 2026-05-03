const { Client } = require("pg");

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function parseMaybeArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}
function parseTelemetryPoint(entry) {
  if (!entry || typeof entry !== "object") return null;
  const lat = toFiniteNumber(entry.latitude ?? entry.lat ?? entry.current_latitude ?? entry.ride_start_latitude ?? entry.ride_end_latitude);
  const lng = toFiniteNumber(entry.longitude ?? entry.lng ?? entry.lon ?? entry.current_longitude ?? entry.ride_start_longitude ?? entry.ride_end_longitude);
  if (lat === null || lng === null) return null;
  const timestampValue = entry.ts ?? entry.timestamp ?? entry.created_at ?? entry.createdon_date ?? entry.updatedon_date ?? entry.lastupdateddateforlatlong ?? entry.lastupdateddateforbatterypercentage ?? null;
  const timestamp = timestampValue ? new Date(timestampValue).toISOString() : null;
  return { lat, lng, ts: timestamp };
}
function parseTelemetryPath(value) {
  const points = parseMaybeArray(value).map((entry) => parseTelemetryPoint(entry)).filter(Boolean);
  const deduped = [];
  for (const point of points) {
    const previous = deduped[deduped.length - 1];
    if (previous && Math.abs(previous.lat - point.lat) < 0.000001 && Math.abs(previous.lng - point.lng) < 0.000001) continue;
    deduped.push(point);
  }
  return deduped;
}
(async () => {
  const c = new Client({ host: "72.60.101.157", port: 5432, database: "evegahdev_new", user: "evegah_user", password: "Evegah2050" });
  await c.connect();
  const liveDevicesQ = await c.query(`select id, lock_number, latitude, longitude, battery, speed, total_distance_in_meters, device_lock_and_unlock_status, imei_number, map_city_id, area_id, lastupdateddateforlatlong, lastupdateddateforbatterypercentage, device_last_request_time, createdon_date, updatedon_date from inventory.tbl_lock_detail where latitude is not null and longitude is not null order by coalesce(lastupdateddateforlatlong, device_last_request_time, updatedon_date, createdon_date) desc nulls last, id desc`);
  console.log('devices', liveDevicesQ.rows.length);
  const ridesQ = await c.query(`select id, vehicle_uid_id, vehicle_lock_id, bike_id, vehicle_number, createdon_date, updatedon_date, ride_start_latitude, ride_start_longitude, ride_end_latitude, ride_end_longitude, current_latitude, current_longitude, ride_start_ext_battery_percentage, ride_end_ext_battery_percentage, latitude_longitude_json, beepon_latitude_longitude_json, beepoff_latitude_longitude_json, distance_in_meters from admin.tbl_ride_booking order by coalesce(updatedon_date, createdon_date) desc nulls last, id desc limit 250`);
  console.log('rides', ridesQ.rows.length);
  let n = 0;
  for (const row of ridesQ.rows) {
    const vehicleId = String(row.vehicle_number || row.vehicle_lock_id || row.vehicle_uid_id || row.bike_id || row.id || '').trim();
    let points = parseTelemetryPath(row.latitude_longitude_json);
    if (!points.length) {
      const fallbackPoints = [
        { lat: toFiniteNumber(row.ride_start_latitude), lng: toFiniteNumber(row.ride_start_longitude), ts: row.createdon_date ? new Date(row.createdon_date).toISOString() : null },
        { lat: toFiniteNumber(row.current_latitude), lng: toFiniteNumber(row.current_longitude), ts: row.updatedon_date || row.createdon_date ? new Date(row.updatedon_date || row.createdon_date).toISOString() : null },
        { lat: toFiniteNumber(row.ride_end_latitude), lng: toFiniteNumber(row.ride_end_longitude), ts: row.updatedon_date ? new Date(row.updatedon_date).toISOString() : null },
      ].filter((point) => point.lat !== null && point.lng !== null);
      points = fallbackPoints;
    }
    const beeponPoints = parseTelemetryPath(row.beepon_latitude_longitude_json);
    const beepoffPoints = parseTelemetryPath(row.beepoff_latitude_longitude_json);
    if (n < 5) console.log(vehicleId, points.length, beeponPoints.length, beepoffPoints.length);
    n++;
  }
  await c.end();
})();
