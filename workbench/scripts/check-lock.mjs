import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { acquireLauncherLock } from "./launcher-lock.mjs";

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
