# Decisions

Short records of why DocRAG is built the way it is. They were written during the 2026-11 maintenance pass from the code
and git history; the original author's reasoning may have differed.

| # | Decision |
|---|---|
| [0001](0001-sqljs-instead-of-native-sqlite.md) | sql.js instead of a native SQLite binding |
| [0002](0002-local-embeddings.md) | Embeddings run locally with Transformers.js |
| [0003](0003-reciprocal-rank-fusion.md) | Merge keyword and vector results with reciprocal rank fusion |
| [0004](0004-sitemap-first-discovery.md) | Discover pages from sitemap.xml before crawling |
