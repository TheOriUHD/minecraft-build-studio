# Builder API (component scripts)

A component is a plain JavaScript file (no imports) that runs top-to-bottom. Globals:

| name | what |
|---|---|
| `b` | root Builder at project-local [0,0,0] (+ component offset) |
| `lib` | built-in detail library (see topic `lib`) + functions from the project's `lib/*.js` |
| `palette` | the project palette object; use entries as `"$name"` in any block spec |
| `params` | this component's params (component_settings / write_component) |
| `rng` | seeded RNG: `rng()` 0..1, `rng.int(lo,hi)`, `rng.pick(arr)`, `rng.chance(p)` — deterministic per project+component |
| `terrain` | `terrain.height(x,z)` → local y of the top solid block (build at height+1); `terrain.surface(x,z)` → block id |
| `anchors` | named points published by earlier components: `anchors["main.door"]` → [x,y,z] |
| `hash(x,y,z,seed)` / `noise(x,y,z,scale,seed)` | position hash (0..1) / smooth value noise for clustered variation |
| `log(...)` | message shown in the tool result |

Coordinates: integers, `[x, y, z]`, **x = east, y = up, z = south** (north = −z). All boxes are inclusive: `fill([0,0,0],[4,0,4])` is 5×1×5.
The compile is deterministic: same code → same blocks. Later components overwrite earlier ones where they overlap; writing `"air"` carves.

## Block specs
Anywhere a block is expected you may pass:
- `"stone_bricks"`, `"oak_stairs[facing=north,half=top]"` (namespace optional; properties validated — unknown names error with suggestions)
- `"$wall"` – palette reference; `"$roof[facing=east]"` adds properties
- weighted mix `[["stone_bricks", 6], ["cracked_stone_bricks", 2], ["mossy_stone_bricks", 1]]` (per-block random, deterministic)
- `{ mix: [[...],[...]], scale: 3 }` – clustered (noise) mix, looks less like salt-and-pepper
- `{ gradient: ["cobblestone","stone_bricks","stone"], axis: "y", from: 0, to: 6, noise: 0.35 }` – material gradient (dirty base → clean top)
- `{ checker: ["white_concrete","black_concrete"], size: 1 }`
- function `p => p.ly < 2 ? "mossy_cobblestone" : "$wall"` (p has world x,y,z and local lx,ly,lz)

## Frames (the key to sane geometry)
Every builder has an origin and orientation. Child frames:
- `b.at([x,y,z], {rotate: 1, mirror: "x"})` – offset; rotate in quarter turns clockwise from above (or 90/180/270). **Block states rotate with the frame** (stairs, logs, doors, trapdoors, fences…).
- `b.around(a, c, (f, {side, width, height, index}) => {...}, sides?)` – runs your facade code on each wall of the box a..c.
  In a facade frame: **x runs left→right along the wall as seen from outside (0..width-1), y up from a.y, z points OUTWARD** (z=0 is the wall plane, z<0 inside, z=1 proud of the wall). `facing=south` = faces outward; `facing=north` = faces into the building.
- `b.symmetric("x", centerX, (f, side) => {...})` – draw once, mirrored copy across x=centerX (use .5 for even widths).
- `b.repeat(n, [dx,dy,dz], (f, i) => {...})` – arrays of bays, columns, windows.

Design a bay/window/tower once as a function `(f, opts) => {...}` and place it with frames.

### Rotations of child frames (`b.at(o, {rotate})`, quarter turns clockwise seen from above)
| rotate | local +x points | local +z points | typical use |
|---|---|---|---|
| 0 | east | south | room frame with the wall to the north (z toward the room) |
| 1 | south | west | wall on the east side, room toward −x |
| 2 | west | north | wall on the south side |
| 3 | north | east | wall on the west side, room toward +x |
`b.around` already gives you the four outward-facing facade frames.

## Drawing
```
b.set(p, block, {mask})            b.get(p) → state|undefined     b.unset(p)
b.fill(a, c, block, {hollow, mask})                 solid cuboid
b.box(a, c, block)                                   hollow shell
b.walls(a, c, block)                                 4 vertical sides only
b.edges(a, c, block)                                 12 edges (frames, posts)
b.clear(a, c?)                                       write air (carve)
b.replace(a, c, "stone|dirt", block)                 swap within box
b.line(a, c, block, {width})       b.path([p...], block, {closed, width})
b.curve([p...], block, {closed, width})              smooth Catmull-Rom (arches, branches, organic walls)
b.circle(center, r, block, {filled, axis:"y"|"x"|"z", thickness})
b.cylinder(base, r, h, block, {hollow, thickness, axis})
b.cone(base, r, h, block)           b.sphere(c, r, block, {hollow, half:"top"|"bottom"})
b.ellipsoid(c, [rx,ry,rz], block, {hollow, thickness, half})
b.polygon([[x,z],...], y0, y1, block, {hollow})      prism from a floor-plan polygon
b.arch(x0, x1, y0, height, block="air", {style:"round"|"pointed"|"segmental"|"flat", z:0, depth:1})  (in a facade frame: carves an arched opening)
b.each(a, c, p => ...)
b.anchor("door", [x,y,z])                            publish a point for later components
b.peek(p)                                            block here from this OR any earlier component (find walls/doors/windows)
b.paste("name.schem", at, {rotate, mirror, ignoreAir})
```
`mask`: `"empty"` (nothing set yet by this component), `"air"`, `"!air"`, `"stone_bricks|cobblestone"`, `"!glass"`, or `(state, p) => bool`.

