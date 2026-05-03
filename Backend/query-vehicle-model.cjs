const { Client } = require('pg');

const client = new Client({
  host: '72.60.101.157',
  port: 5432,
  user: 'evegah_user',
  password: 'Evegah2050',
  database: 'evegahdev_new'
});

async function exploreDatabase() {
  try {
    await client.connect();
    console.log('✓ Connected to database\n');

    // 1. Check admin.tbl_ride_booking columns
    console.log('=== 1. admin.tbl_ride_booking ===');
    const rideBookingColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'admin' AND table_name = 'tbl_ride_booking'
      ORDER BY ordinal_position;
    `);
    
    if (rideBookingColumns.rows.length > 0) {
      console.log('Columns found:');
      rideBookingColumns.rows.forEach(row => {
        console.log(`  - ${row.column_name} (${row.data_type})`);
      });
      
      // Check for model/type/brand related columns
      const relevant = rideBookingColumns.rows.filter(r => 
        r.column_name.toLowerCase().includes('model') || 
        r.column_name.toLowerCase().includes('type') || 
        r.column_name.toLowerCase().includes('brand') ||
        r.column_name.toLowerCase().includes('vehicle')
      );
      
      if (relevant.length > 0) {
        console.log('\nRelevant columns for vehicle info:');
        relevant.forEach(row => console.log(`  ✓ ${row.column_name}`));
        
        // Get sample data
        console.log('\nSample data:');
        const sampleData = await client.query(`
          SELECT ${relevant.map(r => r.column_name).join(', ')} 
          FROM admin.tbl_ride_booking 
          LIMIT 3;
        `);
        console.log(JSON.stringify(sampleData.rows, null, 2));
      }
    } else {
      console.log('Table not found or no columns');
    }

    // 2. Check inventory.tbl_lock_detail columns
    console.log('\n=== 2. inventory.tbl_lock_detail ===');
    const lockDetailColumns = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'inventory' AND table_name = 'tbl_lock_detail'
      ORDER BY ordinal_position;
    `);
    
    if (lockDetailColumns.rows.length > 0) {
      console.log('Columns found:');
      lockDetailColumns.rows.forEach(row => {
        console.log(`  - ${row.column_name} (${row.data_type})`);
      });
      
      const relevant = lockDetailColumns.rows.filter(r => 
        r.column_name.toLowerCase().includes('model') || 
        r.column_name.toLowerCase().includes('type') || 
        r.column_name.toLowerCase().includes('brand') ||
        r.column_name.toLowerCase().includes('vehicle')
      );
      
      if (relevant.length > 0) {
        console.log('\nRelevant columns for vehicle info:');
        relevant.forEach(row => console.log(`  ✓ ${row.column_name}`));
        
        console.log('\nSample data:');
        const sampleData = await client.query(`
          SELECT ${relevant.map(r => r.column_name).join(', ')} 
          FROM inventory.tbl_lock_detail 
          LIMIT 3;
        `);
        console.log(JSON.stringify(sampleData.rows, null, 2));
      }
    } else {
      console.log('Table not found or no columns');
    }

    // 3. Check for vehicle_master or similar tables in public schema
    console.log('\n=== 3. Searching for vehicle/model/type tables ===');
    const vehicleTables = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND (table_name LIKE '%vehicle%' OR table_name LIKE '%model%' OR table_name LIKE '%bike%')
      ORDER BY table_name;
    `);
    
    if (vehicleTables.rows.length > 0) {
      console.log('Found vehicle-related tables:');
      vehicleTables.rows.forEach(row => console.log(`  - ${row.table_name}`));
      
      // Get details for each found table
      for (const table of vehicleTables.rows) {
        console.log(`\nColumns in ${table.table_name}:`);
        const columns = await client.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position;
        `, [table.table_name]);
        
        columns.rows.forEach(row => {
          console.log(`  - ${row.column_name} (${row.data_type})`);
        });
        
        // Sample data
        console.log(`\nSample data from ${table.table_name}:`);
        const sample = await client.query(`SELECT * FROM public."${table.table_name}" LIMIT 2;`);
        console.log(JSON.stringify(sample.rows, null, 2));
      }
    } else {
      console.log('No vehicle/model/bike tables found in public schema');
    }

    // 4. Search all schemas for vehicle/model tables
    console.log('\n=== 4. All tables with model/type/vehicle keywords ===');
    const allRelevantTables = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_name LIKE '%vehicle%' 
         OR table_name LIKE '%model%' 
         OR table_name LIKE '%bike%'
         OR table_name LIKE '%lock%'
      ORDER BY table_schema, table_name;
    `);
    
    console.log('Found tables:');
    allRelevantTables.rows.forEach(row => {
      console.log(`  - ${row.table_schema}.${row.table_name}`);
    });

    // 5. Check foreign key relationships from ride_booking and lock_detail
    console.log('\n=== 5. Foreign Key Relationships ===');
    const fks = await client.query(`
      SELECT 
        constraint_name, table_name, column_name, 
        foreign_table_name, foreign_column_name
      FROM information_schema.key_column_usage
      WHERE table_name IN ('tbl_ride_booking', 'tbl_lock_detail')
      ORDER BY table_name, column_name;
    `);
    
    if (fks.rows.length > 0) {
      console.log('Foreign keys found:');
      fks.rows.forEach(row => {
        console.log(`  ${row.table_name}.${row.column_name} → ${row.foreign_table_name}.${row.foreign_column_name}`);
      });
    }

  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await client.end();
  }
}

exploreDatabase();
