import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync, readlinkSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const wb = fileURLToPath(new URL("../", import.meta.url));
test("occupied foreign TCP port fails before changing the project binding", async () => {
  const fixture = path.resolve(wb, "../out/qa/Mendex launcher space");
  mkdirSync(path.join(fixture, "src"), { recursive: true });
  writeFileSync(
    path.join(fixture, "src/workbench.ts"),
    "export const manifest = null;",
  );
  const binding = () =>
    existsSync(path.join(wb, "proj"))
      ? readlinkSync(path.join(wb, "proj"))
      : null;
  const before = binding();
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const result = await new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [
          "scripts/open.mjs",
          fixture,
          "--no-open",
          "--port",
          String(server.address().port),
        ],
        { cwd: wb, windowsHide: true },
      );
      let output = "";
      child.stdout.on("data", (c) => (output += c));
      child.stderr.on("data", (c) => (output += c));
      child.on("close", (code) => resolve({ code, output }));
    });
    assert.notEqual(result.code, 0);
    assert.match(result.output, /port .*occupied/i);
    assert.equal(binding(), before);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
