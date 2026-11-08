# 0001 · sql.js instead of a native SQLite binding

- **Status:** accepted
- **Date:** 2025-11-15 (commit `9635735`; the first commit, `8e73977`, is titled "initial without sqlite")

## Context

A VS Code extension runs in VS Code's Electron build of Node. Native modules such as `better-sqlite3` must be compiled
against that exact Electron ABI, and every VS Code update can break them. The original plan
([planning/mvp-product-roadmap.md](../planning/mvp-product-roadmap.md)) and the first architecture doc named
better-sqlite3 and sqlite-vss; `@types/better-sqlite3` is still in `devDependencies`.

## Decision

Use **sql.js**, SQLite compiled to WebAssembly, loaded with `initSqlJs` and a `locateFile` that finds `sql-wasm.wasm` next to
the bundle ([`storageEngine.ts:28`](../../src/storage/storageEngine.ts#L28)). The build copies the WASM file into `dist/`
(`copy-wasm` script). Vectors are stored as JSON text and compared in JavaScript.

## Consequences

- Works on every platform and VS Code version without a rebuild.
- The whole database is held in memory and written out in full on each `save()`, so large indexes cost RAM and save time.
- No vector index: similarity search is a full scan (see [0003](0003-reciprocal-rank-fusion.md)).
- `PRAGMA foreign_keys` is off by default, so `ON DELETE CASCADE` does nothing; deletes must be explicit
  ([`storageEngine.ts:262`](../../src/storage/storageEngine.ts#L262)).
- Revisit if indexes grow past tens of thousands of chunks: storing `Float32Array` blobs, or a WASM vector extension.
