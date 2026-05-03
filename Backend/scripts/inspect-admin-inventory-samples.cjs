const { Client } = require("pg");
(async () => {
  const c = new Client({ host: "72.60.101.157", port: 5432, database: "evegahdev_new", user: "evegah_user", password: "Evegah2050" });
  await c.connect();
  const tables = [
    "admin.tbl_add_device_information_log",
    "admin.tbl_ride_booking",
    "inventory.tbl_lock_detail",
    "inventory.tbl_bike_allotment_zone_wise",
    "inventory.tbl_bike_inward"
  ];
  for (const t of tables) {
    const cnt = await c.query(`select count(*)::int as c from ${t}`);
    console.log(`TABLE ${t} ROWS ${cnt.rows[0].c}`);
    const sample = await c.query(`select * from ${t} order by 1 desc limit 2`);
    console.log(JSON.stringify(sample.rows, null, 2));
  }
  await c.end();
})();
