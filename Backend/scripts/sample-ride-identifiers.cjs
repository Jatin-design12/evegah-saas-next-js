const { Client } = require("pg");
(async () => {
  const c = new Client({ host: "72.60.101.157", port: 5432, database: "evegahdev_new", user: "evegah_user", password: "Evegah2050" });
  await c.connect();
  const sample = await c.query(`select id, bike_id, vehicle_uid_id, vehicle_lock_id, ride_booking_no, createdon_date, current_latitude, current_longitude, ride_start_latitude, ride_start_longitude, ride_end_latitude, ride_end_longitude from admin.tbl_ride_booking order by createdon_date desc nulls last, id desc limit 5`);
  console.log(JSON.stringify(sample.rows, null, 2));
  await c.end();
})();
