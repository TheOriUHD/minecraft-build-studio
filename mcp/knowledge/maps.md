# Maps, landscapes and lobbies

Large builds (server lobbies, minigame maps, scenic islands, towns) are **compositions**: terrain + a few hero buildings + structured functional areas + organic filler. Plan them like a level designer, build them like a builder.

Create map projects with `create_project {world: "<new name>", world_type: "void", site_size: [200, 200]}`. Name terrain-like components `terrain`, `island…`, `satellite…`, `vegetation`, `props`, `boundary` — renders frame on the buildings by default and ignore those (pass `frame` to choose).

## 1. Plan the map before any block
Write a short map plan (post it to `notes`):
- **Footprint & boundary**: overall size (lobby 120–250 blocks across; small minigame arena 60–120), shape (island, floating islands, valley ringed by mountains, walled city), and how the edge is closed (sea, cliffs, void with rocky undersides, mountain ring, wall). Players must never see an unfinished edge.
- **Spawn**: where players appear and what they see first (the camera points at the **hero landmark**). Spawn is a clear, readable, usually symmetric plaza.
- **Zones**: list areas by function — spawn plaza, game portals/NPC area, shop/info, parkour, scenic viewpoints, secret corners; or for minigames: team bases, mid, lanes, objectives.
- **Circulation**: main axes and paths connecting zones (wide, readable), secondary paths (narrow, organic). Every zone reachable, sightlines from spawn to each portal/objective.
- **Hierarchy**: one hero landmark (tallest, most detailed: castle, temple, tree, tower), 2–4 secondary landmarks, the rest filler. Don't make everything equally important.
- **Theme & palette** for terrain AND architecture together (a stylised terrain palette + 3–5 building materials + accents).

## 2. Symmetry — when and how much
- **Use strict symmetry** for: spawn plazas, portal/NPC arrangements, formal gardens, the hero building's main facade, and **competitive minigame layouts** (PvP/team maps must be fair: 2 teams → point/rotational symmetry `b.radial(2, cx, cz)`; 4 teams → `b.radial(4, …)`; mirror (`b.symmetric`) only when sides are mirrored by design).
- **Use organic asymmetry** for: terrain, coastlines, forests, villages, paths between zones, decoration scatter.
- **Healthy mix**: a symmetric core (spawn + main axis) embedded in organic terrain; symmetric buildings placed along organic paths; symmetric layout with varied details (different props per quadrant, different trees) so it doesn't feel copy-pasted.
- Tools: `b.symmetric(axis, c, fn)`, `b.mirror4(cx, cz, fn)`, `b.radial(2|4, cx, cz, fn)`, `b.polar(center, r, n, fn)` (rings of lamps, pillars, portals), `b.repeat`.

## 3. Terrain workflow (lib.heightmap)
```js
const hm = lib.heightmap(-80, -80, 161, 161, 6)      // x0, z0, width, depth, base height
  .noise({amp: 6, scale: 40, seed: 3})                 // rolling relief
  .noise({amp: 14, scale: 22, ridged: true, seed: 9})  // mountain ridges (optional)
  .island({radius: [70, 64], sea: -8, coast: 0.4})     // organic coastline
  .hill([40, -35], 26, 22)                             // a mountain for the hero landmark
  .flattenCircle([0, 0], 18, 6, 6)                     // spawn plaza pad
  .flatten([30, -45], [52, -25], 14, 5)                // building pad
  .carve([[-70, 10], [-30, 5], [0, 30], [60, 50]], {width: 6, level: -2}) // river
  .smooth(1);
hm.build(b, {palette: "stylized_rock", water: 0, depth: 3, snowLine: 34});
shared.hm = hm;   // later components: const hm = shared.hm (components compile in order)
```
- Palettes: `temperate`, `stylized_rock` (cyan terracotta / concrete cliffs like pro maps), `volcanic`, `desert`, `snowy`, or your own `{grass, dirt, cliff, stone, sand, seabed, snow, underside, path}`.
- Floating islands / void maps: create the project with `world_type:"void"`, use `.island({radius, sea: -6, falloff: 0.3})` and `build(b, {floating: true, cutoff: -2, undersideDepth: 24})` — the coast slopes down gently and the rock hangs below in a noisy taper. Several islands: one heightmap per island (or several `.island` masks combined with `each`), connect them with `lib.bridge`.
- `hm.isLand(x, z)` tells you whether a column is land (after build) — use it to place things only on the island.
- Cliffs appear automatically where the slope ≥ `cliffSlope` (default 2) and use the cliff palette; use `.terrace(4)` for stylised stepped cliffs, `.hill` with negative height for basins/lakes.
- Build terrain in its own component FIRST (`terrain`), put buildings on pads you flattened, then `landscape`/`vegetation` components last.
- Paths: `lib.path(b, points, {width, material})` follows `terrain.height` of the *world*; on a sculpted map draw paths yourself: `for` each point set `[x, hm.at(x,z), z]` to the path palette (`lib.terrainPalettes.temperate.path`), or carve a shallow channel first.

