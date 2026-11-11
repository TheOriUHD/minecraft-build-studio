# Minecraft Build Studio (MCP)

Give an AI model real building skills in Minecraft — like a team of expert builders.

Instead of placing blocks blindly, the model **writes building code**, **looks at rendered images** of the result, **critiques** it and **revises** — in stages, component by component, alone or as a team of specialised agents. Then it places the build in a real Minecraft server and exports a `.schem`.

```
Claude (skill: minecraft-builder)
   │  MCP (stdio)
   ▼
Build Studio MCP server (Node/TypeScript)
   ├─ projects/<name>/components/*.js   deterministic build scripts (toolkit API)
   ├─ compiler → voxel model → auto-connect (fences, stairs, panes…) 
   ├─ renderer: real block models & textures, three.js in headless Chrome
   │     elevations with rulers, 3/4 views, street level, plans, sections, cutaways, first-person interior views
   ├─ checks: stats, ASCII slices, interior light/reachability analysis
   ├─ reference reader: study any world save (.mca) — render, slice, material stats
   └─ HTTP bridge ─► Paper server plugin (apply diffs, undo, read terrain)
```

## Features
- **Programmable toolkit**: fill/walls/edges/lines/curves/circles/cylinders/spheres/polygons/arches, local frames (`b.at`, rotate/mirror with block-state rotation), `b.around` facade frames, symmetry, repeats, palettes with weighted/clustered mixes and gradients, roofs (gable/hip/shed/flat, multi-part with valleys, any pitch profile), schematic paste.
- **Detail library**: windows, doors, columns, timber framing, chimneys, organic trees, bushes, terrain-following paths, site preparation, stairs.
- **Interiors**: `lib.furnish(room, {type, style})` — reads walls/doors/windows, places beds, wardrobes, shelves, counters, fireplaces, sofas, tables, rugs, chandeliers, clutter; low variants under windows; plus an interior checker (block light, dark spots, headroom, reachability from the door, furniture density).
- **Eyes**: contact sheets of orthographic elevations with block rulers, 3/4 views, street view, plans `plan_y=`, sections, dollhouse `cutaway_y=`, first-person `eye:x,y,z,yaw`, detail close-ups, world context and terrain.
- **World**: apply only the diff, restore original terrain when parts are removed, checkpoints/undo, read back from the world, `.schem` export/import, terrain survey.
- **Teams**: component claims, task board, notes board, role prompts and Claude Code subagents (`mc-architect`, `mc-facade`, `mc-roofer`, `mc-interior`, `mc-landscaper`, `mc-critic`).
- **Knowledge**: a craft handbook (proportions, depth, palettes, roofs, terrain, interiors) including lessons measured from professional server maps.

## Requirements
- Node.js ≥ 20, Google Chrome or Microsoft Edge (for rendering), ~1.5 GB disk.
- Optional: Minecraft Java Edition to look at builds in-game.

## Setup
```bash
git clone <this repo> && cd <repo>
node scripts/setup.mjs --accept-eula        # downloads JDK, Paper, textures into ./runtime; builds the plugin
node scripts/start-server.mjs               # local test server (127.0.0.1, offline mode)
```
`--accept-eula` means you accept the [Minecraft EULA](https://aka.ms/MinecraftEULA) for the local test server. Use `--mc <version>` to pick a Minecraft version (default: latest Paper release), `--skip-server` for render-only use.

Then open the folder in **Claude Code** — `.mcp.json` registers the MCP server and `.claude/skills/minecraft-builder/SKILL.md` teaches Claude how to build. Ask e.g.

> Build a medieval market square with three timber houses, a well and furnished interiors.

To use the MCP from any folder / other MCP clients:
```bash
claude mcp add minecraft-build --scope user -- node <repo>/mcp/node_modules/tsx/dist/cli.mjs <repo>/mcp/src/index.ts
```
(For other clients: command `node`, args `[<repo>/mcp/node_modules/tsx/dist/cli.mjs, <repo>/mcp/src/index.ts]`.) To make the skill global, copy `.claude/skills/minecraft-builder` to `~/.claude/skills/`.

Join the test server in Minecraft (same version) via Multiplayer → Direct Connect → `127.0.0.1`. The model can teleport you to its builds (`server action:"teleport"`).

## Tools (MCP)
| tool | purpose |
|---|---|
| `toolkit_reference` | workflow, API, detail library, craft handbook, views |
| `block_search` | exact block ids + properties for this version |
| `create_project`, `list_projects`, `project_overview`, `update_project`, `survey_site` | projects, palettes, terrain |
| `write_component`, `edit_component`, `read_component`, `write_library`, `component_settings` | build code, claims, order |
| `render` | images (project or live world, with terrain context) |
| `inspect` | stats, ASCII slices, block lists, interior analysis |
| `apply`, `checkpoints`, `remove_from_world` | world placement, undo |
| `export_schematic`, `import_schematic` | Sponge `.schem` (WorldEdit/FAWE) |
| `reference` | study any world save: list, render, slice, material stats |
| `tasks`, `notes` | team coordination |
| `server` | status/start/stop, console commands, teleport a player |

Prompts: `master_builder`, `lead_architect`, `facade_detailer`, `roofer`, `interior_designer`, `landscaper`, `critic`.

## Example
`examples/cottage` — a two-storey timber-framed cottage with furnished interiors, built and revised through the MCP. Start from it with `create_project` `template:"cottage"`.

## Layout
```
mcp/            MCP server (TypeScript, run with tsx), knowledge/ (docs the model reads)
plugin/         Paper bridge plugin (Java, compiled by setup)
scripts/        setup.mjs, start-server.mjs, dev helpers
.claude/        skill + subagents for Claude Code
examples/       example projects
runtime/        (generated) JDK, server, textures — not committed
projects/       (generated) your build projects — not committed
```

## Notes
- The bridge listens on `127.0.0.1:8765` only; set `token` in `runtime/server/plugins/BuildMCPBridge/config.yml` and `BUILDMCP_BRIDGE_TOKEN` if others share the machine.
- Component scripts run in a Node `vm` context — not a security sandbox; only run projects you trust.
- Minecraft textures are extracted locally from the official client jar and are never redistributed.
