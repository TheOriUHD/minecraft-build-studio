// Extracts block models, blockstates and block textures from a Minecraft client jar.
// Usage: node scripts/extract-assets.ts <client.jar> <outDir>
import yauzl from "yauzl";
import fs from "node:fs";
import path from "node:path";

const [jar, out] = process.argv.slice(2);
if (!jar || !out) {
  console.error("usage: extract-assets.ts <client.jar> <outDir>");
  process.exit(1);
}
const wanted = [
  "assets/minecraft/blockstates/",
  "assets/minecraft/models/block/",
  "assets/minecraft/textures/block/",
  "assets/minecraft/textures/colormap/",
];
let n = 0;
yauzl.open(jar, { lazyEntries: true }, (err, zip) => {
  if (err) throw err;
  zip.readEntry();
  zip.on("entry", (e) => {
    const name: string = e.fileName;
    if (name.endsWith("/") || !wanted.some((w) => name.startsWith(w))) return zip.readEntry();
    const dest = path.join(out, name.replace("assets/minecraft/", ""));
    if (path.relative(out, dest).startsWith("..")) return zip.readEntry();
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    zip.openReadStream(e, (err2, rs) => {
      if (err2) throw err2;
      rs.pipe(fs.createWriteStream(dest)).on("finish", () => {
        n++;
        zip.readEntry();
      });
    });
  });
  zip.on("end", () => console.log(`extracted ${n} files to ${out}`));
});
