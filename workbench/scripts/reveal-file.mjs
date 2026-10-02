import { spawn } from "node:child_process";
import path from "node:path";
export function revealFile(file, launch = spawn, platform = process.platform) {
  const command = platform === "win32" ? "explorer.exe" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/select,", file] : platform === "darwin" ? ["-R", file] : [path.dirname(file)];
  return new Promise((resolve, reject) => {
    const child = launch(command, args, { windowsHide: true });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`Reveal command exited with code ${code}`)));
  });
}
