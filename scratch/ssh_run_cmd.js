const { Client } = require('ssh2');

const conn = new Client();
conn.on('ready', () => {
  console.log('SSH connection ready. Running command...');
  const cmd = process.argv[2] || 'ls -la /tmp';
  console.log(`Command: ${cmd}`);
  conn.exec(cmd, (err, stream) => {
    if (err) throw err;
    stream.on('close', (code, signal) => {
      console.log(`Close: code=${code}, signal=${signal}`);
      conn.end();
    }).on('data', (data) => {
      console.log('STDOUT: ' + data);
    }).stderr.on('data', (data) => {
      console.log('STDERR: ' + data);
    });
  });
}).on('error', (err) => {
  console.error('Connection error:', err);
}).connect({
  host: '167.88.32.178',
  port: 22,
  username: 'root',
  password: '9630Jinrenexpor@'
});
