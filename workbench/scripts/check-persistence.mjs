import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createProjectStore, validateProject } from "./project-file.mjs";
test("a malformed nonempty montage is rejected before it can replace a working file", () => {
  const project = {
    name: "A",
    width: 1920,
    height: 1080,
    fps: 30,
    tracks: [
      {
        id: "t",
        clips: [
          { id: "c", cardId: "scene", start: 0, duration: 30, props: {} },
        ],
      },
    ],
  };
  assert.throws(() => validateProject(project), /Invalid clip/);
});
test("disk montage survives reopen; stale revisions and foreign project IDs cannot overwrite edits", () => {
  const root = mkdtempSync(path.join(tmpdir(), "Mendex-video-save-"));
  const s = createProjectStore(root);
  const initial = s.read();
  const project = { name: "A", width: 1920, height: 1080, fps: 30, tracks: [] };
  const saved = s.save(project, initial.revision, initial.projectId);
  assert.deepEqual(createProjectStore(root).read().project, project);
  const external = { ...project, name: "Agent edit" };
  writeFileSync(
    path.join(root, "workbench.project.json"),
    JSON.stringify(external),
  );
  assert.throws(
    () => s.save(project, saved.revision, initial.projectId),
    /changed/,
  );
  assert.throws(
    () => s.save(project, s.read().revision, "different-project"),
    /project/,
  );
  assert.deepEqual(
    JSON.parse(readFileSync(path.join(root, "workbench.project.json"), "utf8")),
    external,
  );
  assert.throws(
    () => s.save({ ...project, fps: 0 }, s.read().revision, initial.projectId),
    /Invalid/,
  );
  writeFileSync(path.join(root, "workbench.project.json"), "{broken");
  assert.throws(() => s.read());
});

test("duplicate track IDs cannot replace the saved montage", () => {
 const root = mkdtempSync(path.join(tmpdir(), "Mendex-video-track-ids-"));
 const store = createProjectStore(root), initial = store.read();
 const valid = {name:"Tracks",width:1920,height:1080,fps:30,tracks:[{id:"a",clips:[]}]};
 const saved = store.save(valid, initial.revision, initial.projectId);
 const invalid = {...valid, tracks:[...valid.tracks, {id:"a",clips:[]}]};
 assert.throws(() => store.save(invalid,saved.revision,saved.projectId), /Invalid track/);
 assert.deepEqual(store.read().project, valid);
});