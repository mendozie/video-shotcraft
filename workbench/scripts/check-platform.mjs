// Local platform integration checks; run with: node --test scripts/check-platform.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, realpathSync, mkdtempSync, mkdirSync, copyFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { videoRoot } from "./video-root.mjs";

const workbench = fileURLToPath(new URL("../", import.meta.url));

test("index generation preserves project public directory bindings over bundled defaults", () => {
  const root = mkdtempSync(path.join(tmpdir(), "Mendex-video-index-"));
  const wb = path.join(root,"workbench");
  mkdirSync(path.join(root,"demos"));
  for (const dir of ["scripts","src/cards","public"]) mkdirSync(path.join(wb,dir),{recursive:true});
  for (const file of ["gen-index.mjs","video-root.mjs"]) copyFileSync(path.join(workbench,"scripts",file),path.join(wb,"scripts",file));
  for (const [name,bundled] of [["cardpreviews","gallery/media"],["sfxlib","assets/audio/sfx"],["bgmlib","assets/audio/bgm"]]) {
    mkdirSync(path.join(root,bundled),{recursive:true});
    const source = path.join(root,"project",name);
    mkdirSync(source,{recursive:true});
    writeFileSync(path.join(source,"custom.wav"),"project bytes");
    symlinkSync(source,path.join(wb,"public",name),process.platform === "win32" ? "junction" : "dir");
  }
  const result = spawnSync(process.execPath,["scripts/gen-index.mjs"],{cwd:wb,encoding:"utf8",windowsHide:true});
  assert.equal(result.status,0,result.stderr);
  for (const name of ["cardpreviews","sfxlib","bgmlib"]) {
    assert.equal(realpathSync(path.join(wb,"public",name)),realpathSync(path.join(root,"project",name)));
    assert.equal(readFileSync(path.join(wb,"public",name,"custom.wav"),"utf8"),"project bytes");
  }
});

test("a fresh checkout generates a usable demo index on the current platform", () => {
  const result = spawnSync(process.execPath, ["scripts/gen-index.mjs"], {
    cwd: workbench,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr);
  const index = readFileSync(
    new URL("../src/cards/demo-index.ts", import.meta.url),
    "utf8",
  );
  if (existsSync(path.join(workbench, "proj"))) {
    const expected = videoRoot(realpathSync(path.join(workbench, "proj")), workbench);
    const meta = readFileSync(path.join(workbench, "src/projMeta.ts"), "utf8");
    assert.ok(meta.includes(JSON.stringify(expected)), "Library metadata must use the video root");
  }
  assert.match(index, /SlowPushIn/);
  assert.doesNotMatch(index, /@demos\/[^"\r\n]*\\/);
});
