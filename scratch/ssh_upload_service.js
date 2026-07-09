const { Client } = require('ssh2');
const fs = require('fs');
const path = require('path');

const localFilePath = path.join(__dirname, '..', 'apps', 'api', 'src', 'modules', 'analytics', 'analyticsService.ts');
const localFileContent = fs.readFileSync(localFilePath, 'utf8');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection ready. Uploading updated analyticsService.ts to remote VPS...');
  
  const base64Content = Buffer.from(localFileContent).toString('base64');
  conn.exec('echo "' + base64Content + '" | base64 -d > /tmp/analyticsService.ts', (err, stream) => {
    if (err) throw err;
    stream.on('close', () => {
      console.log('File written to /tmp/analyticsService.ts on VPS.');
      
      // Copy to container
      console.log('Copying file to backend docker container...');
      conn.exec('docker cp /tmp/analyticsService.ts xpcrm_crm-backend.1.ue6qd36juo75bla2nr7ah4z4a:/app/apps/api/src/modules/analytics/analyticsService.ts', (err2, stream2) => {
        if (err2) throw err2;
        stream2.on('close', () => {
          console.log('File successfully uploaded to /app/apps/api/src/modules/analytics/analyticsService.ts in container.');
          
          // Cleanup VPS temp file
          conn.exec('rm /tmp/analyticsService.ts', () => {
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
