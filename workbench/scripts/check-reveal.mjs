import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { revealFile } from "./reveal-file.mjs";
test("missing reveal executable rejects without an uncaught process error", async () => {
  await assert.rejects(revealFile("video.mp4", () => spawn("Mendex-nonexistent-reveal-command", [], { windowsHide: true })), { code: "ENOENT" });
});
test("failed reveal exit is reported", async () => {
  await assert.rejects(revealFile("video.mp4", () => spawn(process.execPath, ["-e", "process.exit(3)"], { windowsHide: true })), /code 3/);
});