## Roofs
```
b.roof({ a:[x0,z0], b:[x1,z1], y, type:"gable"|"hip"|"shed"|"flat", axis:"x"|"z",
         pitch: 1, overhang: 1, gableOverhang, material: "dark_oak" | {stairs,slab,block},
         gable: "$wall" | null, underside: block|null, ridge: "slab"|"block"|"none", lowSide })
b.roof({ parts: [{a,b,type,axis}, {a,b,type,axis}], y, ... })   // L/T/cross plans: heights merge → real valleys
```
- `trim: "dark_oak"` → contrasting outline on every eave and rake edge (the expert "line-work" look); `ridgeTrim: "stone_brick"` → ridge cap material; `texture: {material:"spruce", amount:0.25, scale:2.5}` → clustered second material so big planes aren't monotone. Use all three on any roof larger than ~8×8.
- `a,b` = wall footprint corners (x,z). `y` = first layer above the wall top (wallTop + 1).
- `axis` = ridge direction. `pitch`: rise per block of run — any value works (0.5 shallow slabs, 0.75, 1 = 45° stairs, 1.5, 2 steep, 3 very steep), or a list of rises per step from the eave inward (the first entries apply to the overhang cells): `[1,1,2,2,2]` = bell/steepening, `[2,2,1,1,0.5]` = gambrel.
- `overhang` cells extend past the walls (and drop by pitch). `gable` fills the triangular gable end walls.
- Stair corner shapes (hips/valleys) are computed automatically.
- Hip on a long rectangle → ridge along the long axis. Use `parts` for wings; a tower roof is usually a separate `cone` or steep hip.

## Automatic finishing (done for you)
- fences, walls, panes, iron bars connect to neighbours; stair corner shapes are computed (unless you set those props explicitly)
- doors / tall flowers get both halves (the upper half overwrites whatever is above — a warning tells you); `"red_bed[facing=south]"` gets foot + head; leaves become persistent
- placing in the world uses no physics (floating sand stays, water does not flow far)

## Materials helper
`lib.family("stone_brick")` → `{block:"stone_bricks", stairs:"stone_brick_stairs", slab:"stone_brick_slab", wall:"stone_brick_wall"}` (also for woods: `family("spruce").block = "spruce_planks"`).

## Example: a 2-storey house with a facade module
```js
const W = 13, D = 9, H = 9;            // odd width → centred door
b.fill([0,-1,0],[W-1,-1,D-1], "$foundation");
b.walls([0,0,0],[W-1,H-1,D-1], "$wall");
b.fill([1,0,1],[W-2,H-1,D-2], "air");    // keep interior clear
b.fill([0,4,0],[W-1,4,D-1], "$trim", {mask: (s,p)=>s!==undefined}); // floor band on walls only
b.around([0,0,0],[W-1,H-1,D-1], (f, {side, width}) => {
  for (const x of [0, width-1]) f.fill([x,0,1],[x,H-1,1], "$beam");     // corner posts proud of wall
  for (let x = 2; x < width-2; x += 3) {
    if (side === "south" && x === Math.floor(width/2)-1) continue;
    lib.window(f, x, 1, {h:2, sill:"spruce", shutters:"spruce_trapdoor"});
    lib.window(f, x, 5, {h:2, sill:"spruce"});
  }
  if (side === "south") lib.door(f, Math.floor(width/2), 0, {wood:"spruce", frame:"$beam", awning:"spruce"});
});
b.roof({a:[0,0], b:[W-1,D-1], y:H, type:"gable", axis:"x", material:"$roofmat" /* or "dark_oak" */, gable:"$wall", overhang:1});
b.anchor("door", [Math.floor(W/2), 0, D]);
```
(`material`, `sill`, `awning` etc. accept a base material name, `{stairs,slab,block}`, or a palette ref like `"$roofmat"` whose entry is a plain material name such as `"deepslate_tile"`.)

## Tool quick reference (MCP arguments)
- `create_project {name, brief?, palette?, front?, style?, world?, origin?, site_size?, template?}`
- `write_component {project, name, code, description?, position?: "end"|"before:<c>"|"after:<c>", params?, preview?: [views], agent?}`
- `edit_component {project, name, old, new, all?, preview?}` · `read_component {project, name}` · `component_settings {project, name, enabled?, move?, owner?, status?, offset?, delete?}`
- `render {project, views?, components?, hide?, frame?, context?: auto|world|none, source?: project|world, region?, separate?}`
- `inspect {project, kind: stats|slice|blocks|interior, axis?, at?, min?, max?, entry?}`
- `apply {project, label?}` · `checkpoints {project, restore?}` · `export_schematic {project}`
- Sections (`section_x=` / `section_z=`) show the cut open: you look into the cut blocks, so stairs/roofs can look like floating pieces — use `inspect kind:"slice"` for exact profiles.
