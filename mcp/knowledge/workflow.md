# Workflow — building like an expert team

Tools: create_project → write_component / edit_component → render / inspect → apply → checkpoints. Everything is code; every change is re-rendered and reviewed.

## Stages (do not skip; detail never fixes bad massing)
1. **Brief & site.** Restate the brief as concrete targets: footprint, storeys, style, palette roles, focal point, how it meets the terrain. `survey_site` on real terrain. Set the palette with `update_project`.
2. **Massing (2–3 options).** Simple blocks only (one or two materials), whole volumes incl. roof shapes. If exploring options, write them as separate components (`massing_a`, `massing_b`) with `offset`s side by side, or disable/enable them; render `overview`, `front`, `street`. Choose one and say why.
3. **Proportions.** Adjust heights, widths, roof pitch, volume hierarchy. Render elevations (front/left/right/back) — the rulers show exact coordinates.
4. **Structure & openings.** Roof with overhangs and gables, windows/doors with rhythm, frames, pillars, floor bands. Put each major element in its own component (`walls`, `frame`, `roof`, `tower`, `openings`).
5. **Materials & depth.** Palette refinement, gradients, sub-block details (stairs, slabs, trapdoors, walls, fences), trims, chimneys, dormers.
6. **Interiors (if the build can be entered).** Partitions, doors, stairs with floor openings, then `lib.furnish` per room in an `interior` component placed after walls/openings. Check with `cutaway_y=`, `eye:` views and `inspect kind:"interior"`.
7. **Landscape & grounding.** Foundation into the terrain, paths, trees, bushes, fences, props; `lib.clearSite` if the ground is uneven.
8. **Review.** Render all sides + street + top. Run the craft checklist. Fix the 3 worst issues first. Then `apply` and render with `source:"world"` to verify the real placement.

Revision budget: max ~3 review loops per stage. If after 2 loops the silhouette still looks wrong, go back to massing instead of decorating.

## Player checks (every stage)
`qa` (fix all errors) and `walkthrough` (look at every view as a player) after each stage. Buildings must be enterable, windows sit in wall openings, nothing floats unattached. See SKILL §3b.

## Critique format
After each render write a short numbered list:
`1. [roof] east gable overhang missing — gableOverhang:1 in roof component`
`2. [walls] south facade 15×6 flat stone area at x 3..17 — add pillars at x 6, 12 (z=1) and a floor band at y=5`
Concrete, located, actionable. "Add more detail" is not a critique.

## Component conventions
- Order matters (later overwrites earlier). Typical order: `site` → `foundation` → `massing`/`walls` → `frame` → `openings` → `roof` → `details` → `interior` → `landscape`.
- One responsibility per component; keep each < ~150 lines. Put shared helpers (a window style, a bay module) into `write_library` so the whole team uses the same vocabulary.
- Use project-local coordinates; publish key points with `b.anchor("door", [...])` so others can attach (e.g. the landscaper draws a path to `anchors["walls.door"]`).
- Prefer parameters (`params`) and named constants at the top of a script for anything you might tweak (widths, heights, pitch).

## Working as a team (several agents on one project)
- Lead/architect: writes the brief, palette, massing, creates `tasks` with roles and components, reviews and integrates.
- Specialists claim a component (`component_settings owner=<you>`) or a task (`tasks claim`), work only in their components, post decisions and hand-offs to `notes`, set task status to `review` when done.
- Critic: renders, writes concrete critiques as tasks, never edits others' components directly.
- Only one agent should `apply` at a time (usually the lead) — the world is shared.
- Before editing, re-read `project_overview` and `notes` to see what changed.

## Learning from reference builds
`reference` reads any world save (e.g. downloaded maps): `action:list` to find what is in it, then `render`/`stats`/`slice` on boxes. Study proportions, palettes (stats!), roof line-work, facade layering and interiors, then apply the principles — never copy builds.

## Seeing well
- Interiors: `cutaway_y=<floor+3>` (dollhouse view), `eye:x,y,z,yaw` (stand in a room), `inspect kind:"interior"`.
- `overview` for the whole picture, `front/left/right/back` elevations for proportions and alignment (orthographic, with rulers), `street` for the human-eye impression, `top` for footprint/roof layout, `plan_y=<y>` for floors/interiors, `section_x=`/`section_z=` to see wall thickness and roof profile, `detail:x,y,z,r` for close-ups.
- Isolate parts: `render(components:["roof"])` or `hide:["landscape"]`.
- `inspect kind:"slice"` gives an exact ASCII layer when you need precise coordinates.
