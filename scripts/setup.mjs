#!/usr/bin/env node
// One-shot setup for Minecraft Build Studio.
//   node scripts/setup.mjs --accept-eula [--mc 26.2] [--skip-server]
// Installs into ./runtime: a Temurin JDK, a Paper server with the bridge plugin, block textures/models from the
// official client jar; installs the MCP's npm dependencies. Everything is downloaded from official sources
// (adoptium.net, papermc.io, mojang.com). Nothing is installed system-wide.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline/promises";

const ROOT = path.resolve(import.meta.dirname, "..");
const RT = path.join(ROOT, "runtime");
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const log = (...m) => console.log("›", ...m);
const isWin = process.platform === "win32";

async function json(url) {
  const r = await fetch(url, { headers: { "User-Agent": "minecraft-build-studio-setup" } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}
async function download(url, dest) {
  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return log("cached", path.basename(dest));
  log("downloading", url);
  const r = await fetch(url, { headers: { "User-Agent": "minecraft-build-studio-setup" } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest + ".part", Buffer.from(await r.arrayBuffer()));
  fs.renameSync(dest + ".part", dest);
}
function run(cmd, a, o = {}) {
  execFileSync(cmd, a, { stdio: "inherit", ...o });
}

fs.mkdirSync(path.join(RT, "dl"), { recursive: true });

// 1. npm dependencies of the MCP
log("installing MCP dependencies");
execFileSync("npm install --no-fund --no-audit", { cwd: path.join(ROOT, "mcp"), stdio: "inherit", shell: true });

// 2. Minecraft version
const paper = await json("https://fill.papermc.io/v3/projects/paper");
const latestPaper = Object.values(paper.versions).flat().find((v) => /^\d+(\.\d+)+$/.test(v));
// keep an existing install's version unless --mc is given (client textures and server must match)
const marker = path.join(RT, ".mc-version");
const mc = opt("--mc", fs.existsSync(marker) ? fs.readFileSync(marker, "utf8").trim() : latestPaper);
log("Minecraft version:", mc);

// 3. JDK (Temurin 25)
let jdkDir = fs.readdirSync(RT).find((d) => d.startsWith("jdk"));
if (!jdkDir) {
  const osName = isWin ? "windows" : process.platform === "darwin" ? "mac" : "linux";
  const arch = os.arch() === "arm64" ? "aarch64" : "x64";
  const assets = await json(`https://api.adoptium.net/v3/assets/latest/25/hotspot?architecture=${arch}&image_type=jdk&os=${osName}`);
  const pkg = assets[0].binary.package;
  const file = path.join(RT, "dl", pkg.name);
  await download(pkg.link, file);
  log("extracting JDK");
  run("tar", ["-xf", file, "-C", RT]);
  jdkDir = fs.readdirSync(RT).find((d) => d.startsWith("jdk"));
}
let jdkHome = path.join(RT, jdkDir);
if (fs.existsSync(path.join(jdkHome, "Contents", "Home"))) jdkHome = path.join(jdkHome, "Contents", "Home"); // macOS layout
const bin = (n) => path.join(jdkHome, "bin", isWin ? `${n}.exe` : n);

// 4. Client jar → textures & models
const manifest = await json("https://piston-meta.mojang.com/mc/game/version_manifest_v2.json");
const ver = manifest.versions.find((v) => v.id === mc);
if (!ver) throw new Error(`Minecraft version ${mc} not found in Mojang's manifest`);
const vjson = await json(ver.url);
const clientJar = path.join(RT, "dl", `client-${mc}.jar`);
await download(vjson.downloads.client.url, clientJar);
const assetMarker = path.join(RT, "assets", ".version");
if (!fs.existsSync(path.join(RT, "assets", "blockstates")) || (fs.existsSync(assetMarker) ? fs.readFileSync(assetMarker, "utf8").trim() : "") !== mc) {
  fs.rmSync(path.join(RT, "assets"), { recursive: true, force: true });
  log("extracting block models & textures");
  run(process.execPath, [path.join(ROOT, "mcp", "node_modules", "tsx", "dist", "cli.mjs"), path.join(ROOT, "mcp", "scripts", "extract-assets.ts"), clientJar, path.join(RT, "assets")]);
  fs.writeFileSync(assetMarker, mc);
}

// 5. Paper server + bridge plugin
if (!flag("--skip-server")) {
  const server = path.join(RT, "server");
  fs.mkdirSync(path.join(server, "plugins"), { recursive: true });
  const build = await json(`https://fill.papermc.io/v3/projects/paper/versions/${mc}/builds/latest`);
  await download(build.downloads["server:default"].url, path.join(server, "paper.jar"));
  let eula = flag("--accept-eula");
  if (!eula) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await rl.question("Do you accept the Minecraft EULA (https://aka.ms/MinecraftEULA)? [y/N] ");
    rl.close();
    eula = /^y/i.test(ans.trim());
  }
  if (!eula) throw new Error("EULA not accepted — re-run with --accept-eula or --skip-server");
  fs.writeFileSync(path.join(server, "eula.txt"), "eula=true\n");
  if (!fs.existsSync(path.join(server, "server.properties"))) {
    fs.writeFileSync(path.join(server, "server.properties"), [
      "online-mode=false", "server-ip=127.0.0.1", "server-port=25565", "motd=Build Studio test server", "gamemode=creative",
      "difficulty=peaceful", "spawn-protection=0", "view-distance=12", "simulation-distance=6", "level-name=world", "max-players=8", "",
    ].join("\n"));
  }
  // first run extracts the libraries we compile the plugin against
  if (!fs.existsSync(path.join(server, "libraries"))) {
    log("first server start (generates libraries, ~1 min)");
    await new Promise((res, rej) => {
      const p = spawn(bin("java"), ["-Xmx4G", "-jar", "paper.jar", "--nogui"], { cwd: server });
      p.stdout.on("data", (d) => {
        const s = d.toString();
        if (/Done \(/.test(s)) p.stdin.write("stop\n");
      });
      p.on("exit", res);
      p.on("error", rej);
    });
  }
  log("building bridge plugin");
  const jars = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".jar")) jars.push(p);
    }
  };
  walk(path.join(server, "libraries"));
  walk(path.join(server, "versions"));
  const out = path.join(ROOT, "plugin", "out");
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(path.join(out, "classes"), { recursive: true });
  const srcs = [];
  const walkSrc = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walkSrc(path.join(d, e.name)) : e.name.endsWith(".java") && srcs.push(path.join(d, e.name))));
  walkSrc(path.join(ROOT, "plugin", "src"));
  run(bin("javac"), ["--release", "21", "-nowarn", "-cp", jars.join(path.delimiter), "-d", path.join(out, "classes"), ...srcs]);
  for (const f of fs.readdirSync(path.join(ROOT, "plugin", "resources"))) fs.copyFileSync(path.join(ROOT, "plugin", "resources", f), path.join(out, "classes", f));
  run(bin("jar"), ["cf", path.join(out, "BuildMCPBridge.jar"), "-C", path.join(out, "classes"), "."]);
  fs.copyFileSync(path.join(out, "BuildMCPBridge.jar"), path.join(server, "plugins", "BuildMCPBridge.jar"));
}

fs.writeFileSync(marker, mc);
console.log(`
✔ Setup complete.
  Start the test server:   node scripts/start-server.mjs      (or ask Claude: server action "start")
  The MCP server is registered for this folder in .mcp.json — open the folder in Claude Code and approve it.
  To use it from anywhere:  claude mcp add minecraft-build --scope user -- node "${path.join(ROOT, "mcp", "node_modules", "tsx", "dist", "cli.mjs")}" "${path.join(ROOT, "mcp", "src", "index.ts")}"
  Join the server in Minecraft ${mc}: Multiplayer → Direct Connect → 127.0.0.1 (offline mode, local only).
`);
