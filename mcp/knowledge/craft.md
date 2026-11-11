# Building craft — what separates expert Minecraft builds from boxes

These are working rules used by experienced builders. Apply them deliberately and check each against the renders.

## 1. Silhouette and massing first
- A build reads from its silhouette before any texture. Judge massing with simple blocks before detailing.
- Break boxes up: main volume + secondary volumes (wings, towers, bay windows, porches, dormers, chimneys) of **clearly different sizes** (roughly 1 : 0.6 : 0.35). Equal-sized parts look indecisive.
- Vary heights. Roofs at different levels, a tower that breaks the roofline, a lower lean-to. Long unbroken ridgelines are dull — step them or add dormers/chimneys.
- Asymmetry for vernacular/organic styles; strict symmetry for classical/formal/religious ones. Never "almost symmetric".
- Use odd widths when something must be centred (door, gable peak, window column): 7, 9, 11, 13…

## 2. Proportions (block-scale)
- Storey height: 4–5 blocks floor-to-floor for houses (3 is cramped, 6+ looks like a warehouse). Grand halls 7–12.
- Player is ~2 blocks tall: doors 2 high (grand doors 3–4 with an arch), interior ceilings ≥ 3 clear.
- Windows: 1×2, 2×2, 2×3, 3×4 on big builds. Keep consistent sill heights per floor. Upper floors can have smaller windows (visual weight sits low).
- Wall-to-opening rhythm: solid piers between windows at least as wide as the windows on stone buildings.
- Roof height ≈ 0.5–1× wall height for medieval/rustic; steeper (pitch 1–2) in snowy/northern styles, shallow (0.5) in Mediterranean/modern.
- Towers: height ≥ 2.5× width to read as a tower. Spires: tall and steep (cone or pitch 2+).

## 3. Depth — the #1 difference between amateur and expert
Flat walls look like cardboard. Every wall plane needs at least **2–3 depth layers**:
- Frame proud of the wall: corner posts/pillars (logs, stripped logs, stone columns) at z=+1, horizontal beams at floor lines.
- Openings recessed: glass 1 block in on thick walls; sills (upside-down stairs) and lintels (slabs/stairs) proud.
- Overhangs: roofs overhang ≥1; upper storeys can jetty out 1 block over the ground floor (timber styles).
- Use stairs, slabs, walls, trapdoors, buttons, fences as **sub-block detail** for mouldings, cornices, brackets, shutters.
- Shadow lines: an upside-down stair row under a roof eave or floor band gives a strong horizontal line.

## 4. Materials and palettes
- 3–5 main materials + 1–2 accents. Assign roles: structure/frame, wall fill, roof, trim/accent, foundation.
- Contrast: dark frame on light wall or light trim on dark wall. Avoid similar mid-tones next to each other (spruce on oak, stone on andesite) unless intentional texture.
- Texture with **gradients and clustered mixes**, not 50/50 noise: weathered/mossy at the base, cleaner higher up; 70–85 % dominant block.
- Foundation/plinth in heavier, darker stone (cobblestone, stone bricks, deepslate, mud bricks), 1–3 blocks high, slightly wider or set apart in material.
- Good classic palettes:
  - Medieval timber: spruce/dark-oak logs frame, white/light wall (calcite, white terracotta, birch planks, smooth sandstone, mud/packed mud), cobble+stone brick base, dark oak or deepslate roof.
  - Nordic: spruce logs + planks, stone base, dark_oak/spruce roof, steep pitch.
  - Mediterranean: smooth sandstone/white terracotta/calcite walls, terracotta or granite-ish accents, shallow roofs (granite/brick/mud brick stairs), lots of greenery.
  - Gothic/castle: stone bricks + andesite + tuff/deepslate, dark roofs (deepslate tiles), pointed arches, buttresses.
  - Fantasy/elven: warm woods, moss, leaves, curves (`b.curve`), domes and conical caps.
  - Modern: concrete, quartz, glass, dark accent lines, flat roofs with parapet, cantilevers.

## 5. Roofs
- The roof is often 40–60 % of what you see. Give it overhang, a trim line, and break large planes with dormers, chimneys, cross gables.
- Use `b.roof({parts:[...]})` for L/T/cross plans — it produces proper valleys. Fill gable ends with wall material or timber pattern.
- Add a fascia/trim: a row of slabs or upside-down stairs of a contrasting material along the eaves.
- Ridge cap: slab or wall blocks along the ridge read well from far away.

## 6. Organic and terrain integration
- Builds must sit IN the landscape, not on it. Foundation follows the ground; terrace slopes; add retaining walls.
- Scatter: path that leads to the door, a few bushes, flowers in clusters, a tree that overlaps the silhouette, fence/wall pieces, barrels, crates.
- Paths: mixed blocks (dirt_path, coarse_dirt, gravel, packed_mud) with soft edges, never ruler-straight unless formal.
- Trees: custom trees (lib.tree) at 1–1.5× building height frame a build. Avoid lollipop spheres.
- Leave negative space: not every block needs detail; rest areas make the details read.

## 7. Interiors (if asked)
- Floors: change material per room, rugs (carpet), beams across ceilings.
- Furniture from stairs/slabs/trapdoors/fences; light with lanterns, candles; fill corners (barrels, plants).

