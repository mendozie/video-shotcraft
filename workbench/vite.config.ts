/* Modified in the personal fork, 02-10-2026: Windows and project-owned video workflow. */
// Modified: portable export and project-owned montage persistence.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { projectApi } from "./scripts/project-api.mjs";
const root = fileURLToPath(new URL(".", import.meta.url));
const proj = ["workbench.ts", "workbench.tsx"].some((f) =>
  existsSync(path.join(root, "proj", f)),
)
  ? "proj"
  : "proj-stub";
export default defineConfig({
  plugins: [react(), projectApi(root)],
  server: { host: "127.0.0.1", port: 5198, strictPort: true },
  resolve: {
    preserveSymlinks: true,
    alias: {
      "@proj": path.join(root, proj),
      "@demos": path.join(
        root,
        process.platform === "win32" ? ".demos" : "demosrc",
      ),
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "remotion", "@remotion/motion-blur"],
  },
});
