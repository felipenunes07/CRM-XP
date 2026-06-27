const https = require('https');
const fs = require('fs');
const path = require('path');

const publicScriptsDir = path.join(__dirname, '..', 'apps', 'web', 'public', 'scripts');

if (!fs.existsSync(publicScriptsDir)) {
  fs.mkdirSync(publicScriptsDir, { recursive: true });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        download(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download from ${url}, status code: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log(`Downloaded ${url} to ${dest}`);
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function run() {
  try {
    await download(
      'https://raw.githubusercontent.com/naughtyduk/liquidGL/main/scripts/liquidGL.js',
      path.join(publicScriptsDir, 'liquidGL.js')
    );
    await download(
      'https://raw.githubusercontent.com/naughtyduk/liquidGL/main/scripts/html2canvas.min.js',
      path.join(publicScriptsDir, 'html2canvas.min.js')
    );
    console.log('All downloads completed successfully!');
  } catch (error) {
    console.error('Download failed:', error);
  }
}

run();
