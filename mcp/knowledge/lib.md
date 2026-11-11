# Built-in library (`lib.*`)

Facade functions take a facade frame `f` from `b.around(...)` (x along the wall seen from outside, y up, z outward; z=0 = wall plane).

| function | purpose |
|---|---|
| `lib.window(f, x, y, {w=1, h=2, glass="glass_pane", wall=1, inset, sill, lintel, shutters, frame, arch})` | carves the opening through `wall` blocks, puts glass at `-inset` (default 0 for 1-thick walls, 1 for thicker), optional sill (material → upside-down stairs at z=1), lintel block above, shutters (trapdoor id, open on the wall face), frame block around, arch style "round"/"pointed"/"segmental" |
| `lib.door(f, x, y, {wood="spruce", width=1|2, wall=1, frame, awning, step, inset})` | door(s) with both halves, carved wall, optional frame (posts + lintel at z=1), awning (stairs), step. Keep z=1 in front of the door free in later components. |
| `lib.column(b, base, h, {shaft, base, capital})` | column/pillar |
| `lib.timberFrame(f, width, height, {post, beam, spacing=4, floors:[ys], braces, z})` | timber framing posts/beams/braces on a facade |
| `lib.chimney(b, base, h, {material, cap, smoke})` | chimney stack (smoke = campfire inside top) |
| `lib.tree(b, base, {type:"oak"|"spruce"|"birch"|"dark_oak"|"cherry"|"jungle"|"acacia", height, radius, seed})` | organic custom tree with branches |
| `lib.bush(b, p, {leaves, r})` | leafy bush |
| `lib.lampPost(b, p, {h, post, lantern})` | lamp post |
| `lib.path(b, [[x,z],...], {width=3, material, follow=true})` | terrain-following path with clustered mixed materials |
| `lib.clearSite(b, [x0,z0], [x1,z1], {level=0, fill="dirt", clearHeight=12, margin, topsoil})` | flatten: clear above `level`, fill below to the terrain |
| `lib.stairs(b, p, steps, {material, width, support})` | straight flight going up toward +z |
| `lib.bed(b, p, {color, facing})`, `lib.table`, `lib.chair`, `lib.shelfWall(b, a, c)` | interior props |
| `lib.family(name)` | {block, stairs, slab, wall, fence} names for a material |

Project lib files (`write_library`) add more: `module.exports = { myBay(f, x, opts) { ... } }` → `lib.myBay(...)`.
Write reusable house-style modules there (window style, buttress, bay, dormer) so all components and agents share one vocabulary.

## Interiors
`lib.furnish(b, [x0,y0,z0], [x1,y1,z1], {type, style, seed, rug, lights, table, items})` furnishes one room.
- The box is the room's interior **air** volume: y0 = first air layer above the floor, y1 = last air layer under the ceiling.
- It reads walls, doors and windows built by earlier components (so put interiors in a component AFTER walls/openings),
  keeps door zones and stair openings clear, puts tall furniture only against solid wall and low variants under windows,
  adds a rug/table in the centre, hanging lights under the ceiling and corner clutter. Returns a list of what it placed
  (log it: `log(lib.furnish(...).join("; "))`).
- type: bedroom | kids | living | kitchen | dining | study | storage | workshop | tavern | hall
- style: rustic | medieval | nordic | noble | light | desert | fantasy | modern, or {wood, accent, stone, rug:[border,inner], bed, metal}
- items: explicit list of piece names instead of the type preset: `double_bed, bed, wardrobe, bookshelf, low_bookshelf, desk, fireplace, sofa, kitchen_counter, low_counter, storage, chests, workbench, bar, plant, table, rug`. Unknown names are reported in the result.
- Tall pieces (wardrobe, bookshelf, counter with wall shelf, fireplace) need solid wall behind them; under windows the low variant is used automatically. A double bed falls back to a single bed in narrow rooms. Rooms narrower than 4 get few pieces — hand-place there.

Single pieces (wall frame: x along the wall, z into the room, z=0 touches the wall):
`lib.furniture.bed(f,x,style,{w})`, `.wardrobe`, `.bookshelf(f,x,w,style,{h})`, `.desk`, `.counter(f,x,w,style)`, `.fireplace(f,x,style,ceilingY)`,
`.sofa(f,x,w,style)`, `.storage(f,x,w)`, `.workbench(f,x)`, `.bar(f,x,w,style)`, `.plant(f,x)`;
room-frame pieces: `.table(b,[x,y,z],w,d,style)`, `.rug(b,a,c,[border,inner])`, `.chandelier(b,[x,ceilY,z],drop,{lantern:"lantern"|"soul_lantern", arms:0|4|8, r:1, frame:"dark_oak_fence", candles})`. Styles: `lib.styles`.
Get wall frames with `b.at([x,y,z], {rotate})` (rotate 0: wall to the north, room toward +z).

Workflow for interiors: partitions + doors + stairs (with openings in the floor above) → `lib.furnish` per room → hand-place
focal pieces/clutter where it matters → `render` views `cutaway_y=<floor+3>` and `eye:x,y,z,yaw` → `inspect kind:"interior"`
per room (no dark cells, everything reachable from the door, density ~0.6–1.5).
