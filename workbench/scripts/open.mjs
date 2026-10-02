#!/usr/bin/env node
import { videoRoot, writeVideoRoot } from "./video-root.mjs";
import { acquireLauncherLock, readServerState, writeServerState } from "./launcher-lock.mjs";
/* Modified in the personal fork, 02-10-2026: Windows and project-owned video workflow. */
// Modified for portable project binding and verified process ownership.
// One checkout owns one active project, regardless of the requested port.
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  realpathSync,
  lstatSync,
  mkdirSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmdirSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
  statSync,
} from "node:fs";

import { createConnection } from "node:net";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readAssetLedger, digestAsset, copyAssetFiles } from "./asset-ledger.mjs";
import { recoverRenderJob } from "./render-state.mjs";
const wb = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (k) => args.includes(`--${k}`);
const opt = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const port = Number(opt("port", "5198"));
const fail = (s) => {
  console.error(`[workbench] ${s}`);
  process.exit(1);
};
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  fail("Invalid port (1024..65535).");
try { process.once("exit", acquireLauncherLock(wb)); } catch (e) { fail(String(e)); }
const positional = args.filter(
  (a, i) => !a.startsWith("--") && args[i - 1] !== "--port",
);
const isLink = (p) => {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const occupied = (p) =>
  new Promise((r) => {
    const s = createConnection({ host: "127.0.0.1", port: p });
    s.setTimeout(700);
    const done = (v) => {
      s.destroy();
      r(v);
    };
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
    s.once("timeout", () => done(true));
  });
const viteBin = join(wb, "node_modules/vite/bin/vite.js");
if (!existsSync(viteBin))
  fail("Dependencies missing. Run npm ci --ignore-scripts in workbench first.");
const stateFile = join(wb, ".dev-state.json");
let state = null;
try {
  state = readServerState(stateFile);
} catch (e) { fail(String(e)); }
const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
function owned(s) {
  if (
    !s ||
    !Number.isInteger(s.pid) ||
    s.pid < 2 ||
    !Number.isInteger(s.port) ||
    !alive(s.pid)
  )
    return false;
  const result =
    process.platform === "win32"
      ? spawnSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `(Get-CimInstance Win32_Process -Filter 'ProcessId = ${s.pid}').CommandLine`,
          ],
          { encoding: "utf8", windowsHide: true },
        )
      : spawnSync("ps", ["-o", "command=", "-p", String(s.pid)], {
          encoding: "utf8",
        });
  const command = (result.stdout ?? "").trim();
  return (
    result.status === 0 &&
    command.includes(viteBin) &&
    new RegExp(`--port\\s+${s.port}(?:\\s|$)`).test(command)
  );
}
const managed = owned(state);
if (state && alive(state.pid) && !managed)
  fail("Recorded process ownership cannot be verified; binding unchanged.");
const renderFile = join(wb, ".render-job.json");
try {
  recoverRenderJob(wb);
} catch (e) {
  fail(String(e));
}
if (existsSync(renderFile)) {
  let render;
  try {
    render = JSON.parse(readFileSync(renderFile, "utf8"));
  } catch {
    fail("Cannot read render state; binding unchanged.");
  }
  if (render.status === "running" && (!render.pid || alive(render.pid)))
    fail("Render still running; wait before stopping or switching.");
}
if (flag("stop")) {
  if (managed) {
    process.kill(state.pid);
    for (let i = 0; i < 50 && alive(state.pid); i++) await sleep(100);
    if (alive(state.pid)) fail("Server did not stop.");
  }
  if (existsSync(stateFile)) unlinkSync(stateFile);
  console.log("[workbench] Managed server stopped.");
  process.exit(0);
}
// Check a different target port before stopping our current server or touching links.
if ((await occupied(port)) && !(managed && state.port === port))
  fail(`Port ${port} occupied by another process; binding unchanged.`);
const projLink = join(wb, "proj");
const requested = positional[0] ? resolve(positional[0]) : null;
let src = requested
  ? [join(requested, "src"), join(requested, "remotion/src")].find(
      (p) =>
        existsSync(p) &&
        readdirSync(p).some((f) =>
          /^(Root|index|entry|workbench)\.tsx?$/.test(f),
        ),
    )
  : isLink(projLink)
    ? resolve(wb, readlinkSync(projLink))
    : null;
if (!src)
  fail("Provide a project with src/workbench.ts(x), Root.tsx or index.ts.");
const projectRoot = requested ? realpathSync(requested) : videoRoot(src, wb);
const pub = join(wb, "public");
const assets = join(projectRoot, "public");
const copiesFile = join(wb, ".project-assets.json");
let copies;
try {
  copies = readAssetLedger(wb);
} catch (e) {
  fail(String(e));
}

