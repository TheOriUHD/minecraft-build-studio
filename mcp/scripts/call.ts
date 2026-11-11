// Tiny MCP client for testing: npx tsx scripts/call.ts <tool> '<json args>' [outDir]
// Images are written to outDir (default ../runtime/tmp) and their paths printed.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import path from "node:path";

const [tool, json = "{}", outDir = path.resolve(import.meta.dirname, "../../runtime/tmp")] = process.argv.slice(2);
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [path.resolve(import.meta.dirname, "../node_modules/tsx/dist/cli.mjs"), path.resolve(import.meta.dirname, "../src/index.ts")],
  stderr: "inherit",
});
const client = new Client({ name: "cli", version: "0" });
await client.connect(transport);
if (tool === "--list") {
  const t = await client.listTools();
  for (const x of t.tools) console.log(`${x.name}: ${x.description?.slice(0, 100)}`);
} else {
  const args = json.startsWith("@") ? JSON.parse(fs.readFileSync(json.slice(1), "utf8")) : JSON.parse(json);
  const r: any = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 600000 });
  fs.mkdirSync(outDir, { recursive: true });
  let n = 0;
  for (const c of r.content) {
    if (c.type === "text") console.log(c.text);
    else if (c.type === "image") {
      const f = path.join(outDir, `${tool}-${Date.now()}-${n++}.png`);
      fs.writeFileSync(f, Buffer.from(c.data, "base64"));
      console.log(`[image] ${f}`);
    }
  }
  if (r.isError) process.exitCode = 1;
}
await client.close();
