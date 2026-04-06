import pg from 'pg';
const { Pool } = pg;

const passwords = [
  '9630Jinren',
  'Felp10197',
  '9630Jinren$',
  'Felp1097',
  'Felp10197$'
];

const host = 'aws-0-sa-east-1.pooler.supabase.com';
const port = 6543;
const user = 'postgres.gxvxgpwdgkeskttasrfz';
const database = 'postgres';

async function testPasswords() {
  for (const pw of passwords) {
    console.log(`Testing password: ${pw}...`);
    const pool = new Pool({
      user,
      host,
      database,
      password: pw,
      port,
      ssl: { rejectUnauthorized: false },
    });

    try {
      const client = await pool.connect();
      console.log(`SUCCESS: Password '${pw}' is CORRECT!`);
      await client.release();
      await pool.end();
      process.exit(0);
    } catch (err) {
      console.log(`FAILED: ${err.message}`);
    } finally {
      await pool.end();
    }
  }
  console.log('None of the passwords worked.');
}

testPasswords();
