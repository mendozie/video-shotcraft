import { spawn } from "node:child_process";
import path from "node:path";
export function openBrowser(url, warn = console.warn, launch = spawn, platform = process.platform) {
  const command = platform === "win32" ? "rundll32.exe" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["url.dll,FileProtocolHandler", url] : [url];
  try {
    const child = launch(command, args, { stdio: "ignore", detached: true, windowsHide: true });
    child.once("error", error => warn(`[workbench] Browser could not open: ${error.message}. Open ${url} manually.`));
    child.once("exit", code => { if (code) warn(`[workbench] Browser exited with code ${code}. Open ${url} manually.`); });
    child.unref();
  } catch (error) {
    warn(`[workbench] Browser could not open: ${error.message}. Open ${url} manually.`);
  }
}
export function revealFile(file, launch = spawn, platform = process.platform) {
  const command = platform === "win32" ? "explorer.exe" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/select,", file] : platform === "darwin" ? ["-R", file] : [path.dirname(file)];
  return new Promise((resolve, reject) => {
    const child = launch(command, args, { windowsHide: true });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`Reveal command exited with code ${code}`)));
  });
}
