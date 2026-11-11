// Computes neighbour-dependent block properties (fence/wall/pane connections, stair corner shapes)
// so builds look right both in renders and in-world, where blocks are placed without physics updates.
import { assets } from "./assets.ts";
import { formatState, parseState, PALETTE } from "./state.ts";
import { VoxelGrid } from "../voxel.ts";

const DIRS: [string, number, number][] = [
  ["north", 0, -1],
  ["east", 1, 0],
  ["south", 0, 1],
  ["west", -1, 0],
];

const isFence = (n: string) => n.endsWith("_fence") && !n.endsWith("_fence_gate");
const isGate = (n: string) => n.endsWith("_fence_gate");
const isWall = (n: string) => n.endsWith("_wall") && !n.includes("wall_") && n !== "wall_torch";
const isPane = (n: string) => n.endsWith("_pane") || n === "iron_bars" || n.endsWith("_bars");
const isStairs = (n: string) => n.endsWith("_stairs");

type Lookup = (x: number, y: number, z: number) => string | undefined;

/**
 * Updates connection properties in-place for every block in `grid`. `lookup` resolves neighbours
 * (should consult the grid first, then the surrounding world context).
 * Only properties the author did not set explicitly are computed; `explicit` lists ids that should be left alone.
 */
export function autoConnect(grid: VoxelGrid, lookup: Lookup, explicit?: Set<number>) {
  const db = assets();
  const updates: [number, number, number, string][] = [];
  for (const [x, y, z, id] of grid.entries()) {
    if (id === 0 || explicit?.has(id)) continue;
    const s = PALETTE.get(id);
    const st = parseState(s);
    const n = st.name;
    if (!(isFence(n) || isWall(n) || isPane(n) || isStairs(n))) continue;
    const props = { ...st.props };
    if (isStairs(n)) {
      if (props.shape) continue;
      props.shape = stairShape(x, y, z, props.facing ?? "north", props.half ?? "bottom", lookup);
    } else {
      const hasAny = DIRS.some(([d]) => d in st.props);
      if (hasAny) continue;
      for (const [d, dx, dz] of DIRS) {
        const ns = lookup(x + dx, y, z + dz);
        const nn = ns ? parseState(ns).name : "air";
        let c = false;
        if (isFence(n)) c = (isFence(nn) && woodish(nn) === woodish(n)) || isGate(nn) || (ns ? db.isFullOpaque(nn) : false);
        else if (isPane(n)) c = isPane(nn) || isWall(nn) || (ns ? db.isFullOpaque(nn) : false);
        else if (isWall(n)) c = isWall(nn) || isPane(nn) || isGate(nn) || (ns ? db.isFullOpaque(nn) : false);
        if (isWall(n)) {
          // tall if the block above is solid/wall
          const above = lookup(x, y + 1, z);
          const an = above ? parseState(above).name : "air";
          props[d] = c ? (above && (db.isFullOpaque(an) || isWall(an)) ? "tall" : "low") : "none";
        } else props[d] = c ? "true" : "false";
      }
      if (isWall(n)) {
        const ns = props.north !== "none", ss = props.south !== "none", es = props.east !== "none", ws = props.west !== "none";
        const straight = (ns && ss && !es && !ws) || (es && ws && !ns && !ss);
        const above = lookup(x, y + 1, z);
        props.up = straight && !(above && parseState(above).name !== "air") ? "false" : "true";
      }
    }
    updates.push([x, y, z, formatState({ name: n, props })]);
  }
  for (const [x, y, z, s] of updates) grid.set(x, y, z, s);
}

function woodish(n: string) {
  return n === "nether_brick_fence" ? "nether" : "wood";
}

const LEFT_OF: Record<string, string> = { north: "west", west: "south", south: "east", east: "north" };
const RIGHT_OF: Record<string, string> = { north: "east", east: "south", south: "west", west: "north" };
const OPP: Record<string, string> = { north: "south", south: "north", east: "west", west: "east" };
const VEC: Record<string, [number, number]> = { north: [0, -1], south: [0, 1], east: [1, 0], west: [-1, 0] };

function stairShape(x: number, y: number, z: number, facing: string, half: string, lookup: Lookup): string {
  const get = (d: string) => {
    const [dx, dz] = VEC[d];
    const s = lookup(x + dx, y, z + dz);
    if (!s) return null;
    const st = parseState(s);
    if (!isStairs(st.name) || (st.props.half ?? "bottom") !== half) return null;
    return st.props.facing ?? "north";
  };
  // Vanilla logic: neighbour in front (facing direction) → outer; behind → inner.
  const front = get(facing);
  if (front && front !== facing && front !== OPP[facing]) {
    // check it's not continuing sideways stairs
    const side = front;
    const sideNeighbour = get(OPP[side]);
    if (sideNeighbour !== facing) return side === LEFT_OF[facing] ? "outer_left" : "outer_right";
  }
  const back = get(OPP[facing]);
  if (back && back !== facing && back !== OPP[facing]) {
    const side = back;
    const sideNeighbour = get(side);
    if (sideNeighbour !== facing) return side === LEFT_OF[facing] ? "inner_left" : "inner_right";
  }
  return "straight";
}
export { RIGHT_OF };
