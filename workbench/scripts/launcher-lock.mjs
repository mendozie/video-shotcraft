import { existsSync, renameSync, openSync, writeFileSync, readFileSync, closeSync, unlinkSync } from "node:fs";
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

function validServerState(state) {
 return state && Number.isInteger(state.pid) && state.pid > 1 &&
   Number.isInteger(state.port) && state.port >= 1024 && state.port <= 65535 &&
   typeof state.projectRoot === "string" && path.isAbsolute(state.projectRoot);
}
export function readServerState(file) {
 if (!existsSync(file)) return null;
 let state;
 try { state = JSON.parse(readFileSync(file, "utf8")); }
 catch { throw new Error("Unreadable server ownership state; inspect it before rebinding."); }
 if (!validServerState(state)) throw new Error("Invalid server ownership state; binding unchanged.");
 return state;
}
export function writeServerState(file, state) {
 if (!validServerState(state)) throw new Error("Invalid server ownership state; refusing to save.");
 writeFileSync(file + ".tmp", JSON.stringify(state, null, 2));
 renameSync(file + ".tmp", file);
}