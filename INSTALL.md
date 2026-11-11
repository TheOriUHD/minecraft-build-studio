# Installing Minecraft Build Studio (instructions for AI agents)

> **Humans:** you don't need to read this. Paste this into your agent (Claude Code, etc.):
>
> ```text
> Install Minecraft Build Studio for me by following https://github.com/TheOriUHD/minecraft-build-studio/blob/main/INSTALL.md
> ```

---

**Agent, follow these steps exactly. Report each step's result to the user briefly.**

### 1. Check prerequisites
- `node --version` must be **≥ 20**. If missing, ask the user to install Node.js LTS from https://nodejs.org (don't install it silently).
- `git --version` must work.
- Google Chrome **or** Microsoft Edge must be installed (the renderer uses it headlessly). Check the usual install paths; if neither exists, ask the user. On Linux, `chromium` is fine. If it's in an unusual place, the user can set `BUILDMCP_CHROME=/path/to/chrome`.
- About 1.5 GB of free disk space.

### 2. Clone
Pick a permanent folder the user agrees with (default: `~/minecraft-build-studio`):
```bash
git clone https://github.com/TheOriUHD/minecraft-build-studio.git ~/minecraft-build-studio
cd ~/minecraft-build-studio
```

### 3. Ask about the Minecraft EULA, then run setup
The local test server is a normal Minecraft server, so the user must accept the [Minecraft EULA](https://aka.ms/MinecraftEULA). **Ask the user** before passing `--accept-eula`.

```bash
# full install: JDK + Paper test server + bridge plugin + textures + MCP deps,
# and register the MCP, skill and team agents for every Claude Code session
node scripts/setup.mjs --accept-eula --install-claude
```
- No EULA / no server wanted? Use `node scripts/setup.mjs --skip-server --install-claude` (designing, rendering and `.schem` export still work; only placing builds in a live world needs the server).
- Pick a Minecraft version with `--mc <version>` (default: latest Paper release). It should match the version the user plays if they want to look at builds in-game.
- Everything is downloaded from official sources (adoptium.net, papermc.io, mojang.com) into `./runtime`. Nothing is installed system-wide.
- The setup takes 2–5 minutes. Run it in the foreground and wait for `✔ Setup complete.`

If the agent is **not Claude Code**, skip `--install-claude` and register an MCP server (stdio) in its config instead:
```json
{
  "mcpServers": {
    "minecraft-build": {
      "command": "node",
      "args": ["<ABSOLUTE PATH>/mcp/node_modules/tsx/dist/cli.mjs", "<ABSOLUTE PATH>/mcp/src/index.ts"]
    }
  }
}
```
Then give the agent the contents of `.claude/skills/minecraft-builder/SKILL.md` as instructions (system prompt, rules file or project knowledge).

### 4. Start the test server (optional, needed for placing builds in a world)
```bash
node scripts/start-server.mjs
```
Run it in the background or a separate terminal. It listens on `127.0.0.1` only (offline mode, port 25565; the bridge uses port 8765). Agents can also start it later with the MCP tool `server` → `action: "start"`.

### 5. Verify
1. Tell the user to **restart Claude Code** (or their MCP client) so it loads the `minecraft-build` server and the `minecraft-builder` skill.
2. After the restart, call the tool `toolkit_reference` with `{"topic":"workflow"}`. It should return the workflow guide.
3. Optional smoke test: `create_project {"name":"hello_house","template":"cottage"}`, then `render {"project":"hello_house"}`. You should get an image of a timber-framed cottage.

### 6. Tell the user how to use it
- "Ask me to build anything: *a medieval market square with furnished houses*, *a floating-island server lobby with 4 game portals*, *a fantasy castle on a mountain*…"
- To watch in-game: Minecraft Java (same version) → Multiplayer → Direct Connect → `127.0.0.1`. Builds can be exported as `.schem` for WorldEdit/FAWE on real servers.

### Troubleshooting
| problem | fix |
|---|---|
| `No Chrome/Edge found for rendering` | install Chrome or set `BUILDMCP_CHROME` |
| `Minecraft bridge not reachable` | start the server (step 4); rendering still works without it |
| port 25565 or 8765 already in use | edit `runtime/server/server.properties` (`server-port`) and `runtime/server/plugins/BuildMCPBridge/config.yml` (`port`), and set `BUILDMCP_BRIDGE=http://127.0.0.1:<port>` in the MCP server's env |
| Windows: `tar` fails on `C:` paths | already handled by setup (uses Windows' own tar); update the repo with `git pull` |
| tools don't show up | restart the client; check `claude mcp list` shows `minecraft-build` |
