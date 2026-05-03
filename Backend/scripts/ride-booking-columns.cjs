const { Client } = require("pg");
(async () => {
  const c = new Client({ host: "72.60.101.157", port: 5432, database: "evegahdev_new", user: "evegah_user", password: "Evegah2050" });
  await c.connect();
  const cols = await c.query("select column_name from information_schema.columns where table_schema='admin' and table_name='tbl_ride_booking' order by ordinal_position");
  console.log(cols.rows.map((r) => r.column_name).join("\n"));
  await c.end();
})();
