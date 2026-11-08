<!-- Cards are generated from docs/assets/cards.json with repo-polish (tools/cards/cards.py). Regenerate after editing it. -->

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/hero-dark.svg"/>
  <img src="docs/assets/hero-light.svg" width="100%" alt="DocRAG. Index the docs. Search them from VS Code. A VS Code extension that crawls a library's documentation, embeds it on your machine, and serves hybrid search to you and to Copilot. Example: 'how do I proxy API requests to my backend' against 41 Vite chunks returns Server Options first."/>
</picture>

<p align="center">
  <a href="#-see-it-work"><b>Demo</b></a> &nbsp;·&nbsp;
  <a href="#-how-it-works"><b>Architecture</b></a> &nbsp;·&nbsp;
  <a href="#-run-it"><b>Run it</b></a> &nbsp;·&nbsp;
  <a href="docs/"><b>Docs</b></a> &nbsp;·&nbsp;
  <a href="#-whats-next"><b>What's next</b></a>
</p>

DocRAG is a VS Code extension for giving a coding assistant documentation newer than its training data. Point it at a
library's docs URL. It finds the pages, splits them into chunks, embeds them locally with `all-MiniLM-L6-v2`, and stores
everything in a SQLite file in VS Code's storage. You can then search from the command palette, and Copilot chat can
call it as the `#docrag` tool.

**Why it exists:** AI coding assistants keep suggesting deprecated APIs for fast-moving libraries because their training data is months or years old. DocRAG was built to feed them the current docs instead ([original MVP plan](docs/planning/mvp-product-roadmap.md)).

## ▸ See it work

<p align="center">
  <img src="docs/demo.gif" width="760" alt="In VS Code, the command palette runs 'DocRAG: Index Documentation' and picks Vite; a notification shows the indexing progress and the status bar goes from 0 chunks to 41 chunks. Then 'DocRAG: Search Documentation' is run with 'how do I proxy API requests to my backend', and a list of results appears with Server Options first."/>
</p>
<p align="center"><sub>Real run in VS Code 1.145.2 against Vite's 8 config pages (<code>https://vite.dev/config</code>) · indexing is sped up 8× and the search wait 3×</sub></p>

What you can do:

- **Index a library's docs** — `DocRAG: Index Documentation` takes any `{ name, url }` from settings. If the site has a
  `sitemap.xml`, only pages under that URL are indexed; otherwise links are crawled up to 3 levels deep.
- **Search them** — `DocRAG: Search Documentation` runs keyword and vector search, fuses the rankings, and opens the
  page you pick.
- **Give Copilot current docs** — the `docrag-search` language-model tool (`#docrag` in chat) returns the top 3 chunks
  with their source URLs.
- **Keep it local** — no API key. Network traffic is limited to fetching the docs pages and a one-time ~23 MB model
  download.

## ▸ How it works

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/architecture-dark.svg"/>
  <img src="docs/assets/architecture-light.svg" width="100%" alt="Architecture: the command palette and Copilot chat call extension.ts in the VS Code extension host, which drives DiscoveryEngine (sitemap or crawl), ScraperEngine (cheerio), EmbeddingsEngine (MiniLM-L6-v2) and SearchEngine (LIKE + cosine, RRF). Data lives in the docs website, a Hugging Face model downloaded once, and docrag.db (sql.js) holding chunks and vectors."/>
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/flow-dark.svg"/>
  <img src="docs/assets/flow-light.svg" width="100%" alt="Six steps: Discover (sitemap.xml first, else crawl 3 levels deep), Scrape (main/article text, nav and footer removed), Chunk (~512 tokens with 50-token overlap), Embed (MiniLM-L6-v2 locally, 384-d vectors), Store (sql.js SQLite in global storage), Search (keyword + cosine, fused with RRF)."/>
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/decisions-dark.svg"/>
  <img src="docs/assets/decisions-light.svg" width="100%" alt="Decisions: sql.js instead of native SQLite, so no native rebuild per Electron version; embeddings run locally with Transformers.js, so no API key; reciprocal rank fusion, because keyword and vector scores aren't comparable; sitemap before crawling, keeping only URLs under the configured one."/>
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/editor-dark.svg"/>
  <img src="docs/assets/editor-light.svg" width="100%" alt="Code from src/search/searchEngine.ts lines 121 to 140: with k = 60, each keyword and vector result adds 1 / (k + index + 1) to its chunk's score; a chunk found by both lists gets both terms."/>
</picture>

<details>
<summary><b>Search request sequence (detailed)</b></summary>

