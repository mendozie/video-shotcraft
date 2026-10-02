import test from "node:test";
import assert from "node:assert/strict";
import { loadBrowserProject, legacyJson, LEGACY_KEY } from "../src/browserProject.ts";
test("legacy migration requires consent, preserves the original and never replaces a project-specific timeline", () => {
  const old = { name: "Previous manual cut", tracks: [] };
  const saved = new Map([[LEGACY_KEY, JSON.stringify(old)]]);
  const storage = { getItem: (key) => saved.get(key) ?? null };
  assert.equal(loadBrowserProject(storage, "v2:a", () => false), null);
  assert.deepEqual(loadBrowserProject(storage, "v2:a", () => true), old);
  assert.equal(legacyJson(storage), JSON.stringify(old));
  const current = { name: "Current project", tracks: [] };
  saved.set("v2:a", JSON.stringify(current));
  assert.deepEqual(loadBrowserProject(storage, "v2:a", () => { throw new Error("Must not ask"); }), current);
});
