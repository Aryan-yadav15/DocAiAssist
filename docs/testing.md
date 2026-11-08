# Testing

There is no automated test suite yet. `package.json` defines `npm test` (→ `out/test/runTest.js`) and `npm run lint`,
but there is no `src/test/` folder and no ESLint config, so both fail. Until tests exist, check changes by hand in the
Extension Development Host as below. [What's next](../README.md#whats-next) lists adding tests.

## Manual check

1. `npm run compile`, then **F5** in VS Code. In the new window, the status bar shows `DocRAG: 0 chunks` and the command
   palette lists the four `DocRAG:` commands.
2. In user settings add a small library whose sitemap matches its URL:

   ```json
   { "docrag.libraries": [{ "name": "Vite", "url": "https://vite.dev/config" }] }
   ```

3. **DocRAG: Index Documentation** → **Vite**. Expect the notification to step through discovering, scraping, chunking,
   embedding and storing, then `Indexing completed!`. The status bar should read **`DocRAG: 41 chunks`** (Vite's config docs as
   of November 2026; the number changes if the docs do).
4. **DocRAG: Search Documentation** → `how do I proxy API requests to my backend`. The first result should be a
   **Server Options** chunk containing `server.proxy`. Natural-language queries depend on the vector half of the search;
   if you get "No results found" here, vector search is broken.
5. Run Index Documentation again. The count should stay at 41. To check that re-indexing left no orphaned embeddings,
   inspect the database with the command in [data.md](data.md#sample-data) and compare `chunks` with `embeddings` rows.
6. **DocRAG: Clear Cache** → **Yes**. The status bar returns to `0 chunks`.

## Logs

Open **Help → Toggle Developer Tools** in the Extension Development Host, or **Output → Extension Host**. On a healthy start
you'll see `DocRAG extension is now active` … `DocRAG extension initialized successfully`. During indexing:
`Found <n> URLs from sitemap`, `Scraped <n> pages for <library>`, `Created <n> chunks for <library>`,
`Valid chunks with embeddings: <n>/<n>`.

Any `Tool "docrag-search" was not contributed` error means `package.json` lost its `languageModelTools` entry.

## Testing an engine without VS Code

Every engine except `extension.ts` and `copilotIntegration.ts` is plain Node. Compile with `tsc` and require it directly:

```bash
npx tsc -p . --outDir out
node -e "const {ChunkingEngine}=require('./out/chunking/chunkingEngine.js'); const c=new ChunkingEngine(512,50).chunk({url:'u',title:'t',library:'L',metadata:{},content:'One sentence. '.repeat(1000)}); console.log(c.length, Math.max(...c.map(x=>x.text.length)))"
```

`out/` is git-ignored.

<details>
<summary>Corrections to the previous version of this page</summary>

- The suggested `https://vitejs.dev/guide/` URL never matches the sitemap, which lists `https://vite.dev/...` URLs, so
  discovery falls back to the slower crawler. Use `https://vite.dev/...`.
- Expected chunk counts, timings and database sizes were estimates. Measured values are above and in [data.md](data.md).
- `Commands registered` was listed as an expected log line; the extension never logs it.
- `npm test` was listed as the way to run tests; there are no tests for it to run.

</details>
