// Rotating / mirroring block states so that a component designed in one orientation
// can be placed in any other. Rotation is clockwise when viewed from above, in 90° steps.
import { BlockState, formatState, parseState } from "./state.ts";

export type Dir = "north" | "east" | "south" | "west";
const CW: Dir[] = ["north", "east", "south", "west"];
export const DIR_VEC: Record<string, [number, number, number]> = {
  north: [0, 0, -1],
  south: [0, 0, 1],
  east: [1, 0, 0],
  west: [-1, 0, 0],
  up: [0, 1, 0],
  down: [0, -1, 0],
};

/** A frame transform: first mirror (in local axes), then rotate (quarter turns cw). */
export interface Orient {
  rot: number; // 0..3
  mirrorX: boolean; // x -> -x
  mirrorZ: boolean; // z -> -z
}
export const IDENTITY: Orient = { rot: 0, mirrorX: false, mirrorZ: false };

export function rotDir(d: string, o: Orient): string {
  let dd = d;
  if (o.mirrorX && (dd === "east" || dd === "west")) dd = dd === "east" ? "west" : "east";
  if (o.mirrorZ && (dd === "north" || dd === "south")) dd = dd === "north" ? "south" : "north";
  const i = CW.indexOf(dd as Dir);
  if (i < 0) return dd; // up/down
  return CW[(i + o.rot) % 4];
}

const isMirror = (o: Orient) => o.mirrorX !== o.mirrorZ;

/** Transform a vector (x,z part) by mirror then rotation. */
export function rotVec(x: number, y: number, z: number, o: Orient): [number, number, number] {
  if (o.mirrorX) x = -x;
  if (o.mirrorZ) z = -z;
  for (let i = 0; i < o.rot; i++) {
    const nx = -z;
    z = x;
    x = nx;
  }
  return [x + 0, y, z + 0];
}

/** Compose: apply `inner` first then `outer`. */
export function compose(outer: Orient, inner: Orient): Orient {
  // Represent each as a 2x2 integer matrix acting on (x,z).
  const m = (o: Orient) => {
    const a = rotVec(1, 0, 0, o);
    const b = rotVec(0, 0, 1, o);
    return [a[0], b[0], a[2], b[2]]; // columns
  };
  const A = m(outer), B = m(inner);
  // C = A*B
  const C = [
    A[0] * B[0] + A[1] * B[2],
    A[0] * B[1] + A[1] * B[3],
    A[2] * B[0] + A[3] * B[2],
    A[2] * B[1] + A[3] * B[3],
  ];
  // Find matching orient.
  for (let rot = 0; rot < 4; rot++)
    for (const mx of [false, true]) {
      const o: Orient = { rot, mirrorX: mx, mirrorZ: false };
      const M = m(o);
      if (M.every((v, i) => v === C[i])) return o;
    }
  throw new Error("compose failed");
}

const ROTATION16_STEP = 4; // 16-step rotation (signs, banners, skulls): 4 steps = 90°

export function transformState(state: string, o: Orient): string {
  if (o.rot === 0 && !o.mirrorX && !o.mirrorZ) return state;
  const st = parseState(state);
  const p = st.props;
  if (!Object.keys(p).length) return state;
  const np: Record<string, string> = { ...p };

  if (p.facing) np.facing = rotDir(p.facing, o);
  if (p.horizontal_facing) np.horizontal_facing = rotDir(p.horizontal_facing, o);
  if (p.axis && (p.axis === "x" || p.axis === "z") && o.rot % 2 === 1) np.axis = p.axis === "x" ? "z" : "x";
  if (p.rotation !== undefined && /^\d+$/.test(p.rotation)) {
    let r = parseInt(p.rotation, 10);
    // 0 = south, increasing clockwise (viewed from above)
    if (o.mirrorX) r = (16 - r) % 16;
    if (o.mirrorZ) r = (8 - r + 16) % 16;
    r = (r + o.rot * ROTATION16_STEP) % 16;
    np.rotation = String(r);
  }
  // Connection-style properties keyed by direction.
  const dirKeys = ["north", "east", "south", "west"].filter((k) => k in p);
  if (dirKeys.length) {
    for (const k of ["north", "east", "south", "west"]) delete np[k];
    for (const k of dirKeys) np[rotDir(k, o)] = p[k];
  }
  if (isMirror(o)) {
    if (p.shape) {
      const swap: Record<string, string> = {
        inner_left: "inner_right",
        inner_right: "inner_left",
        outer_left: "outer_right",
        outer_right: "outer_left",
      };
      if (swap[p.shape]) np.shape = swap[p.shape];
    }
    if (p.hinge) np.hinge = p.hinge === "left" ? "right" : "left";
    if (p.type === "left" || p.type === "right") np.type = p.type === "left" ? "right" : "left";
  }
  // Rails
  if (p.shape && p.shape.includes("_") && /^(north|south|east|west|ascending)/.test(p.shape)) {
    np.shape = transformRailShape(p.shape, o);
  }
  return formatState({ name: st.name, props: np } as BlockState);
}

function transformRailShape(shape: string, o: Orient): string {
  if (shape.startsWith("ascending_")) return "ascending_" + rotDir(shape.slice(10), o);
  const parts = shape.split("_").map((d) => rotDir(d, o));
  const order = ["north", "south", "east", "west"];
  if (parts[0] === "north" || parts[0] === "south") {
    if (parts[1] === "north" || parts[1] === "south") return "north_south";
  }
  if ((parts[0] === "east" || parts[0] === "west") && (parts[1] === "east" || parts[1] === "west")) return "east_west";
  parts.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return parts.join("_");
}
