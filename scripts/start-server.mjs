#!/usr/bin/env node
// Starts the local Paper test server in the foreground (Ctrl+C or "stop" to quit). The bridge listens on 127.0.0.1:8765.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const RT = path.resolve(import.meta.dirname, "..", "runtime");
const jdk = fs.existsSync(RT) && fs.readdirSync(RT).find((d) => d.startsWith("jdk"));
if (!jdk || !fs.existsSync(path.join(RT, "server", "paper.jar"))) {
  console.error("Server not installed. Run: node scripts/setup.mjs --accept-eula");
  process.exit(1);
}
let home = path.join(RT, jdk);
if (fs.existsSync(path.join(home, "Contents", "Home"))) home = path.join(home, "Contents", "Home");
const java = path.join(home, "bin", process.platform === "win32" ? "java.exe" : "java");
const mem = process.env.BUILDMCP_SERVER_MEM ?? "8G";
spawn(java, [`-Xms2G`, `-Xmx${mem}`, "-XX:+UseG1GC", "-jar", "paper.jar", "--nogui"], { cwd: path.join(RT, "server"), stdio: "inherit" }).on("exit", (c) => process.exit(c ?? 0));
