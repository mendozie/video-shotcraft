import { spawnSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { acquireLauncherLock, readServerState, writeServerState } from "./launcher-lock.mjs";

test("an exclusive launcher lease rejects a second binder until release", () => {
  const root = mkdtempSync(path.join(tmpdir(), "Mendex-video-lock-"));
  const release = acquireLauncherLock(root);
  assert.throws(() => acquireLauncherLock(root), /already updating/);
  release();
  const next = acquireLauncherLock(root);
  release(); // Old owner cannot remove the new lease.
  assert.throws(() => acquireLauncherLock(root), /already updating/);
  next();
});

test("server state refuses malformed ownership and round-trips a complete record", () => {
 const root = mkdtempSync(path.join(tmpdir(), "Mendex-video-server-state-"));
 const file = path.join(root, ".dev-state.json");
 assert.equal(readServerState(file), null);
 writeFileSync(file, "{");
 assert.throws(() => readServerState(file), /state/);
 writeFileSync(file, JSON.stringify({pid:12,port:999999,projectRoot:root}));
 assert.throws(() => readServerState(file), /state/);
 const state = {pid:process.pid,port:5198,projectRoot:root};
 writeServerState(file, state);
 assert.deepEqual(readServerState(file), state);
});
test("launcher refuses a corrupt ownership record before binding", () => {
 const root = mkdtempSync(path.join(tmpdir(), "Mendex-video-corrupt-server-"));
 mkdirSync(path.join(root, "scripts"));
 mkdirSync(path.join(root, "node_modules/vite/bin"), {recursive:true});
 writeFileSync(path.join(root, "node_modules/vite/bin/vite.js"), "");
 for (const name of ["open.mjs", "video-root.mjs", "launcher-lock.mjs", "asset-ledger.mjs", "render-state.mjs"])
   copyFileSync(new URL(name, import.meta.url), path.join(root, "scripts", name));
 writeFileSync(path.join(root, ".dev-state.json"), "{truncated");
 const result = spawnSync(process.execPath, [path.join(root, "scripts/open.mjs"), "--stop"], {encoding:"utf8",windowsHide:true});
 assert.notEqual(result.status, 0);
 assert.match(result.stderr, /Unreadable server ownership state/);
});