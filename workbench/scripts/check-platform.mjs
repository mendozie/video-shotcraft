// Local platform integration checks; run with: node --test scripts/check-platform.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { videoRoot } from "./video-root.mjs";

const workbench = fileURLToPath(new URL("../", import.meta.url));

test("a fresh checkout generates a usable demo index on the current platform", () => {
  const result = spawnSync(process.execPath, ["scripts/gen-index.mjs"], {
    cwd: workbench,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  const index = readFileSync(
    new URL("../src/cards/demo-index.ts", import.meta.url),
    "utf8",
  );
  if (existsSync(path.join(workbench, "proj"))) {
    const expected = videoRoot(realpathSync(path.join(workbench, "proj")), workbench);
    const meta = readFileSync(path.join(workbench, "src/projMeta.ts"), "utf8");
    assert.ok(meta.includes(JSON.stringify(expected)), "Library metadata must use the video root");
  }
  assert.match(index, /SlowPushIn/);
  assert.doesNotMatch(index, /@demos\/[^"\r\n]*\\/);
});