const entries = existsSync(assets)
  ? readdirSync(assets).filter((n) => !n.startsWith("."))
  : [];
// Refuse collisions before any mutation. Copied root files are removed only unchanged.
for (const [name, hash] of Object.entries(copies)) {
  if (name !== name.split(/[\\/]/).pop()) fail("Invalid local asset ledger.");
  const p = join(pub, name);
  if (existsSync(p) && (!statSync(p).isFile() || (await digestAsset(p)) !== hash))
    fail(`Locally changed asset ${name}; preserve it before switching.`);
}
for (const name of entries) {
  const p = join(pub, name);
  const generatedTextures =
    name === "textures" &&
    existsSync(p) &&
    statSync(p).isDirectory() &&
    readdirSync(p).every((n) => isLink(join(p, n)));
  if (existsSync(p) && !isLink(p) && !copies[name] && !generatedTextures)
    fail(`Unmanaged public asset ${name}; binding unchanged.`);
}
if (existsSync(projLink) && !isLink(projLink))
  fail("proj is not a managed link; binding unchanged.");
if (managed) {
  const running = await fetch(
    `http://127.0.0.1:${state.port}/api/export-status`,
  )
    .then((r) => r.json())
    .catch(() => null);
  if (!running || running.running)
    fail(
      "Render state unavailable or render still running; wait before switching.",
    );
  // A fresh launch always restarts: one project binding per shared checkout.
  process.kill(state.pid);
  for (
    let i = 0;
    i < 100 && (alive(state.pid) || (await occupied(state.port)));
    i++
  )
    await sleep(100);
  if (alive(state.pid))
    fail("Previous managed server did not stop; binding unchanged.");
}
if (await occupied(port)) fail(`Port ${port} occupied; binding unchanged.`);
mkdirSync(pub, { recursive: true });
for (const name of Object.keys(copies)) {
  const p = join(pub, name);
  if (existsSync(p)) unlinkSync(p);
}
for (const name of readdirSync(pub)) {
  const p = join(pub, name);
  if (isLink(p)) unlinkSync(p);
  else if (
    name === "textures" &&
    statSync(p).isDirectory() &&
    readdirSync(p).every((n) => isLink(join(p, n)))
  ) {
    for (const n of readdirSync(p)) unlinkSync(join(p, n));
    rmdirSync(p);
  }
}
if (isLink(projLink)) unlinkSync(projLink);
symlinkSync(src, projLink, process.platform === "win32" ? "junction" : "dir");
writeVideoRoot(wb, projectRoot, src);
const filesToCopy = [];
for (const name of entries) {
  const source = join(assets, name), target = join(pub, name);
  if (statSync(source).isDirectory())
    symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
  else filesToCopy.push([name, source]);
}
await copyAssetFiles(filesToCopy, pub, copiesFile);
const generated = spawnSync(
  process.execPath,
  [join(wb, "scripts/gen-index.mjs")],
  { cwd: wb, stdio: "inherit", windowsHide: true },
);
if (generated.status !== 0) process.exit(generated.status ?? 1);
const fd = openSync(join(wb, ".dev.log"), "a");
const child = spawn(
  process.execPath,
  [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"],
  { cwd: wb, detached: true, stdio: ["ignore", fd, fd], windowsHide: true },
);
child.unref();
closeSync(fd);
try { writeServerState(stateFile, { pid: child.pid, port, projectRoot }); }
catch (e) {
  if (alive(child.pid)) process.kill(child.pid);
  fail(`Cannot persist server ownership: ${e}`);
}
const url = `http://127.0.0.1:${port}/`;
let ready = false;
for (let i = 0; i < 120; i++) {
  if (!alive(child.pid)) fail("Dev server exited. Read .dev.log.");
  try {
    ready = (await fetch(url, { signal: AbortSignal.timeout(700) })).ok;
  } catch {}
  if (ready) break;
  await sleep(250);
}
if (!ready) fail("Dev server did not become ready. Read .dev.log.");
const openUrl = url + (flag("no-import") ? "" : "?import=project");
if (!flag("no-open")) {
  const cmd =
    process.platform === "win32"
      ? "rundll32.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const argv =
    process.platform === "win32"
      ? ["url.dll,FileProtocolHandler", openUrl]
      : [openUrl];
  spawn(cmd, argv, {
    stdio: "ignore",
    detached: true,
    windowsHide: true,
  }).unref();
}
console.log(
  `[workbench] ${openUrl}\nProject: ${projectRoot}\nStop: node scripts/open.mjs --stop`,
);
