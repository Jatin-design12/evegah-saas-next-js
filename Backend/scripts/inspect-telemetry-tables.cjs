const { Client } = require("pg");
(async () => {
  const c = new Client({ host: "72.60.101.157", port: 5432, database: "evegahdev_new", user: "evegah_user", password: "Evegah2050" });
  await c.connect();
  const q = await c.query(
    "select table_schema, table_name from information_schema.tables where lower(table_name) similar to '%(gps|track|telemetry|location|position|route|path|history|log|coords)%' order by table_schema, table_name"
  );
  console.log(JSON.stringify(q.rows, null, 2));
  await c.end();
})();
