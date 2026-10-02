import { createReadStream, openSync, closeSync, copyFileSync, writeFileSync, renameSync, unlinkSync } from "node:fs";
import { createHash } from "node:crypto";
import { readFileSync, existsSync, readdirSync, lstatSync } from "node:fs";
import path from "node:path";
export function readAssetLedger(root) {
  const file = path.join(root, ".project-assets.json");
  let ledger = {};
  if (existsSync(file)) {
    try {
      ledger = JSON.parse(readFileSync(file, "utf8"));
    } catch {
      throw new Error("Unreadable asset ledger; binding unchanged");
    }
    if (!ledger || Array.isArray(ledger) || typeof ledger !== "object")
      throw new Error("Invalid asset ledger");
    for (const [name, hash] of Object.entries(ledger))
      if (
        name.includes("/") ||
        name.includes("\\") ||
        name.startsWith(".") ||
        !/^[a-f0-9]{64}$/.test(hash)
      )
        throw new Error("Invalid asset ledger entry");
  }
  const pub = path.join(root, "public");
  if (existsSync(pub))
    for (const name of readdirSync(pub)) {
      const p = path.join(pub, name),
        stat = lstatSync(p);
      if (name === ".gitkeep" || stat.isSymbolicLink() || ledger[name])
        continue;
      if (
        name === "textures" &&
        stat.isDirectory() &&
        readdirSync(p).every((n) => lstatSync(path.join(p, n)).isSymbolicLink())
      )
        continue;
      throw new Error(
        `Unmanaged public asset ${name}; restore its ownership ledger before rebinding`,
      );
    }
  return ledger;
}

export async function digestAsset(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: 1024 * 1024 })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}
export async function copyAssetFiles(files, publicDir, ledgerFile) {
  const created = [];
  const ledger = {};
  try {
    for (const [name, source] of files) {
      if (name !== path.basename(name) || name.startsWith(".")) throw new Error("Invalid asset filename");
      const target = path.join(publicDir, name);
      // Claim only a previously absent file; rollback never owns an unrelated destination.
      const fd = openSync(target, "wx");
      created.push(target);
      closeSync(fd);
      copyFileSync(source, target);
      ledger[name] = await digestAsset(target);
    }
    writeFileSync(ledgerFile + ".tmp", JSON.stringify(ledger, null, 2));
    renameSync(ledgerFile + ".tmp", ledgerFile);
    return ledger;
  } catch (error) {
    for (const target of created) {
      if (existsSync(target) && lstatSync(target).isFile()) unlinkSync(target);
    }
    throw error;
  }
}