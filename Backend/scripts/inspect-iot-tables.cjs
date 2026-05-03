const { Client } = require("pg");

(async () => {
  const c = new Client({ host: "72.60.101.157", port: 5432, database: "evegahdev_new", user: "evegah_user", password: "Evegah2050" });
  await c.connect();

  const tables = ["fleet_vehicles", "fleet_batteries", "rentals", "riders", "battery_swaps", "zone_management"];
  for (const t of tables) {
    const cols = await c.query(
      "select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position",
      [t]
    );
    console.log(`\nTABLE ${t} COLUMNS (${cols.rows.length})`);
    console.log(cols.rows.map((r) => `${r.column_name}:${r.data_type}`).join("\n"));
    const cnt = await c.query(`select count(*)::int as c from public.${t}`);
    console.log(`ROWS ${t}: ${cnt.rows[0].c}`);
  }

  const samples = await c.query(
    `select id, vehicle_number, battery_id, meta, created_at
     from public.rentals
     order by created_at desc
     limit 5`
  );
  console.log("\nRENTALS SAMPLE");
  for (const r of samples.rows) {
    console.log(JSON.stringify(r));
  }

  await c.end();
})();
