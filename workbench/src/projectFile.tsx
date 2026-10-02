import { useState, useEffect } from "react";
import type { ProjectData } from "./types";
import { useStore } from "./store";
import { useLocale } from "./i18n";
import { disk, loadDisk, saveDisk } from "./projectSession";

export function ProjectFileButtons() {
  const project = useStore((s) => s.project);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const { locale } = useLocale();
  const ru = locale === "ru";
  const changed = JSON.stringify(project) !== JSON.stringify(disk.project);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (changed) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed]);
  const act = async (reload: boolean) => {
    if (
      reload &&
      !window.confirm(
        ru
          ? "Загрузить JSON с диска? Текущие правки можно сначала выгрузить кнопкой JSON."
          : "Reload the disk JSON? Export your current edits to JSON first if needed.",
      )
    )
      return;
    setBusy(true);
    try {
      if (reload) {
        await loadDisk();
        if (disk.project)
          useStore.getState().setProject(disk.project as ProjectData);
      } else await saveDisk(project);
      setMessage(ru ? "Сохранено на диске" : "Saved on disk");
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };
  if (disk.projectId === "unlinked") return null;
  return (
    <>
      <button className="btn" disabled={busy} onClick={() => act(false)}>
        {ru ? "Сохранить проект" : "Save project"}
        {changed ? " *" : ""}
      </button>
      <button className="btn" disabled={busy} onClick={() => act(true)}>
        {ru ? "С диска" : "Reload disk"}
      </button>
      {message && (
        <span
          role="status"
          title={message}
          style={{
            maxWidth: 220,
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {message}
        </span>
      )}
    </>
  );
}
