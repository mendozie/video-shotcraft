import { spawnSync } from "node:child_process";
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
  if (isRenderActive(job)) return job;
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

let ownIdentity;
export function processIdentity(pid) {
  if (!Number.isInteger(pid) || pid < 2) return null;
  if (pid === process.pid && ownIdentity) return ownIdentity;
  let identity = null;
  try {
    if (process.platform === "linux") {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      const started = stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)[19];
      const boot = readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim();
      if (started && boot) identity = `${boot}:${started}`;
    } else {
      const result = process.platform === "win32"
        ? spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `$processInfo = Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}'; if ($processInfo) { $processInfo.CreationDate.ToUniversalTime().Ticks }`], {encoding:"utf8",windowsHide:true,timeout:10000})
        : spawnSync("ps", ["-o", "lstart=", "-o", "command=", "-p", String(pid)], {encoding:"utf8",env:{...process.env,LC_ALL:"C",TZ:"UTC"},timeout:10000});
      if (result.status === 0 && result.stdout.trim()) identity = result.stdout.trim();
    }
  } catch {}
  if (pid === process.pid && identity) ownIdentity = identity;
  return identity;
}
export function isRenderActive(job) {
  if (!job || job.status !== "running") return false;
  if (!Number.isInteger(job.pid) || job.pid < 2) throw new Error("Invalid render process identity; preserve its stage for inspection");
  try { process.kill(job.pid, 0); }
  catch (e) { if (e.code === "ESRCH") return false; throw new Error("Cannot establish render process liveness"); }
  if (!job.processIdentity) throw new Error("Render process creation identity is missing; preserve its stage for inspection");
  const current = processIdentity(job.pid);
  if (!current) {
    try { process.kill(job.pid, 0); }
    catch (e) { if (e.code === "ESRCH") return false; }
    throw new Error("Cannot verify render process creation identity; preserve its stage for inspection");
  }
  return current === job.processIdentity;
}