import { createHash } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readAssetLedger, digestAsset, copyAssetFiles } from "./asset-ledger.mjs";
import { recoverRenderJob, processIdentity } from "./render-state.mjs";
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
    JSON.stringify({ ...job, pid: process.pid, processIdentity: processIdentity(process.pid), stage: outside }),
  );
  assert.equal(recoverRenderJob(root).status, "running");
  assert.equal(existsSync(outside), true);
});

test("asset hashing matches SHA-256 across chunk boundaries and propagates missing files", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "Mendex-video-hash-"));
  const file = path.join(root, "media.bin");
  const bytes = Buffer.alloc(3 * 1024 * 1024 + 157);
  for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
  writeFileSync(file, bytes);
  assert.equal(await digestAsset(file), createHash("sha256").update(bytes).digest("hex"));
  writeFileSync(file, "");
  assert.equal(await digestAsset(file), createHash("sha256").digest("hex"));
  await assert.rejects(digestAsset(path.join(root, "missing.bin")), { code: "ENOENT" });
});
test("failed asset binding removes its partial copies and preserves the previous ledger and unrelated files", async () => {
 const root = mkdtempSync(path.join(tmpdir(), "Mendex-video-copy-rollback-"));
 const pub = path.join(root, "public"), source = path.join(root, "source.bin"), ledger = path.join(root, ".project-assets.json");
 mkdirSync(pub);
 writeFileSync(source, "source bytes");
 writeFileSync(ledger, "{}");
 writeFileSync(path.join(pub, "unrelated.bin"), "preserve");
 await assert.rejects(copyAssetFiles([["first.bin", source], ["missing.bin", path.join(root, "missing-source")]], pub, ledger));
 assert.equal(existsSync(path.join(pub, "first.bin")), false);
 assert.equal(existsSync(path.join(pub, "missing.bin")), false);
 assert.equal(readFileSync(ledger, "utf8"), "{}");
 assert.equal(readFileSync(path.join(pub, "unrelated.bin"), "utf8"), "preserve");
 const result = await copyAssetFiles([["first.bin", source]], pub, ledger);
 assert.deepEqual(JSON.parse(readFileSync(ledger, "utf8")), JSON.parse(JSON.stringify(result)));
 assert.equal(readFileSync(path.join(pub, "first.bin"), "utf8"), "source bytes");
});
test("prototype-like asset names remain owned and missing ownership is rejected", async () => {
 const root = mkdtempSync(path.join(tmpdir(), "Mendex-video-ledger-names-"));
 const pub = path.join(root, "public"), source = path.join(root, "source.bin"), file = path.join(root, ".project-assets.json");
 mkdirSync(pub);
 writeFileSync(source, "owned bytes");
 await copyAssetFiles([["__proto__", source], ["constructor", source]], pub, file);
 const saved = JSON.parse(readFileSync(file, "utf8"));
 assert.equal(Object.hasOwn(saved, "__proto__"), true);
 assert.equal(Object.hasOwn(saved, "constructor"), true);
 assert.equal(Object.keys(readAssetLedger(root)).length, 2);
 writeFileSync(file, "{}");
 assert.throws(() => readAssetLedger(root), /Unmanaged/);
});
test("a reused live PID does not keep an interrupted render active", () => {
 const root = mkdtempSync(path.join(tmpdir(), "Mendex-video-pid-reuse-"));
 const stage = path.join(root, ".render-public", "render-owned");
 mkdirSync(stage, {recursive:true});
 writeFileSync(path.join(stage, ".owner.json"), JSON.stringify({id:"owned"}));
 assert.ok(processIdentity(process.pid));
 writeFileSync(path.join(root, ".render-job.json"), JSON.stringify({id:"owned",pid:process.pid,processIdentity:"different-process-start",status:"running",stage}));
 assert.equal(recoverRenderJob(root).status, "error");
 assert.equal(existsSync(stage), false);
 process.kill(process.pid, 0); // Recovery must not signal or stop the unrelated process.
});