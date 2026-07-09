const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection ready. Running docker ps...');
  conn.exec('docker ps --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"', (err, stream) => {
    if (err) throw err;
    let output = '';
    stream.on('close', (code, signal) => {
      console.log('Command finished with code ' + code);
      console.log('=== DOCKER PROCESSES ===');
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
