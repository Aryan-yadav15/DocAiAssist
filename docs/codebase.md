# Codebase

```
src/
  extension.ts                 activation, commands, the indexing pipeline, status bar, settings
  types.ts                     shared interfaces: Library, DocumentationPage, TextChunk, SearchResult, ExtensionConfig
  discovery/discoveryEngine.ts sitemap.xml parsing and the fallback link crawler
  scraper/scraperEngine.ts     fetch + cheerio: title, main text, headers/code/links metadata
  chunking/chunkingEngine.ts   paragraph/sentence chunking with overlap
  embeddings/embeddingsEngine.ts  Transformers.js feature-extraction pipeline (MiniLM)
  storage/storageEngine.ts     sql.js database: schema, inserts, lookups, save to disk
  search/searchEngine.ts       keyword + vector search and reciprocal rank fusion
  integration/copilotIntegration.ts  the docrag-search language-model tool
package.json                   extension manifest: commands, settings, languageModelTools, scripts
webpack.config.js              bundles src/ into dist/extension.js; sql.js and Transformers.js stay external
.vscode/launch.json            "Run Extension" debug configuration (F5)
docs/                          these docs, README cards and diagrams
```

`dist/` (build output) and `node_modules/` are git-ignored. There is no `src/test/` folder yet, so `npm test` has nothing
to run.

## Entry points

| What | File |
|---|---|
| extension activation (`onStartupFinished`) | [`src/extension.ts:25`](../src/extension.ts#L25) |
| `DocRAG: Index Documentation` | [`src/extension.ts:85`](../src/extension.ts#L85) → `indexLibrary` at [`:125`](../src/extension.ts#L125) |
| `DocRAG: Search Documentation` | [`src/extension.ts:255`](../src/extension.ts#L255) |
| `DocRAG: Clear Cache` | [`src/extension.ts:302`](../src/extension.ts#L302) |
| Copilot tool `docrag-search` | [`src/integration/copilotIntegration.ts:24`](../src/integration/copilotIntegration.ts#L24); declared in [`package.json`](../package.json) under `contributes.languageModelTools` |
| build | `npm run compile` → webpack, then `copy-wasm` copies `sql-wasm.wasm` into `dist/` |

## Where to start

| To change… | Look at |
|---|---|
| which pages get indexed | [`discoveryEngine.ts`](../src/discovery/discoveryEngine.ts) — the sitemap prefix filter (line 49) and crawl selectors (line 90) |
| what text is extracted from a page | [`scraperEngine.ts`](../src/scraper/scraperEngine.ts) — removed selectors (line 25) and content selectors (line 88) |
| chunk size or splitting | [`chunkingEngine.ts`](../src/chunking/chunkingEngine.ts); defaults come from the `docrag.chunkSize` / `docrag.chunkOverlap` settings |
| the embedding model | [`embeddingsEngine.ts`](../src/embeddings/embeddingsEngine.ts) and where it's constructed, [`extension.ts:45`](../src/extension.ts#L45) (the `docrag.embeddingModel` setting is not wired in yet). The vector dimension is assumed to be 384 |
| ranking | [`searchEngine.ts`](../src/search/searchEngine.ts) — `keywordSearch`, `vectorSearch`, `fuseResults` |
| the schema | [`storageEngine.ts:61`](../src/storage/storageEngine.ts#L61) — see [data.md](data.md) |
| what Copilot receives | [`copilotIntegration.ts:42`](../src/integration/copilotIntegration.ts#L42) (format) and the tool's `modelDescription` / `inputSchema` in `package.json` |
| a new command or setting | `contributes` in `package.json`, then register it in `activate` / read it in `getConfig` ([`extension.ts:323`](../src/extension.ts#L323)) |

## Conventions

- Each engine is a class with no VS Code dependency except `extension.ts` and `copilotIntegration.ts`, so engines can be
  exercised from plain Node (that's how the chunker was checked during maintenance).
- Errors inside a page or chunk are caught, logged with `console.error`, and the item is skipped; only "no pages scraped"
  aborts an indexing run.
- Logging is `console.log` to the Extension Host output; there is no output channel.
- No linter config is committed: `npm run lint` expects an ESLint config that doesn't exist.
