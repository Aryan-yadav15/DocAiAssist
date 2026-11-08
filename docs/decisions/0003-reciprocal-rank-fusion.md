# 0003 · Merge keyword and vector results with reciprocal rank fusion

- **Status:** accepted
- **Date:** 2025-10-29 (present since the first commit)

## Context

Search combines two signals: an exact keyword match (good for API names such as `server.proxy`) and semantic
similarity (good for questions). Their scores aren't comparable: the keyword side has only a list position, and the
vector side has a cosine value.

## Decision

Fuse by rank, not score: every result adds `1 / (60 + rank + 1)` to its chunk's total, and chunks found by both lists add
both terms ([`searchEngine.ts:116`](../../src/search/searchEngine.ts#L116)). Each side contributes up to 2N candidates for
N final results.

## Consequences

- No score normalisation or tuning, and a chunk that both methods agree on wins.
- The keyword side is a single SQL `LIKE '%query%'` on the full query
  ([`storageEngine.ts:188`](../../src/storage/storageEngine.ts#L188)), so for multi-word questions it's usually empty and
  ranking is pure vector. The planned BM25 (a `natural` TF-IDF index is built in `buildIndex`) is never queried. That is the
  obvious next improvement.
- The vector side is a brute-force scan over every stored embedding (see [0001](0001-sqljs-instead-of-native-sqlite.md)).
