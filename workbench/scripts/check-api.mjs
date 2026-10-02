import test from "node:test";
import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  symlinkSync,
  readFileSync,
  existsSync,
  readdirSync,
  rmdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { projectApi, stagePublicAssets } from "./project-api.mjs";
import { writeVideoRoot } from "./video-root.mjs";

function splitPost(url, bytes, cut, between = async () => {}) {
 return new Promise((resolve,reject) => {
  const req = request(url,{method:"POST",headers:{"Content-Type":"application/json"}},res => {
   const chunks=[];
   res.on("data", c=>chunks.push(c));
   res.on("end",()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks).toString("utf8"))}));
  });
  req.on("error",reject);
  req.write(bytes.subarray(0,cut));
  setTimeout(async()=>{try {await between(); req.end(bytes.subarray(cut));} catch(e) {req.destroy();reject(e);}},20);
 });
}
for (const layout of ["src", "remotion/src", "named-remotion"]) test(`HTTP persistence and export use the video root for ${layout}`, async () => {
  const fixture = mkdtempSync(path.join(tmpdir(), "Mendex-video-api-"));
  const root = path.join(fixture, "tool"),
    project = path.join(fixture, layout === "named-remotion" ? "remotion" : "video");
  const sourceLayout = layout === "named-remotion" ? "src" : layout;
  mkdirSync(root);
  mkdirSync(path.join(project, sourceLayout), { recursive: true });
  mkdirSync(path.join(project, "public"));
  symlinkSync(
    path.join(project, sourceLayout),
    path.join(root, "proj"),
    process.platform === "win32" ? "junction" : "dir",
  );
  writeVideoRoot(root, project, path.join(project, sourceLayout));
  const stack = [];
  projectApi(root).configureServer({
    middlewares: {
      use: (prefix, fn) =>
        stack.push(typeof prefix === "function" ? ["", prefix] : [prefix, fn]),
    },
  });
  let acknowledgedJob = null;
  const server = createServer((req, res) => {
    const end = res.end.bind(res);
    res.end = (...args) => {
      if (req.url === "/export" && res.statusCode === 200) {
        try {
          acknowledgedJob = JSON.parse(
            readFileSync(path.join(root, ".render-job.json"), "utf8"),
          );
        } catch {}
      }
      return end(...args);
    };
    let i = 0;
    const original = req.url;
    const next = () => {
      const item = stack[i++];
      if (!item) {
        res.statusCode = 404;
        res.end();
        return;
      }
      const [prefix, fn] = item;
      if (!original.startsWith(prefix)) return next();
      req.url = original.slice(prefix.length) || "/";
      fn(req, res, next);
    };
    next();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const state = await (await fetch(base + "/api/project")).json();
    const montage = {
      name: "HTTP test",
      width: 1920,
      height: 1080,
      fps: 30,
      tracks: [],
    };
    const save = (body) =>
      fetch(base + "/api/project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    assert.equal((await save({ ...state, project: montage })).status, 200);
    assert.equal(JSON.parse(readFileSync(path.join(project, "workbench.project.json"), "utf8")).name, "HTTP test");
    assert.equal((await save({ ...state, project: montage })).status, 409);
    assert.equal(
      (await save({ ...state, project: montage, projectId: "another-project" }))
        .status,
      409,
    );
    const fresh = await (await fetch(base + "/api/project")).json();
    const blockedState = path.join(root, ".render-job.json.tmp");
    mkdirSync(blockedState);
    const rejectedExport = await fetch(base + "/api/export", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({project:montage,projectId:state.projectId})});
    assert.equal(rejectedExport.status,400);
    assert.deepEqual(readdirSync(path.join(root,".render-public")),[]);
    rmdirSync(blockedState);
    const unicode = {...montage,name:"Привет 🎬"};
    const bytes = Buffer.from(JSON.stringify({...fresh,project:unicode}));
    const split = bytes.indexOf(Buffer.from("П")) + 1;
    const unicodeSave = await splitPost(base + "/api/project",bytes,split);
    assert.equal(unicodeSave.status,200);
    assert.equal(unicodeSave.body.project.name,unicode.name);
    assert.equal(JSON.parse(readFileSync(path.join(project,"workbench.project.json"),"utf8")).name,unicode.name);
    writeFileSync(path.join(project, "public", "new.txt"), "first-bytes");
    assert.equal(await (await fetch(base + "/new.txt")).text(), "first-bytes");
    writeFileSync(path.join(project, "public", "new.txt"), "updated-bytes");
    const range = await fetch(base + "/new.txt", {
      headers: { Range: "bytes=0-6" },
    });
    assert.equal(range.status, 206);
    assert.equal(await range.text(), "updated");
    const invalid = await fetch(base + "/new.txt", {
      headers: { Range: "bytes=900-1000" },
    });
    assert.equal(invalid.status, 416);
    const accepted = await fetch(base + "/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ project: montage, projectId: state.projectId }),
    });
    const job = await accepted.json();
    assert.equal(accepted.status, 200);
    assert.equal(
      acknowledgedJob?.id,
      job.id,
      "Acknowledgement must follow durable render ownership",
    );
    assert.equal(acknowledgedJob.status, "running");
    assert.ok(acknowledgedJob.pid > 1);
    assert.equal(typeof acknowledgedJob.processIdentity, "string");
    assert.equal(path.dirname(acknowledgedJob.output), path.join(project, "exports"));
    const drain = () => fetch(base + "/api/drain",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ownerPid:process.pid})});
    writeFileSync(path.join(root,".render-job.json"),JSON.stringify(acknowledgedJob));
    assert.equal((await drain()).status,409);
    writeFileSync(path.join(root,".render-job.json"),JSON.stringify({...acknowledgedJob,status:"error"}));
    const exportBytes = Buffer.from(JSON.stringify({project:montage,projectId:state.projectId}));
    const delayedExport = await splitPost(base + "/api/export",exportBytes,10,async()=>assert.equal((await drain()).status,200));
    assert.equal(delayedExport.status,503);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("export preserves project cardpreviews but excludes the tool gallery", () => {
 const fixture = mkdtempSync(path.join(tmpdir(), "Mendex-video-stage-assets-"));
 const root = path.join(fixture, "tool"), source = path.join(fixture, "source"), out = path.join(fixture, "out");
 mkdirSync(path.join(root, "public/cardpreviews"), {recursive:true});
 mkdirSync(path.join(source, "cardpreviews"), {recursive:true});
 mkdirSync(out);
 writeFileSync(path.join(root, "public/cardpreviews/gallery.mp4"), "tool gallery");
 writeFileSync(path.join(source, "cardpreviews/owned.mp4"), "project footage");
 stagePublicAssets(root, source, out, []);
 assert.equal(readFileSync(path.join(out, "cardpreviews/owned.mp4"), "utf8"), "project footage");
 assert.equal(existsSync(path.join(out, "cardpreviews/gallery.mp4")), false);
 const toolOnly = path.join(fixture, "tool-only");
 mkdirSync(toolOnly);
 stagePublicAssets(root, null, toolOnly, []);
 assert.equal(existsSync(path.join(toolOnly, "cardpreviews")), false);
});
