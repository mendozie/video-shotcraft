# Personal Workbench fork

This fork preserves the upstream library and Apache-2.0 notices. It adds Windows launch/export support and project-owned montage files. Modified source files carry modification notices. Upstream baseline: `5ddbf521038b0a7accfb6dc1e0a9eb29c67277ab`.

Install the root test dependencies and `workbench` dependencies with their existing lockfiles (`npm ci --ignore-scripts`). The tested environment is Node 22.18.0, Windows, React 19.2.7 and Remotion 4.0.484. Keep all Remotion packages at compatible locked versions. First export downloads Remotion's Chrome Headless Shell if absent. Root media uses the pinned sirv 3.0.2 static handler (MIT), including HTTP ranges. No `rsync`, Python backend or additional media service is required.

From `workbench`, run `node scripts/open.mjs <video-root> --no-open` and visit the printed URL. The root must contain `src/` or `remotion/src/` with a Remotion entrypoint; a `workbench.ts(x)` manifest makes its scenes editable. Directory junctions avoid Windows symlink privilege requirements. One checkout binds one project, including across different ports. Its ignored `.project-binding.json` records the explicitly selected root and source layout; missing, damaged or mismatched binding requires reopening with an explicit video root. Save browser edits before switching. `node scripts/open.mjs --stop` only stops the recorded, identity-verified server; active renders block switching/stopping.

**Save project** writes `<video-root>/workbench.project.json` for both source layouts. Assets belong in `<video-root>/public/`, exports in `<video-root>/exports/`, and the manifest in the selected source directory. The previous save is retained as `.previous`. Stale saves fail with a conflict; use Export JSON to retain browser edits and Reload disk to reconcile. Changed manifests never automatically replace saved montage. Keep stable card IDs; missing definitions fail explicitly instead of silently dropping scenes. LocalStorage is project-specific but is not the authoritative file.

**Export video** renders the current browser snapshot, which may include unsaved edits. Save as well to preserve the next working state. Outputs and provenance JSON live in the project's `exports/`. Source root assets are served live; export stages current source assets with the tool's libraries. Reopen after adding media to regenerate the library index. Rendering uses `Main` with `renderExact: true`; the preview includes an extra tail second. Container audio padding may make the measured container duration slightly longer than exact video frames.

Remotion Studio remains useful for component debugging. Its manifest-based compositions are not an independent authoritative copy of manually edited montage. Render `Main` with the saved project JSON when reproducing that montage.

## Verification

From `workbench`: `node --test scripts/check-*.mjs`, then `npm run build`. Root `npm test` runs upstream tests. These checks cover platform generation, foreign-port refusal and persisted montage conflicts/validation. End-to-end acceptance also exercised paths with spaces, A/B/A switching, browser timing/easing edits, stale-file refusal, missing-card export failure, fresh source assets and 10-minute horizontal / 60-second vertical synthetic MP4s at 30 fps. This is not coverage of every gallery card, operating system or production workload.

## Data, updates and licenses

Keep footage, private recipes and personal profiles in target projects or a private preferences directory, outside this public fork. Update manually through `upstream`, inspect changes, test a saved montage and representative export before adoption, and retain the prior known-good commit. Do not update or relink during a render. Tool commit and dirty state accompany new exports; preserve source/recipe revisions in the target project too.

The repository's Apache license does not replace third-party asset/dependency terms. See [audio attribution](assets/audio/ATTRIBUTION.md) and [shot attribution](references/shots/ATTRIBUTION.md); some audio sources remain unresolved. QA used a generated tone, not licensed-library clearance. Check the selected media and Remotion license for the actual use.

Fork integration date: 02-10-2026.

Interrupted exports retain their stage ownership record for recovery on the next start. Cleanup accepts only the recorded, marked snapshot inside this checkout staging root; live jobs and unverified paths are preserved. Missing/corrupt asset ledgers block rebinding when ownership cannot be established.

Launchers take an exclusive checkout lease before inspecting or changing bindings. Normal exits release it. After a killed process, inspect `.launcher-lock.json` and verify its recorded PID is no longer running before removing that specific stale lock; do not remove a live or unknown owner's lock.

An old v1 browser timeline is offered for recovery only when no saved disk/project-specific timeline exists, with confirmation because v1 lacks project identity. The original remains available through **Legacy JSON**, including if recovery is declined. Reveal-command failures return an API error instead of terminating the server.
A failed switch after server shutdown leaves the server stopped. It removes newly created root-file copies and clears ownership of the previous removed copies, so a file/directory name change cannot strand an old ledger entry. Project sources and saved montage are preserved. Fix the reported source/disk problem, then rerun `open.mjs <video-root>` for the previous or intended project. Automatic restoration of the previous running server is outside this launcher contract.