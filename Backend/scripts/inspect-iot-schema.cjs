const { Client } = require("pg");

(async () => {
  const c = new Client({
    host: "72.60.101.157",
    port: 5432,
    database: "evegahdev_new",
    user: "evegah_user",
    password: "Evegah2050",
  });

  await c.connect();

  const q1 = await c.query(
    "select table_schema, table_name from information_schema.tables where table_schema = 'public' order by table_name"
  );
  console.log("TABLES:" + q1.rows.length);
  console.log(q1.rows.map((r) => r.table_name).join("\n"));

  const q2 = await c.query(
    "select table_name, column_name, data_type from information_schema.columns where table_schema = 'public' and (column_name ilike '%lat%' or column_name ilike '%lon%' or column_name ilike '%gps%' or column_name ilike '%battery%' or column_name ilike '%iot%' or column_name ilike '%device%' or column_name ilike '%vehicle%') order by table_name, ordinal_position"
  );
  console.log("\nCOLUMNS_MATCH:" + q2.rows.length);
  for (const r of q2.rows) {
    console.log([r.table_name, r.column_name, r.data_type].join("|"));
  }

  await c.end();
})();
