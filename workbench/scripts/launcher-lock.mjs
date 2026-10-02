import { openSync, writeFileSync, readFileSync, closeSync, unlinkSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export function acquireLauncherLock(root) {
  const file = path.join(root, ".launcher-lock.json");
  const token = randomUUID();
  let fd;
  try { fd = openSync(file, "wx"); }
  catch (error) {
    if (error.code !== "EEXIST") throw error;
    let owner;
    try { owner = JSON.parse(readFileSync(file, "utf8")); } catch {
      throw new Error("Launcher lock is unreadable; preserve it and inspect the previous launch.");
    }
    if (!Number.isInteger(owner.pid) || owner.pid < 1 || typeof owner.token !== "string")
      throw new Error("Invalid launcher lock; inspect it before retrying.");
    throw new Error("Another launcher is already updating this checkout; retry after it finishes. After a crash, verify the recorded PID is gone before removing the lock.");
  }
  try { writeFileSync(fd, JSON.stringify({ pid: process.pid, token })); }
  finally { closeSync(fd); }
  const release = () => {
    try {
      if (JSON.parse(readFileSync(file, "utf8")).token === token) unlinkSync(file);
    } catch {}
  };
  return release;
}
