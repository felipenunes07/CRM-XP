const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection ready. Getting docker environment variables...');
  conn.exec('docker exec xpcrm_crm-backend.1.r7gcyn4c3repo1wi3ab6biq27 env', (err, stream) => {
    if (err) throw err;
    let output = '';
    stream.on('close', (code, signal) => {
      console.log('Command finished with code ' + code);
      console.log('=== ENV VARIABLES ===');
      console.log(output);
      conn.end();
    }).on('data', (data) => {
      output += data;
    }).stderr.on('data', (data) => {
      console.error('STDERR: ' + data);
    });
  });
}).connect({
  host: '167.88.32.178',
  port: 22,
  username: 'root',
  password: '9630Jinrenexpor@'
});
