import type { ProjectData } from "./types";
export let disk: {
  project: ProjectData | null;
  revision: string | null;
  projectId: string;
} = { project: null, revision: null, projectId: "" };
export async function loadDisk() {
  const r = await fetch("/api/project");
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? "Cannot read project file");
  if (disk.projectId && disk.projectId !== body.projectId)
    throw new Error("Active project changed. Reopen this tab.");
  disk = body;
}
export async function saveDisk(project: ProjectData) {
  const r = await fetch("/api/project", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...disk, project }),
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error ?? "Save failed");
  disk = body;
}
