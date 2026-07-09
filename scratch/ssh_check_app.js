const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection ready. Checking container directory...');
  conn.exec('docker exec xpcrm_crm-backend.1.r7gcyn4c3repo1wi3ab6biq27 pwd', (err, stream) => {
    if (err) throw err;
    let output = '';
    stream.on('close', (code, signal) => {
      console.log('pwd output: ' + output.trim());
      // Now list files
      conn.exec('docker exec xpcrm_crm-backend.1.r7gcyn4c3repo1wi3ab6biq27 ls -la', (err2, stream2) => {
        if (err2) throw err2;
        let lsOutput = '';
        stream2.on('close', () => {
          console.log('=== CONTAINER LS ===');
          console.log(lsOutput);
          conn.end();
        }).on('data', (d) => lsOutput += d);
      });
    }).on('data', (data) => {
      output += data;
    });
  });
}).connect({
  host: '167.88.32.178',
  port: 22,
  username: 'root',
  password: '9630Jinrenexpor@'
});
