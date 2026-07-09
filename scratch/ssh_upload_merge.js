const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const localScriptPath = path.join(__dirname, '..', 'apps', 'api', 'src', 'scripts', 'mergeDuplicates.ts');
const localScriptContent = fs.readFileSync(localScriptPath, 'utf8');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection ready. Uploading mergeDuplicates.ts to remote VPS...');
  
  const base64Content = Buffer.from(localScriptContent).toString('base64');
  conn.exec(`echo "${base64Content}" | base64 -d > /tmp/mergeDuplicates.ts`, (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      console.log('File written to /tmp/mergeDuplicates.ts on VPS.');
      
      // Copy to container
      console.log('Copying file to backend docker container...');
      conn.exec('docker cp /tmp/mergeDuplicates.ts xpcrm_crm-backend.1.r7gcyn4c3repo1wi3ab6biq27:/app/apps/api/src/scripts/mergeDuplicates.ts', (err2, stream2) => {
        if (err2) throw err2;
        stream2.on('close', () => {
          console.log('File successfully uploaded to /app/apps/api/src/scripts/mergeDuplicates.ts in container.');
          console.log('Ready for execution!');
          
          // Cleanup VPS temp file
          conn.exec('rm /tmp/mergeDuplicates.ts', () => {
            conn.end();
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
