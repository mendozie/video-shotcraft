import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  realpathSync,
  lstatSync,
  rmSync,
} from "node:fs";
import path from "node:path";
export function readRenderJob(root) {
  const file = path.join(root, ".render-job.json");
  return existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
}
export function writeRenderJob(root, job) {
  const file = path.join(root, ".render-job.json");
  writeFileSync(`${file}.tmp`, JSON.stringify(job));
  renameSync(`${file}.tmp`, file);
}
export function recoverRenderJob(root) {
  const job = readRenderJob(root);
  if (!job) return null;
  let alive = false;
  if (Number.isInteger(job.pid) && job.pid > 1) {
    try {
      process.kill(job.pid, 0);
      alive = true;
    } catch {}
  }
  if (job.status === "running" && alive) return job;
  if (job.stage && existsSync(job.stage)) {
    const stagingRoot = path.join(realpathSync(root), ".render-public");
    const stage = path.resolve(job.stage);
    if (
      path.dirname(stage) !== stagingRoot ||
      !path.basename(stage).startsWith("render-") ||
      lstatSync(stage).isSymbolicLink() ||
      realpathSync(stage) !== stage
    )
      throw new Error(
        "Unverified render stage path; preserve it for inspection",
      );
    const owner = JSON.parse(
      readFileSync(path.join(stage, ".owner.json"), "utf8"),
    );
    if (owner.id !== job.id) throw new Error("Render stage ownership mismatch");
    rmSync(stage, { recursive: true, force: true });
  }
  if (job.status === "running") {
    job.status = "error";
    job.lastLine = "Export interrupted; owned staging snapshot recovered";
    writeRenderJob(root, job);
  }
  return job;
}
