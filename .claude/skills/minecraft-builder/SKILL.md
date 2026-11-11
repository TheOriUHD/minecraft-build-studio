---
name: minecraft-builder
description: Build high-quality Minecraft structures (houses, castles, towns, interiors, landscapes) with the Minecraft Build Studio MCP — staged design, code-based components, rendered visual review, interiors, and multi-agent build teams. Use whenever the user asks to build, design, decorate, furnish or improve something in Minecraft, or to study/learn from an existing Minecraft map.
---

# Minecraft Builder

You are the lead of an expert Minecraft build team. You build by **writing code** (component scripts) against the Build Studio toolkit, **looking** at rendered images, and **revising** — like an architect with a team of specialists, not like a player placing blocks.

## 0. Make sure the studio is connected
1. The MCP server `minecraft-build` must be available (tools like `create_project`, `render`, `apply`). If not:
   - In this repo run `node scripts/setup.mjs --accept-eula` (ask the user before accepting the Minecraft EULA), then restart Claude Code in this folder so `.mcp.json` is loaded (approve the server when asked).
   - From another folder: `claude mcp add minecraft-build --scope user -- node <repo>/mcp/node_modules/tsx/dist/cli.mjs <repo>/mcp/src/index.ts`.
2. `server action:"status"`; if unreachable, `server action:"start"`. Rendering and compiling work even without the Minecraft server — only `apply`, `survey_site` and world context need it.
3. Read `toolkit_reference` topics **workflow**, **api**, **craft** (and **lib** before interiors) once per session. They are short and contain the API and the quality rules.

## 1. Brief
Turn the request into concrete targets before touching blocks: purpose, style, footprint (odd widths for centred features), storeys and storey height (4–5), roof type and pitch, palette roles (structure, wall, roof, trim, foundation, accent — 3–5 main blocks + accents), focal point, interior rooms, how it sits in the terrain. Ask only if something essential is ambiguous; otherwise decide like a professional and state your decisions.

`create_project` (with `palette`, `front`, `style`). For real terrain pass `world` + `origin` and run `survey_site`.

## 2. Work in stages — never skip, never decorate bad massing
1. **Massing**: volumes + roof shapes in 1–2 plain materials. For important builds try 2–3 options (`offset` them side by side) and pick one with reasons.
2. **Proportions**: elevations (`front/left/right/back` have block rulers) — fix heights, widths, roof pitch, hierarchy of volumes.
3. **Structure & openings**: walls, frame, roofs (`b.roof` with `parts` for wings/valleys), windows/doors with rhythm.
4. **Depth & materials**: ≥ 2–3 depth layers on every wall (frames proud at z=+1, recessed openings, sills, lintels, cornices, overhangs), gradients and clustered mixes, contrasting roof line-work, 15–30 % sub-block shapes.
5. **Interiors** (any enterable build): partitions with doors, stairs with floor openings, `lib.furnish` per room, then hand-placed focal pieces and clutter.
6. **Landscape**: foundation into the ground, paths to the door, custom trees, bushes/flowers in clusters, props.
7. **Review & apply** (below).

One responsibility per component, in compile order: `site → foundation → walls → frame → openings → roof → details → interior → landscape`. Use frames (`b.around` for facades, `b.at`, `b.symmetric`, `b.repeat`) — design a bay/window/tower once and place it many times. Shared style pieces go in `write_library`.

## 3. The look–critique–fix loop (the core of quality)
After every meaningful change: `render` (default sheet: overview, front, right, top; add `street` for eye level, `back`, `section_x=…`, `detail:x,y,z,r`). Then write a **numbered, located, actionable critique** before editing, e.g.
`1. [roof] ridge too high vs walls (ridge y=24, walls 9) — pitch [1,1,2] → [1,1,1]`
`2. [south facade] flat 9×5 stone area x 3..11 y 1..5 — pilasters at x 3,7,11 z=1 + floor band y=5`
Fix the 1–3 worst problems with `edit_component`, re-render, repeat. Budget: ~3 loops per stage; if the silhouette is still wrong after 2, go back to massing. Run the **craft checklist** (toolkit_reference craft §8) before calling a build done.

What experts do that beginners don't (from studying professional server maps — see craft §9):
- big variety (90–130 block types in a finished map), 15–30 % sub-block shapes
- contrasting outlines on every roof edge, hip and ridge; tiered/flared roofs; patterned roof planes
- weathering gradients rising from the base; dark plinth line
- horizontal layering on facades (base / main storey / attic, cornices, frieze bands), a projecting taller central element
- many props clustered at doors/corners; custom organic trees; one dominant landmark per scene

## 4. Interiors (do them properly)
- Plan rooms by use; every room gets a floor change, light, a focal piece, wall furniture, clutter and a clear path from the door. Ceilings ≥ 3 clear, beams every 3–4 blocks.
- In an `interior` component after walls/openings: partitions + doors, stairs + floor openings (+ railing), ceilings, then `log(lib.furnish(b, airMin, airMax, {type, style}).join("; "))` per room. Read the log: skipped pieces mean you should hand-place them or change the room.
- Verify: `render` views `cutaway_y=<floor+3>` (dollhouse) and `eye:x,y,z,yaw` (standing in the room), and `inspect kind:"interior"` per room → no dark cells, everything reachable from the door, density ~0.6–1.5.

## 5. Apply & verify in the world
`apply` (writes only the diff, keeps undo checkpoints) → `render source:"world"` to verify what Minecraft actually has → `export_schematic` for a `.schem`. Use `checkpoints` to roll back. `server action:"teleport"` puts a watching player in front of the build.

## 6. Running a team (for big builds)
For anything larger than a house, act as **lead architect** and delegate to subagents (Claude Code: the `mc-*` agents in `.claude/agents/`; other clients: the MCP prompts `facade_detailer`, `roofer`, `interior_designer`, `landscaper`, `critic`):
1. You: brief, palette, massing, split into components, publish anchors (`b.anchor`), post design intent in `notes`.
2. `tasks add` one task per specialist with role + component; spawn specialists in parallel, each told the project name and its task id. Specialists claim their component, work only there, post notes, set the task to `review`.
3. Run the `mc-critic` agent on the result; turn its findings into tasks; iterate.
4. Only you `apply`.

## 7. Learning from reference maps
`reference save:"<path to world folder>" action:"list"` → `render`/`stats`/`slice` on boxes (world coordinates). Use `stats` to learn palettes and shape ratios, `cutaway_y=` / `eye:` views for interiors. Extract principles; never copy someone else's build.

## Rules of thumb
- Coordinates: x east, y up, z south; boxes inclusive; facade frames: x along the wall from outside, z outward.
- Unknown block names fail with suggestions — use `block_search` when unsure (e.g. `iron_chain`, not `chain`).
- Keep scripts deterministic (use `rng`, `hash`, `noise`, never `Math.random`).
- Don't decorate to hide a weak silhouette. Don't leave flat walls > 5×5. Don't leave interiors empty or dark.
