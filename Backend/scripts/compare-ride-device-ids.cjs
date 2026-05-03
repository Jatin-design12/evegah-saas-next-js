const { Client } = require("pg");
(async () => {
  const c = new Client({ host: "72.60.101.157", port: 5432, database: "evegahdev_new", user: "evegah_user", password: "Evegah2050" });
  await c.connect();
  const dev = await c.query("select lock_number, imei_number, id from inventory.tbl_lock_detail where lock_number is not null or imei_number is not null or id is not null limit 200");
  const rides = await c.query("select bike_id, vehicle_uid_id, vehicle_lock_id, ride_booking_no, id from admin.tbl_ride_booking limit 250");
  const devKeys = new Set();
  for (const r of dev.rows) {
    [r.lock_number, r.imei_number, String(r.id)].forEach((v) => v && devKeys.add(String(v).trim()));
  }
  const hits = [];
  for (const r of rides.rows) {
    const keys = [r.bike_id, r.vehicle_uid_id, r.vehicle_lock_id, r.ride_booking_no, r.id].map((v) => String(v || '').trim()).filter(Boolean);
    const match = keys.find((k) => devKeys.has(k));
    if (match) hits.push({ ride: r.id, match, keys });
  }
  console.log(JSON.stringify({ deviceCount: dev.rows.length, rideCount: rides.rows.length, hits: hits.slice(0, 20), hitCount: hits.length }, null, 2));
  await c.end();
})();
