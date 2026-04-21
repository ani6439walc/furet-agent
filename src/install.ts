import { execSync } from "node:child_process";
import { copyFileSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { resolve, dirname } from "node:path";

const ROOT = resolve(import.meta.dirname!, "..");

function run(cmd: string, opts?: { sudo?: boolean }) {
  const full = opts?.sudo ? `sudo ${cmd}` : cmd;
  console.log(`$ ${full}`);
  execSync(full, { stdio: "inherit", cwd: ROOT });
}

function copyIfMissing(src: string, dest: string) {
  const srcPath = resolve(ROOT, src);
  const destPath = resolve(ROOT, dest);
  if (existsSync(destPath)) {
    console.log(`skip: ${dest} already exists`);
  } else {
    copyFileSync(srcPath, destPath);
    console.log(`created: ${dest}`);
  }
}

// --- 1. npm install ---
console.log("\n=== Installing dependencies ===");
run("npm install");

// --- 2. config files ---
console.log("\n=== Config files ===");
copyIfMissing("config.example.yaml", "config.yaml");
copyIfMissing(".env.example", ".env");

// --- 3. npm link ---
console.log("\n=== Registering furet command ===");
run("npm link");

// --- 4. systemd service ---
console.log("\n=== Installing systemd service ===");

const nodeBinDir = dirname(process.execPath);
const furetBin = `${nodeBinDir}/furet`;

const unit = `[Unit]
Description=Furet Discord Bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${process.env.USER}
WorkingDirectory=${ROOT}
ExecStart=${furetBin} gateway
Restart=on-failure
RestartSec=5
Environment=PATH=${nodeBinDir}:${ROOT}/node_modules/.bin:/usr/bin

[Install]
WantedBy=multi-user.target
`;

const tmp = "/tmp/furet.service";
writeFileSync(tmp, unit);
run(`cp ${tmp} /etc/systemd/system/furet.service`, { sudo: true });
unlinkSync(tmp);

run("systemctl daemon-reload", { sudo: true });
run("systemctl enable furet", { sudo: true });

console.log("\n=== Done ===");
console.log("Edit .env and config.yaml, then run: furet gateway");
