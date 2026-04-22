import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.join(__dirname, "..");
const WEB_ENV_PATH = path.join(ROOT_DIR, "apps", "web", ".env.local");
const STATIC_NGROK_DOMAIN = "specificative-abdominal-meg.ngrok-free.dev";

const originalEnvExists = fs.existsSync(WEB_ENV_PATH);
const originalEnvContent = originalEnvExists ? fs.readFileSync(WEB_ENV_PATH, "utf8") : null;

let restored = false;
let devProcess = null;
let ngrokProcess = null;

function setApiBaseUrlToRelativeProxy() {
  const currentContent = originalEnvContent ?? "";
  const lines = currentContent
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0 && !line.startsWith("VITE_API_BASE_URL="));

  lines.push("VITE_API_BASE_URL=");
  fs.writeFileSync(WEB_ENV_PATH, `${lines.join("\n")}\n`, "utf8");
}

function restoreOriginalEnv() {
  if (restored) {
    return;
  }

  restored = true;

  if (originalEnvExists && originalEnvContent !== null) {
    fs.writeFileSync(WEB_ENV_PATH, originalEnvContent, "utf8");
    return;
  }

  if (fs.existsSync(WEB_ENV_PATH)) {
    fs.unlinkSync(WEB_ENV_PATH);
  }
}

function waitForHttp(url, label) {
  return new Promise((resolve) => {
    const tryConnect = () => {
      const request = http.get(url, (response) => {
        response.resume();
        resolve();
      });

      request.on("error", () => {
        process.stdout.write(`Aguardando ${label}... \n`);
        setTimeout(tryConnect, 1500);
      });
    };

    tryConnect();
  });
}

function shutdown(exitCode = 0) {
  restoreOriginalEnv();

  if (ngrokProcess && !ngrokProcess.killed) {
    ngrokProcess.kill();
  }

  if (devProcess && !devProcess.killed) {
    devProcess.kill();
  }

  process.exit(exitCode);
}

async function main() {
  console.log("Iniciando compartilhamento do CRM XP...");
  console.log("Configurando o web para usar o proxy local /api do Vite.");

  setApiBaseUrlToRelativeProxy();

  devProcess = spawn("npm", ["run", "dev"], {
    cwd: ROOT_DIR,
    shell: true,
    stdio: "inherit",
  });

  devProcess.on("exit", (code) => {
    shutdown(code ?? 0);
  });

  await waitForHttp("http://127.0.0.1:5173", "frontend em http://localhost:5173");

  console.log("Frontend online. Abrindo o link fixo do ngrok...");
  console.log(`Link esperado: https://${STATIC_NGROK_DOMAIN}`);

  ngrokProcess = spawn("npm", ["run", "share"], {
    cwd: ROOT_DIR,
    shell: true,
    stdio: "inherit",
  });

  ngrokProcess.on("exit", (code) => {
    if (code && code !== 0) {
      shutdown(code);
    }
  });
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("uncaughtException", (error) => {
  console.error(error);
  shutdown(1);
});

main().catch((error) => {
  console.error(error);
  shutdown(1);
});
