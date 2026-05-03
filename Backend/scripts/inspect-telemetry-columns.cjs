const { Client } = require("pg");
(async () => {
  const c = new Client({ host: "72.60.101.157", port: 5432, database: "evegahdev_new", user: "evegah_user", password: "Evegah2050" });
  await c.connect();
  const q = await c.query(
    "select table_schema, table_name, column_name from information_schema.columns where column_name ilike any(array['%gps%','%lat%','%lon%','%lng%','%battery%','%vehicle%','%route%','%track%','%telemetry%','%location%','%coord%']) order by table_schema, table_name, ordinal_position"
  );
  console.log(JSON.stringify(q.rows, null, 2));
  await c.end();
})();
