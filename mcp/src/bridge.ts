// HTTP client for the Paper bridge plugin.
const BASE = process.env.BUILDMCP_BRIDGE ?? "http://127.0.0.1:8765";
const TOKEN = process.env.BUILDMCP_BRIDGE_TOKEN ?? "";

export async function call<T = any>(path: string, body: any = {}, timeoutMs = 600_000): Promise<T> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(BASE + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(TOKEN ? { "X-Bridge-Token": TOKEN } : {}) },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const j: any = await r.json();
    if (!r.ok || j.error) throw new Error(`bridge ${path}: ${j.error ?? r.status}`);
    return j as T;
  } catch (e: any) {
    if (e.name === "AbortError") throw new Error(`bridge ${path} timed out`);
    if (e.cause?.code === "ECONNREFUSED") throw new Error(`Minecraft bridge not reachable at ${BASE} — is the Paper server running? (scripts/start-server.sh)`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

export async function available(): Promise<boolean> {
  try {
    await call("/status", {}, 2000);
    return true;
  } catch {
    return false;
  }
}

export interface RegionRead {
  min: [number, number, number];
  max: [number, number, number];
  palette: string[];
  rle: number[];
}

/** Read a cuboid and call fn for each block (x fastest, then z, then y). */
export async function readRegion(world: string, min: number[], max: number[], fn: (x: number, y: number, z: number, state: string) => void) {
  // split tall/large regions into chunks to stay under the plugin's limit
  const vol = (max[0] - min[0] + 1) * (max[1] - min[1] + 1) * (max[2] - min[2] + 1);
  const layers = Math.max(1, Math.floor(4_000_000 / ((max[0] - min[0] + 1) * (max[2] - min[2] + 1))));
  for (let y0 = min[1]; y0 <= max[1]; y0 += layers) {
    const y1 = Math.min(max[1], y0 + layers - 1);
    const r = await call<RegionRead>("/read", { world, min: [min[0], y0, min[2]], max: [max[0], y1, max[2]] });
    const W = max[0] - min[0] + 1, D = max[2] - min[2] + 1;
    let i = 0;
    for (let j = 0; j < r.rle.length; j += 2) {
      const s = r.palette[r.rle[j]];
      for (let c = 0; c < r.rle[j + 1]; c++, i++) {
        const x = min[0] + (i % W);
        const z = min[2] + (Math.floor(i / W) % D);
        const y = y0 + Math.floor(i / (W * D));
        fn(x, y, z, s);
      }
    }
  }
  void vol;
}
