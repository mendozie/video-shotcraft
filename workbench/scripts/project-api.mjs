import { revealFile } from "./reveal-file.mjs";
import { videoRoot } from "./video-root.mjs";
// Local Workbench persistence and portable Remotion export; no separate service.
import {
  existsSync,
  realpathSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  mkdtempSync,
  cpSync,
  rmSync,
  statSync,
} from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import sirv from "sirv";
import { createProjectStore, validateProject } from "./project-file.mjs";
import { readAssetLedger } from "./asset-ledger.mjs";
import {
  readRenderJob,
  writeRenderJob,
  recoverRenderJob,
  processIdentity,
  isRenderActive,
} from "./render-state.mjs";
export function stagePublicAssets(root, sourcePublic, publicDir, copiedNames) {
  const names = new Set([
    ...readdirSync(path.join(root, "public")),
    ...(sourcePublic && existsSync(sourcePublic)
      ? readdirSync(sourcePublic)
      : []),
  ]);
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const original = sourcePublic
      ? path.join(sourcePublic, name)
      : null;
    if (name === "cardpreviews" && (!original || !existsSync(original))) continue;
    if (
      copiedNames.includes(name) &&
      (!original || !existsSync(original))
    )
      continue;
    cpSync(
      original && existsSync(original)
        ? original
        : path.join(root, "public", name),
      path.join(publicDir, name),
      { recursive: true, dereference: true },
    );
  }

}
export function projectApi(root) {
  const linked = path.join(root, "proj");
  const projectRoot = existsSync(linked)
    ? videoRoot(realpathSync(linked), root)
    : null;
  const store = projectRoot ? createProjectStore(projectRoot) : null;
  const jobs = new Map();
  let draining = false;
  recoverRenderJob(root);
  const readJob = () => readRenderJob(root);
  const active = () => isRenderActive(readJob());
  return {
    name: "project-files",
    configureServer(server) {
      // Windows root files have index copies, but preview always reads the source.
      const sourcePublic = projectRoot
        ? path.join(projectRoot, "public")
        : null;
      const serveSource = sourcePublic
        ? sirv(sourcePublic, { dev: true, etag: false, extensions: [] })
        : null;
      const copiedNames = Object.keys(readAssetLedger(root));
      server.middlewares.use((req, res, next) => {
        if (!sourcePublic || req.method !== "GET") return next();
        let name;
        try {
          name = decodeURIComponent((req.url ?? "").split("?")[0]).slice(1);
        } catch {
          return next();
        }
        if (
          !name ||
          name.includes("/") ||
          name.includes("\\") ||
          name.startsWith(".")
        )
          return next();
        const source = path.join(sourcePublic, name);
        if (!existsSync(source)) {
          if (copiedNames.includes(name)) {
            res.statusCode = 404;
            res.end();
            return;
          }
          return next();
        }
        if (!statSync(source).isFile()) return next();
        serveSource(req, res, next);
      });
      server.middlewares.use("/api", async (req, res, next) => {
        const route = (req.url ?? "").split("?")[0];
        if (route !== "/drain" && !route.startsWith("/project") && !route.startsWith("/export"))
          return next();
        const send = (status, body) => {
          res.statusCode = status;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(body));
        };
        if (!store) {
          if (req.method === "GET" && route === "/project")
            return send(200, {
              project: null,
              revision: null,
              projectId: "unlinked",
            });
          return send(409, { error: "Link a project first" });
        }
        try {
          if (
            req.headers.origin &&
            new URL(req.headers.origin).host !== req.headers.host
          )
            return send(403, { error: "Foreign origin" });
          if (req.method === "GET" && route === "/project")
            return send(200, store.read());
          if (req.method === "GET" && route === "/export-status")
            return send(200, { running: active() });
          if (req.method === "GET" && /^\/export\/[a-z0-9-]+$/.test(route)) {
            const id = route.split("/")[2];
            const disk = readJob();
            const job = disk?.id === id ? disk : jobs.get(id);
            return send(job ? 200 : 404, job ?? { error: "Unknown render" });
          }
          if (req.method !== "POST")
            return send(405, { error: "Method not allowed" });
          if (!req.headers["content-type"]?.startsWith("application/json"))
            return send(415, { error: "JSON required" });
          const chunks = [];
          let byteLength = 0;
          for await (const chunk of req) {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            byteLength += bytes.length;
            if (byteLength > 4_000_000) return send(413, { error: "Project too large" });
            chunks.push(bytes);
          }
          const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
          if (route === "/drain") {
            if (body.ownerPid !== process.pid) return send(409, { error: "Server ownership changed" });
            if (active() || [...jobs.values()].some(j => j.status === "running"))
              return send(409, { error: "Render still running" });
            draining = true;
            return send(200, { ok: true });
          }
          if (draining) return send(503, { error: "Server is stopping; reopen after switching" });
          if (body.projectId !== store.projectId)
            return send(409, {
              error: "Active project changed; reopen this tab",
            });
          if (route === "/project")
            return send(
              200,
              store.save(body.project, body.revision, body.projectId),
            );
          if (route.endsWith("/reveal")) {
            const id = route.split("/")[2];
            const disk = readJob();
            const job = disk?.id === id ? disk : jobs.get(id);
            if (!job || job.status !== "done")
              return send(404, { error: "No completed render" });
            await revealFile(job.output);
            return send(200, { ok: true });
          }
          if (route !== "/export")
            return send(404, { error: "Unknown action" });
          if (
            active() ||
            [...jobs.values()].some((j) => j.status === "running")
          )
            return send(409, { error: "Render already running" });
          validateProject(body.project);
          const id = Date.now().toString(36);
          const out = path.join(projectRoot, "exports");
          mkdirSync(out, { recursive: true });
          const output = path.join(
            out,
            `${body.project.name.replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 60) || "video"}-${id}.mp4`,
          );
          const stagingRoot = path.join(root, ".render-public");
          mkdirSync(stagingRoot, { recursive: true });
          const stage = mkdtempSync(path.join(stagingRoot, "render-"));
          const job = {
            id,
            stage,
            // Own the preparing phase too; renderer PID replaces this after spawn.
            pid: process.pid,
            processIdentity: processIdentity(process.pid),
            status: "running",
            progress: 0,
            output,
            lastLine: "Preparing assets",
            logTail: [],
          };
          jobs.set(id, job);
          writeFileSync(
            path.join(stage, ".owner.json"),
            JSON.stringify({ id }),
          );
          const persist = () => writeRenderJob(root, job);
          persist();
          send(200, { id });
          // Snapshot both props and assets. Only the newly allocated stage is disposable.
          const cleanup = () => {
            if (
              path.dirname(stage) === stagingRoot &&
              path.basename(stage).startsWith("render-")
            )
              rmSync(stage, { recursive: true, force: true });
          };
          const failed = (error) => {
            job.status = "error";
            job.lastLine = String(error);
            persist();
            cleanup();
          };
          try {
            const publicDir = path.join(stage, "public");
            mkdirSync(publicDir);
            stagePublicAssets(root, sourcePublic, publicDir, copiedNames);
            const props = path.join(stage, "props.json");
            writeFileSync(
              props,
              JSON.stringify({ project: body.project, renderExact: true }),
            );
            const provenance = {
              project: body.project,
              toolCommit: spawnSync("git", ["rev-parse", "HEAD"], {
                cwd: root,
                encoding: "utf8",
                windowsHide: true,
              }).stdout.trim(),
              toolDirty: Boolean(
                spawnSync("git", ["status", "--porcelain"], {
                  cwd: root,
                  encoding: "utf8",
                  windowsHide: true,
                }).stdout.trim(),
              ),
              renderer: JSON.parse(
                (await import("node:fs")).readFileSync(
                  path.join(root, "node_modules/remotion/package.json"),
                  "utf8",
                ),
              ).version,
            };
            writeFileSync(
              `${output}.json`,
              JSON.stringify(provenance, null, 2),
            );
            const child = spawn(
              process.execPath,
              [
                path.join(root, "node_modules/@remotion/cli/remotion-cli.js"),
                "render",
                "src/remotion/index.ts",
                "Main",
                output,
                `--props=${props}`,
                `--public-dir=${publicDir}`,
              ],
              { cwd: root, windowsHide: true },
            );
            job.pid = child.pid;
            job.processIdentity = processIdentity(child.pid);
            persist();
            let lastPersist = 0;
            const chunk = (b) => {
              for (const line of b
                .toString()
                .replace(/\x1b\[[0-9;]*[A-Za-z]/g, "")
                .split(/[\r\n]+/)
                .filter(Boolean)) {
                job.lastLine = line;
                job.logTail = [...job.logTail, line].slice(-40);
                const m = [...line.matchAll(/(\d+)\/(\d+)/g)].pop();
                if (m && +m[2] > 0) job.progress = +m[1] / +m[2];
              }
              if (Date.now() - lastPersist > 500) {
                persist();
                lastPersist = Date.now();
              }
            };
            child.stdout.on("data", chunk);
            child.stderr.on("data", chunk);
            child.on("error", failed);
            child.on("close", (code) => {
              if (job.status === "error") return;
              job.status = code === 0 ? "done" : "error";
              if (code === 0) job.progress = 1;
              else
                job.lastLine =
                  job.logTail.find((l) => l.includes("Error")) ?? job.lastLine;
              persist();
              cleanup();
            });
          } catch (e) {
            failed(e);
          }
        } catch (e) {
          send(/changed/.test(String(e)) ? 409 : 400, { error: String(e) });
        }
      });
    },
  };
}