```mermaid
sequenceDiagram
    participant C as Developer / Copilot
    participant E as extension.ts / copilotIntegration.ts
    participant S as SearchEngine
    participant M as EmbeddingsEngine
    participant D as StorageEngine (sql.js)
    C->>E: query
    E->>S: search(query, no library, N)
    S->>D: text LIKE '%query%' (limit 2N)
    D-->>S: exact-substring hits
    S->>M: embed(query)
    M-->>S: 384-d vector
    S->>D: getAllEmbeddings()
    D-->>S: every stored vector
    Note over S: cosine similarity, keep top 2N
    S->>D: getChunkById × 2N
    D-->>S: chunks
    Note over S: RRF: score += 1/(60 + rank + 1)
    S-->>E: top N
    E-->>C: QuickPick (N=10) or Markdown context (N=3)
```

More in [docs/architecture.md](docs/architecture.md), including an interactive version of this diagram and the indexing
sequence.

</details>

## ▸ Built with

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/stack-dark.svg"/>
  <img src="docs/assets/stack-light.svg" width="100%" alt="Stack. Extension: TypeScript, VS Code API, webpack. Retrieval: Transformers.js, all-MiniLM-L6-v2, ONNX Runtime. Data: sql.js (SQLite), cheerio, node-fetch."/>
</picture>

## ▸ Run it

You need Node.js and npm to build (tested with Node 24.16.0 and npm 11.13.0) and VS Code **1.95 or newer** to run it
(tested with 1.145.2). GitHub Copilot Chat is optional and only needed for the `#docrag` tool.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/assets/terminal-dark.svg"/>
  <img src="docs/assets/terminal-light.svg" width="100%" alt="Terminal: npm ci installs 496 packages, npm run compile builds with webpack 5.102.1 and copies the sql.js WASM file; then press F5 in VS Code to run the extension."/>
</picture>

**Build**

```bash
git clone https://github.com/Aryan-yadav15/DocAiAssist.git
cd DocAiAssist
npm ci
npm run compile
```

**Run:** open the folder in VS Code and press **F5** (**Run Extension**). In the Extension Development Host window, add
a library to your user `settings.json`:

```json
{
  "docrag.libraries": [
    { "name": "Vite", "url": "https://vite.dev/config" }
  ]
}
```

Then run **DocRAG: Index Documentation** → **Vite**, and **DocRAG: Search Documentation**. Settings, data locations and
troubleshooting are in [docs/setup.md](docs/setup.md).

<details>
<summary><b>Project structure</b></summary>

```
src/
  extension.ts                       activation, commands, indexing pipeline, status bar
  types.ts                           shared interfaces
  discovery/discoveryEngine.ts       sitemap.xml + fallback crawler
  scraper/scraperEngine.ts           fetch + cheerio text extraction
  chunking/chunkingEngine.ts         chunking with overlap
  embeddings/embeddingsEngine.ts     Transformers.js MiniLM embeddings
  storage/storageEngine.ts           sql.js SQLite: chunks, embeddings, libraries
  search/searchEngine.ts             keyword + vector search, RRF
  integration/copilotIntegration.ts  docrag-search language-model tool
docs/                                architecture, codebase, setup, api, data, testing, ADRs, planning
```

</details>

## ▸ What's next

- **Real keyword search.** The keyword half is one SQL `LIKE '%query%'`, so multi-word questions rely entirely on vectors.
  The BM25/TF-IDF the original plan describes isn't implemented (a `natural` index is built but never queried). SQLite FTS5
  or querying that TF-IDF index would fix it.
- **Keep page structure when scraping.** The scraper collapses all whitespace, so headings and paragraphs are lost before
  chunking. Chunks are now cut at sentence boundaries instead (fixed in this pass), but splitting on headings would give
  better chunks.
- **Wire up two settings.** `docrag.embeddingModel` and `docrag.maxSearchResults` are read but ignored, and
  `docrag.enableCopilotIntegration` only toggles a "proactive" search that logs and does nothing else.
- **Tests and lint.** `npm test` and `npm run lint` are defined, but there are no tests and no ESLint config. The engines
  are plain Node classes and easy to unit-test ([docs/testing.md](docs/testing.md)).
- **Scale.** Pages are fetched and embedded one at a time, vector search scans every stored vector (parsed from JSON on
  each query), and sql.js keeps the whole database in memory. Fine for a few thousand chunks; it needs batching and a
  vector index beyond that.
- **Polite crawling.** No rate limiting, no `robots.txt` handling, no page cap beyond depth 3 × 50 links, and sitemap
  index files aren't followed.
- **Copilot tool verified end to end.** The tool now registers correctly, but calling it from a signed-in Copilot session
  hasn't been tested.
- **Dependency audit.** `npm ci` reports 31 known vulnerabilities in the dependency tree (21 high, 1 critical); they haven't
  been triaged.

<sub>Full documentation: [docs/](docs/): [architecture](docs/architecture.md) · [codebase](docs/codebase.md) · [setup](docs/setup.md) · [commands & Copilot tool](docs/api.md) · [data](docs/data.md)</sub>
