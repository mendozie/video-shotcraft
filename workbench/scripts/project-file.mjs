// Project-owned montage, independent of browser storage and shared tool updates.
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  copyFileSync,
} from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
const hash = (s) => createHash("sha256").update(s).digest("hex");
export function validateProject(p) {
  if (
    !p ||
    typeof p.name !== "string" ||
    !Number.isInteger(p.width) ||
    p.width < 2 ||
    p.width > 7680 ||
    !Number.isInteger(p.height) ||
    p.height < 2 ||
    p.height > 7680 ||
    !Number.isFinite(p.fps) ||
    p.fps < 1 ||
    p.fps > 120 ||
    !Array.isArray(p.tracks)
  )
    throw new Error("Invalid project dimensions, fps or tracks");
  const ids = new Set();
  for (const t of p.tracks) {
    if (typeof t.id !== "string" || !Array.isArray(t.clips))
      throw new Error("Invalid track");
    for (const c of t.clips) {
      if (
        typeof c.id !== "string" ||
        ids.has(c.id) ||
        typeof c.cardId !== "string" ||
        !Number.isInteger(c.start) ||
        c.start < 0 ||
        !Number.isInteger(c.duration) ||
        c.duration < 1 ||
        !c.props ||
        typeof c.props !== "object"
      )
        throw new Error("Invalid clip");
      if (
        !["inOffset", "speed", "opacity", "scale", "x", "y"].every((k) =>
          Number.isFinite(c[k]),
        ) ||
        c.inOffset < 0 ||
        c.speed <= 0 ||
        c.scale <= 0 ||
        c.opacity < 0 ||
        c.opacity > 1
      )
        throw new Error("Invalid clip playback or transform");
      ids.add(c.id);
    }
  }
}
export function createProjectStore(root) {
  const file = path.join(root, "workbench.project.json");
  const projectId = hash(path.resolve(root));
  const read = () => {
    if (!existsSync(file)) return { project: null, revision: null, projectId };
    const raw = readFileSync(file, "utf8");
    const project = JSON.parse(raw);
    validateProject(project);
    return { project, revision: hash(raw), projectId };
  };
  const save = (project, revision, id) => {
    if (id !== projectId)
      throw new Error("Active project changed; reopen this tab");
    validateProject(project);
    if (read().revision !== revision)
      throw new Error(
        "File changed outside this tab; reload or export your edits before reconciling",
      );
    const temp = `${file}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(project, null, 2) + "\n", {
      flag: "wx",
    });
    if (existsSync(file)) copyFileSync(file, `${file}.previous`);
    renameSync(temp, file);
    return read();
  };
  return { read, save, projectId };
}
