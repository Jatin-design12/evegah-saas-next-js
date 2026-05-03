const { Client } = require("pg");
(async () => {
  const c = new Client({ host: "72.60.101.157", port: 5432, database: "evegahdev_new", user: "evegah_user", password: "Evegah2050" });
  await c.connect();
  const cols = await c.query("select column_name, data_type from information_schema.columns where table_schema='admin' and table_name='tbl_ride_booking' order by ordinal_position");
  console.log(cols.rows.map((r) => `${r.column_name}:${r.data_type}`).join("\n"));
  const sample = await c.query(`select id, vehicle_uid_id, vehicle_lock_id, current_latitude, current_longitude, latitude_longitude_json, beepon_latitude_longitude_json, beepoff_latitude_longitude_json, ride_start_latitude, ride_start_longitude, ride_end_latitude, ride_end_longitude, ride_start_ext_battery_percentage, ride_end_ext_battery_percentage, createdon_date
                                from admin.tbl_ride_booking
                                order by createdon_date desc
                                limit 3`);
  console.log(JSON.stringify(sample.rows, null, 2));
  await c.end();
})();