## 8. Self-critique checklist (use with every render)
1. Silhouette interesting from all four sides and at street level?
2. Is there a clear focal point (entrance, tower) and hierarchy of volumes?
3. Any flat wall areas larger than ~5×5 without depth? Fix with frames, pillars, recesses, windows.
4. Window rhythm and alignment consistent? Door centred where intended?
5. Roof overhangs ≥1, trims present, roof not overwhelming or too flat?
6. Palette limited and contrasting? Gradients at the base?
7. Grounded: foundation, path, vegetation, no floating parts, no terrain gaps?
8. Errors: wrongly rotated stairs/logs, gaps, misaligned components, z-fighting materials, doors facing wrong way.
Write the critique as concrete numbered actions with coordinates before changing anything.

## 9. Lessons from studying professional server maps (lobby / minigame maps by an expert build team)
Measured on real maps with `reference` (render + material stats). These are principles, not things to copy.
- **Variety is high.** Finished maps use 90–130 different block types. Architecture-heavy maps place **15–30 % of all blocks as sub-block shapes** (stairs, slabs, walls, fences, trapdoors, buttons, levers, tripwire hooks, iron bars, chains). If your build has < 8 % shapes it will look blocky.
- **Colour first, texture second.** Experts pick blocks for colour as much as for "realism": roofs from yellow wool, red nether bricks or nether wart blocks; cliffs from cyan terracotta + gray concrete + andesite + clay, or smooth basalt + tuff + packed mud. Desaturated, cohesive rock palettes beat raw stone/dirt.
- **Outline the roof.** Every roof edge, hip and ridge gets a contrasting line (dark oak on yellow, quartz/bone on red, dark trim on light). Conical tower roofs carry vertical "ribs" of the contrasting material running down the cone. This line work is what makes roofs read crisply at distance.
- **Layered / tiered roofs.** Asian and fantasy roofs stack two or three eave tiers, each overhanging the one below, with up-turned tips at the corners and curved brackets (dark oak stairs/fences) under the eaves. Tower roofs flare out at the bottom (a "skirt" ring of shallow slope) before rising steeply.
- **Roof surface pattern.** Large roof planes are broken by regular rows of stairs/slabs set into full blocks (tile texture), not left as uniform stairs.
- **Weathering gradients run up from the ground.** Walls start warm/dirty (red sandstone, orange/terracotta, mossy, mud) and fade to the clean main colour within 3–6 blocks; dark plinth line at the very bottom.
- **Classical facades are layered horizontally**: heavy base, tall main storey, attic; a cornice band at every floor line; a carved frieze band (chiseled / patterned blocks, e.g. chiseled sandstone); a central pavilion that projects forward and rises above the wings with a mansard roof, pediment and paired columns; railings/balustrades on roof edges; statues in niches.
- **Openings are recessed and framed**: dark frame or reveal around doors, arched tops, door recessed 1 block, frame proud.
- **Fantasy castles**: many towers of different heights (focal tower tallest and central), slender needle spires topped with rods/flags, flags and banners sculpted from blocks in a wavy shape, pilasters on tower bodies, a band of corbels under each roof skirt.
- **Organic forms**: giant custom trees with trunks/branches built from logs + stairs + walls, leaves in layered clumps of 2–3 leaf types; lumpy/irregular pillars and rocks (never perfect cylinders); floating islands taper to a point with rock layers.
- **Atmosphere props everywhere**: crates, barrels, carts, sacks (wool/hay), lanterns, banners, vines, flower pots — clustered around doors, corners and along paths. Smoke from chimneys as a rising column of gray / light-gray stained glass blocks that drifts sideways and thins out.
- **Stylised elements**: water surfaces can be blue stained glass; clouds from white wool / snow / diorite blobs; stylised scenes beat realistic ones in readability.
- **Composition**: one dominant landmark per scene, framed by terrain on the sides (mountains, cliffs, trees) so the eye is led to it; paths curve and lead to entrances; plaza/courtyard in front of main buildings.

## 10. Interiors (what makes them feel lived-in)
- Plan rooms by use first (entry, living, kitchen, dining, bedroom, storage, study, workshop, tavern hall). Every room needs: **floor material change**, **light**, **a focal piece** (fireplace, bed, counter, table), **wall furniture**, **clutter**, **a clear walking path** from the door.
- Ceilings ≥ 3 clear blocks; exposed beams (logs across the ceiling every 3–4 blocks) and corner posts.
- Floors: planks with a different-wood border, or stone tiles; rugs (carpet patterns) under tables/beds — never wall-to-wall carpet.
- Walls: wainscot band (stairs/trapdoors/darker planks at y+0..1), shelves (trapdoors with pots/candles above), paintings/banners, windows with sills on the inside too.
- Light level: lantern/candles so no floor spot is dark (block light ≥ 8). Chandeliers (chains + lanterns) in tall rooms. Light sources are also decoration.
- Furniture from sub-blocks: table = fence/post + pressure plate or slab top; chairs = stairs (+ trapdoor arm rests); counters = barrels/smokers/trapdoor fronts with slabs on top; beds with nightstands (barrel/chiseled bookshelf + candle); fireplace = brick/stone surround + campfire + chimney.
- Keep 1-block-wide circulation paths and never block doors, stairs or windows with tall furniture.
- Check with `cutaway_y=<floor+3>` and `eye:` views, and `inspect kind:"interior"` (light/headroom/reachability).
