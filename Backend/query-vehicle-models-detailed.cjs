const { Client } = require('pg');

const client = new Client({
  host: '72.60.101.157',
  port: 5432,
  user: 'evegah_user',
  password: 'Evegah2050',
  database: 'evegahdev_new'
});

async function exploreVehicleModels() {
  try {
    await client.connect();

    // 1. Check masters.tbl_vehicle_model
    console.log('=== masters.tbl_vehicle_model ===');
    const modelColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'masters' AND table_name = 'tbl_vehicle_model'
      ORDER BY ordinal_position;
    `);
    
    console.log('Columns:');
    modelColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });
    
    console.log('\nAll sample data:');
    const modelData = await client.query(`SELECT * FROM masters.tbl_vehicle_model LIMIT 10;`);
    console.log(JSON.stringify(modelData.rows, null, 2));

    // 2. Check masters.tbl_vehicle_type
    console.log('\n=== masters.tbl_vehicle_type ===');
    const typeColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'masters' AND table_name = 'tbl_vehicle_type'
      ORDER BY ordinal_position;
    `);
    
    console.log('Columns:');
    typeColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });
    
    console.log('\nAll sample data:');
    const typeData = await client.query(`SELECT * FROM masters.tbl_vehicle_type LIMIT 10;`);
    console.log(JSON.stringify(typeData.rows, null, 2));

    // 3. Check masters.tbl_product_bike (if it exists in masters)
    console.log('\n=== inventory.tbl_product_bike ===');
    const bikeColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'inventory' AND table_name = 'tbl_product_bike'
      ORDER BY ordinal_position;
    `);
    
    if (bikeColumns.rows.length > 0) {
      console.log('Columns:');
      bikeColumns.rows.forEach(row => {
        console.log(`  - ${row.column_name} (${row.data_type})`);
      });
      
      console.log('\nSample data:');
      const bikeData = await client.query(`SELECT * FROM inventory.tbl_product_bike LIMIT 5;`);
      console.log(JSON.stringify(bikeData.rows, null, 2));
    }

    // 4. Check relationship: vehicle_model_id in tbl_ride_booking with masters.tbl_vehicle_model
    console.log('\n=== JOIN: admin.tbl_ride_booking + masters.tbl_vehicle_model ===');
    const joinData = await client.query(`
      SELECT 
        rb.id as ride_id,
        rb.vehicle_model_id,
        vm.* 
      FROM admin.tbl_ride_booking rb
      LEFT JOIN masters.tbl_vehicle_model vm ON rb.vehicle_model_id = vm.id
      LIMIT 5;
    `);
    console.log(JSON.stringify(joinData.rows, null, 2));

    // 5. Count records
    console.log('\n=== Record Counts ===');
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM masters.tbl_vehicle_model) as vehicle_models_count,
        (SELECT COUNT(*) FROM masters.tbl_vehicle_type) as vehicle_types_count,
        (SELECT COUNT(*) FROM inventory.tbl_product_bike) as product_bikes_count,
        (SELECT COUNT(DISTINCT vehicle_model_id) FROM admin.tbl_ride_booking WHERE vehicle_model_id IS NOT NULL) as unique_models_in_rides;
    `);
    console.log(JSON.stringify(counts.rows[0], null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

exploreVehicleModels();
