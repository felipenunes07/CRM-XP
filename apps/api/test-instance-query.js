import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:54322/postgres'
});

async function testQuery() {
  try {
    console.log('Testing whatsapp_instances table...\n');
    
    const result = await pool.query(`
      SELECT 
        id,
        instance_name,
        display_label,
        provider,
        evolution_base_url,
        evolution_api_key,
        uazapi_base_url,
        uazapi_token,
        status
      FROM whatsapp_instances
      LIMIT 5
    `);
    
    console.log('✅ Query successful!');
    console.log(`Found ${result.rows.length} instances:\n`);
    
    result.rows.forEach((row, i) => {
      console.log(`Instance ${i + 1}:`);
      console.log(`  - Name: ${row.instance_name}`);
      console.log(`  - Label: ${row.display_label}`);
      console.log(`  - Provider: ${row.provider}`);
      console.log(`  - Status: ${row.status}`);
      console.log(`  - Has Evolution config: ${!!(row.evolution_base_url && row.evolution_api_key)}`);
      console.log(`  - Has UazAPI config: ${!!(row.uazapi_base_url && row.uazapi_token)}`);
      console.log('');
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await pool.end();
  }
}

testQuery();
