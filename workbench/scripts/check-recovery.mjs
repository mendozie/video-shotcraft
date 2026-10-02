import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readAssetLedger } from "./asset-ledger.mjs";
import { recoverRenderJob } from "./render-state.mjs";
test("missing or corrupt asset ownership cannot silently expose previous project media", () => {
  const root = mkdtempSync(path.join(tmpdir(), "Mendex-video-ledger-"));
  mkdirSync(path.join(root, "public"));
  assert.deepEqual(readAssetLedger(root), {});
  writeFileSync(path.join(root, "public", "private.wav"), "previous project");
  assert.throws(() => readAssetLedger(root), /Unmanaged/);
  writeFileSync(path.join(root, ".project-assets.json"), "{truncated");
  assert.throws(() => readAssetLedger(root), /ledger/);
});
test("recover only a dead job snapshot owned by the recorded id within the tool staging root", () => {
  const root = mkdtempSync(path.join(tmpdir(), "Mendex-video-recovery-"));
  const stage = path.join(root, ".render-public", "render-test");
  mkdirSync(stage, { recursive: true });
  writeFileSync(
    path.join(stage, ".owner.json"),
    JSON.stringify({ id: "test" }),
  );
  const file = path.join(root, ".render-job.json");
  const job = { id: "test", pid: 2147483647, status: "running", stage };
  writeFileSync(file, JSON.stringify(job));
  assert.equal(recoverRenderJob(root)?.status, "error");
  assert.equal(existsSync(stage), false);
  const outside = path.join(root, "private-media");
  mkdirSync(outside);
  writeFileSync(
    path.join(outside, ".owner.json"),
    JSON.stringify({ id: "test" }),
  );
  writeFileSync(file, JSON.stringify({ ...job, stage: outside }));
  assert.throws(() => recoverRenderJob(root), /stage/);
  assert.equal(existsSync(outside), true);
  writeFileSync(
    file,
    JSON.stringify({ ...job, pid: process.pid, stage: outside }),
  );
  assert.equal(recoverRenderJob(root).status, "running");
  assert.equal(existsSync(outside), true);
});