## 4. Vegetation & props at scale
`lib.scatter(b, hm, [x0,z0], [x1,z1], {kinds: [["tree:oak",3],["tree:birch",1],["bush",3],["rock",1],["flowers",3],["grass",6]], minDist: 4, avoid: (x,z)=>…, water: 0})`
- Forest = several scatter passes: big trees sparse (minDist 7–10), small trees/bushes medium, grass/flowers dense. Vary types per zone (birch grove, spruce slopes, cherry around the temple).
- **avoid** paths, plazas and building pads (write a small function using distances or rectangles). Keep sightlines from spawn open.
- `lib.rock(b, p, {r})` for boulders; cluster 2–3 of different sizes at cliff feet and path edges.
- Props cluster: lanterns along paths every 6–10 blocks, benches, crates/barrels at buildings, banners at portals.

## 5. Lobby building blocks
| piece | use |
|---|---|
| `lib.spawnPad(b, [x,y,z], {size, height, material, trim})` | raised symmetric spawn platform, stairs on 4 sides, corner lanterns |
| `lib.plaza(b, [x,y,z], r, {floor, ring, accent, pattern:"rings"/"compass"/"tiles"})` | circular patterned paving |
| `lib.fountain(b, [x,y,z], {r, rim, tiers})` | tiered fountain (centre of plazas / axes) |
| `lib.portal(f, x, y, {w, h, frame, trim, inner, color, glow, pad})` | game portal/gate in a facade frame (`b.at(..., {rotate})` / `b.polar`) — inner `nether_portal`, `end_gateway` or coloured glass; `glow: true` puts a light panel behind glass so it reads; `pad` adds a floor pad |
| `lib.bridge(b, a, c, {width, arch, lamps})` | bridges over rivers/gaps |
| `lib.statue(b, p, {h, material, cap})` | pedestals/obelisks marking axes and portals |
| `lib.wall(b, points, y or (x,z)=>y, {h, towers})` | map borders, city walls with towers |
| `lib.floatingIsland(b, [x,y,z], r, {palette, seed, height, depth, flat})` | complete small floating island (organic outline, grass top, rocky taper below) in one call; returns its heightmap (`.at(x,z)`, `.isLand`) — top surface ≈ y, `flat` = radius of a flat area in the middle |

Typical lobby: spawn pad in a plaza on the main axis → fountain/statue on the axis → portals arranged symmetrically around the plaza (`b.polar` or `b.radial(4)`) each with its own colour/banner theme → hero building at the end of the main axis on raised terrain → organic island terrain, forests, rivers, viewpoints around it → closed boundary (sea/cliffs/void undersides).

## 6. Minigame map rules
- Readability first: clear lanes, landmarks to orient, colour-coded team areas (team colour wool/concrete/glass accents, banners).
- Fairness: rotational symmetry for team maps; identical gameplay geometry per team, decoration can vary slightly.
- Cover and verticality every 8–15 blocks along lanes; no unreachable decoration that blocks movement; keep playable areas flat enough to walk (slope ≤ 1 per block).
- Spawn protection: spawns enclosed on 3 sides, facing the action.

## 6b. SkyWars / island minigame maps (the classic layout)
- **Layout**: 8 (or 4, 12) **player islands** evenly on a ring around a bigger **mid island**, generated with rotational symmetry (`b.radial(4, …)` twice offset by 45° via `b.polar`, or `b.polar(center, r, 8, …)` so every island is identical in gameplay and turned to face the middle). Ring radius 35–55, gap between neighbouring islands 15–25 blocks (bridgeable), mid island 2–4× the size of a player island, optionally 2–4 **satellite islands** between ring and mid for extra loot.
- **Player island** (~15–25 blocks across): `lib.floatingIsland` or a small heightmap with a tapered underside; a flat **spawn point** near the outer edge facing the middle; 2–3 **chests** (one in the hut, one outside); one small themed **structure** that is **enterable** (door/opening at ground level, 2-high, no step > 1) or an open pavilion — never a sealed box; a tree or rocks for cover; some vertical variety.
- **Mid island**: the landmark (ruin, tower, temple) with 4–8 chests reachable from all sides, symmetric approach points, cover, a high point.
- **Theme** each map (sky villages, ruined kingdoms, ice, desert…), vary decoration per island slightly but keep geometry identical.
- **Checks**: `qa` + `walkthrough {components:["island_…"], from: spawnPoint}` on one player island and the mid island; make sure the spawn view sees the mid island; nothing blocks spawn; no glass/blocks floating unattached; chests reachable.
- Build ONE player island as a reusable function in `write_library` (e.g. `lib.playerIsland(b, i)`), then place it with `b.polar` — fixes then apply to all islands at once.

## 7. Seeing big maps
- `render` views `top` (whole map plan with rulers), `overview`, `iso_ne/nw/se/sw`, plus `cam:` cameras from the spawn point toward each zone and `eye:` at spawn (what players see first).
- Frame a zone: `render {region: {min, max}}` or `frame: ["portals"]`.
- Big maps compile/render in seconds; keep terrain as a shell (default) so block counts stay low; `inspect stats` to watch counts.
