import { Client } from 'ssh2';

const conn = new Client();

const config = {
  host: '167.88.32.178',
  port: 22,
  username: 'root',
  password: '9630Jinrenexpor@',
};

// Query the status of campaign 7f769979-f737-4b1a-ab7b-c35cfc748ebc
const cmd = `docker exec -i $(docker ps -q -f name=xpcrm_postgres.1) psql -U postgres -d xpcrm -c "SELECT id, name, status, video_url FROM whatsapp_campaigns WHERE id = '7f769979-f737-4b1a-ab7b-c35cfc748ebc';"`;

conn.on('ready', () => {
  conn.exec(cmd, (err, stream) => {
    if (err) {
      console.error(err);
      conn.end();
      process.exit(1);
    }
    stream.on('close', (code, signal) => {
      conn.end();
      process.exit(code);
    }).on('data', (data) => {
      process.stdout.write(data);
    }).stderr.on('data', (data) => {
      process.stderr.write(data);
    });
  });
}).on('error', (err) => {
  console.error("Connection error:", err);
  process.exit(1);
}).connect(config);
