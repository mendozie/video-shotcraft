import path from "node:path";
// Both supported source layouts belong to the outer video root.
export function videoRoot(sourceDir) {
  const parent = path.dirname(sourceDir);
  return path.basename(parent).toLowerCase() === "remotion"
    ? path.dirname(parent)
    : parent;
}
