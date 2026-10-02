import path from "node:path";
import { readFileSync, writeFileSync, renameSync, realpathSync, existsSync } from "node:fs";

function validateBinding(binding, sourceDir) {
  const { projectRoot, source } = binding;
  if (typeof projectRoot !== "string" || !path.isAbsolute(projectRoot) ||
      typeof source !== "string" || !path.isAbsolute(source)) {
    throw new Error("Invalid project binding; reopen with an explicit video root.");
  }
  const actualSource = realpathSync(sourceDir);
  const root = realpathSync(projectRoot);
  const matches = ["src", "remotion/src"].some((layout) => {
    const candidate = path.join(root, layout);
    return existsSync(candidate) && realpathSync(candidate) === actualSource;
  });
  if (realpathSync(source) !== actualSource || !matches) {
    throw new Error("Project binding differs from source link; reopen with an explicit video root.");
  }
  return root;
}

export function videoRoot(sourceDir, workbenchRoot) {
  let binding;
  try {
    binding = JSON.parse(readFileSync(path.join(workbenchRoot, ".project-binding.json"), "utf8"));
  } catch {
    throw new Error("Missing or unreadable project binding; run open.mjs with an explicit video root.");
  }
  return validateBinding(binding, sourceDir);
}

export function writeVideoRoot(workbenchRoot, projectRoot, sourceDir) {
  const binding = { projectRoot: realpathSync(projectRoot), source: realpathSync(sourceDir) };
  validateBinding(binding, sourceDir);
  const file = path.join(workbenchRoot, ".project-binding.json");
  writeFileSync(file + ".tmp", JSON.stringify(binding, null, 2));
  renameSync(file + ".tmp", file);
}
