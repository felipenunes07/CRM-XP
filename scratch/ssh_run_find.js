const { Client } = require('ssh2');

const remoteScriptContent = `
import { pool } from "./apps/api/src/db/client.js";

async function run() {
  const res = await pool.query(\`
    SELECT id, customer_code, display_name, normalized_name, source_system_first
    FROM customers
    ORDER BY normalized_name, customer_code
  \`);

  const rows = res.rows;
  const erpDuplicates = [];

  for (let i = 0; i < rows.length; i++) {
    for (let j = 0; j < rows.length; j++) {
      if (i === j) continue;
      const c1 = rows[i];
      const c2 = rows[j];

      const c1IsNumeric = /^\\d+$/.test(c1.customer_code);
      const c2IsAlphaNumeric = /^[A-Z]+\\d+$/.test(c2.customer_code);

      if (c1IsNumeric && c2IsAlphaNumeric) {
        const codeInName = c1.display_name.toUpperCase().includes(c2.customer_code.toUpperCase());
        const cleanName1 = c1.display_name.replace(new RegExp(\`^\${c2.customer_code}\\\\s*-\\\\s*\`, 'i'), '').trim();
        const cleanName2 = c2.display_name.trim();
        const baseNameMatch = cleanName1.toLowerCase() === cleanName2.toLowerCase();

        if (codeInName && baseNameMatch) {
          erpDuplicates.push({ numeric: c1, alphanumeric: c2 });
        }
      }

      if (c1.customer_code === '754884308' && c2.customer_code === 'SEMCL') {
        erpDuplicates.push({ numeric: c1, alphanumeric: c2 });
      }
    }
  }

  console.log("=== FOUND " + erpDuplicates.length + " ERP DUPLICATES IN PRODUCTION ===");
  erpDuplicates.forEach((d, idx) => {
    console.log((idx + 1) + ". Numeric: " + d.numeric.customer_code + " (\\"" + d.numeric.display_name + "\\") <---> Alphanumeric: " + d.alphanumeric.customer_code + " (\\"" + d.alphanumeric.display_name + "\\")");
  });

  await pool.end();
}

run().catch(console.error);
`;

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection ready. Writing find_duplicates.ts to remote VPS /tmp...');
  
  // Write the TS content directly to /tmp/find_duplicates.ts via bash shell redirection
  const base64Content = Buffer.from(remoteScriptContent).toString('base64');
  conn.exec(`echo "${base64Content}" | base64 -d > /tmp/find_duplicates.ts`, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      console.log('File written to /tmp/find_duplicates.ts on VPS.');
      
      // Copy to container
      console.log('Copying file to backend docker container...');
      conn.exec('docker cp /tmp/find_duplicates.ts xpcrm_crm-backend.1.r7gcyn4c3repo1wi3ab6biq27:/app/find_duplicates.ts', (err2, stream2) => {
        if (err2) throw err2;
        stream2.on('close', () => {
          console.log('File copied to /app/find_duplicates.ts in container.');
          
          // Run using tsx
          console.log('Running script via docker exec npx tsx...');
          conn.exec('docker exec xpcrm_crm-backend.1.r7gcyn4c3repo1wi3ab6biq27 npx tsx find_duplicates.ts', (err3, stream3) => {
            if (err3) throw err3;
            let runOutput = '';
            stream3.on('close', (code) => {
              console.log('Execution finished with code ' + code);
              console.log('\n=== RESULT FROM PRODUCTION DATABASE ===');
              console.log(runOutput);
              
              // Cleanup
              conn.exec('docker exec xpcrm_crm-backend.1.r7gcyn4c3repo1wi3ab6biq27 rm /app/find_duplicates.ts; rm /tmp/find_duplicates.ts', () => {
                conn.end();
              });
            }).on('data', (d) => {
              runOutput += d;
            }).stderr.on('data', (d) => {
              console.error('STDERR: ' + d);
            });
          });
        });
      });
    });
  });
}).connect({
  host: '167.88.32.178',
  port: 22,
  username: 'root',
  password: '9630Jinrenexpor@'
});
