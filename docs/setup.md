# Setup

## Requirements

| Tool | Version (tested) | Notes |
|---|---|---|
| Node.js | 24.16.0 | only for building; the extension runs on VS Code's bundled Node |
| npm | 11.13.0 | |
| VS Code | 1.145.2 | `engines.vscode` is `^1.95.0`, the first release with `vscode.lm.registerTool` |
| GitHub Copilot Chat | optional | only needed to use the `#docrag` tool from chat |

The first indexing run downloads `Xenova/all-MiniLM-L6-v2` (quantized ONNX, about 23 MB) from Hugging Face.

## Build and run

```bash
git clone https://github.com/Aryan-yadav15/DocAiAssist.git
cd DocAiAssist
npm ci
npm run compile
```

Then open the folder in VS Code and press **F5** (the **Run Extension** configuration in `.vscode/launch.json`). An
**Extension Development Host** window opens with DocRAG loaded; the status bar shows `DocRAG: 0 chunks`.

For a rebuild-on-save loop, run this in its own terminal instead of `npm run compile`:

```bash
npm run watch
```

`npm run watch` runs webpack only. It doesn't copy `sql-wasm.wasm`, so run `npm run compile` once first.

## Configure a library

In the Extension Development Host, open **Preferences: Open User Settings (JSON)** and add a library. This is the setup
used for the README demo:

```json
{
  "docrag.libraries": [
    { "name": "Vite", "url": "https://vite.dev/config" }
  ]
}
```

Then run **DocRAG: Index Documentation**, pick the library, and when it finishes run **DocRAG: Search Documentation**.

Pick the URL with the [discovery rules](architecture.md#main-flow-what-happens-when-you-index-a-library) in mind: if the
site has a `sitemap.xml`, only sitemap URLs that **start with** your URL are indexed, so `https://vite.dev/config` gives
the 8 config pages. The URL must use the same host as the sitemap entries: `https://vitejs.dev/...` matches no sitemap entry and falls back
to crawling. The crawler follows links up to 3 levels deep, which can mean hundreds of pages.

## Settings

DocRAG reads no environment variables. All configuration is VS Code settings, declared in
[`package.json`](../package.json) and read in `getConfig` ([`extension.ts:323`](../src/extension.ts#L323)).

| Setting | Default | Purpose | Used? |
|---|---|---|---|
| `docrag.libraries` | `[]` | `{ name, url }` entries offered by Index Documentation | yes |
| `docrag.chunkSize` | `512` | target chunk size in estimated tokens (chars ÷ 4) | yes, at index time |
| `docrag.chunkOverlap` | `50` | overlap between consecutive chunks, in estimated tokens | yes, at index time |
| `docrag.enableCopilotIntegration` | `true` | toggles the editor-change "proactive" search, which only logs | partly: the `docrag-search` tool stays registered either way, and the value is only applied after a settings change |
| `docrag.maxSearchResults` | `5` | intended result count | **no**: the command uses 10, the Copilot tool 3 |
| `docrag.embeddingModel` | `Xenova/all-MiniLM-L6-v2` | intended model id | **no**: the engine always uses the default ([`extension.ts:45`](../src/extension.ts#L45)) |

## Where data lives

| What | Location |
|---|---|
| index database | `<VS Code globalStorage>/docrag.docrag/docrag.db`, e.g. `~/Library/Application Support/Code/User/globalStorage/docrag.docrag/docrag.db` on macOS, `%APPDATA%\Code\User\globalStorage\docrag.docrag\docrag.db` on Windows |
| model cache | `node_modules/@xenova/transformers/.cache/` (Transformers.js default, next to the extension) |

Delete `docrag.db` to reset everything; **DocRAG: Clear Cache** removes only libraries still listed in your settings.

## Package a VSIX

Not done or tested during maintenance. `vscode:prepublish` runs `npm run package` (production webpack build + WASM copy).
`.vscodeignore` leaves `node_modules/` in the package, and it has to: `sql.js` and `@xenova/transformers` are webpack
externals loaded from there at runtime.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `Failed to scrape any pages` | no URLs discovered, or every page under 50 characters / blocked | check the URL host matches the site's sitemap; try a narrower docs URL |
| Search finds nothing for a phrase you can see in the docs | older builds dropped every vector result and only returned exact substring matches | rebuild from current `main` and re-index |
| `Tool "docrag-search" was not contributed` in the logs | old build without `contributes.languageModelTools` | rebuild; the declaration is in `package.json` |
| First index is slow at "Generating embeddings…" | one-time model download, then one chunk at a time on CPU | wait; later runs use the cache |
| `DocRAG failed to activate` mentioning `sql-wasm.wasm` | `dist/sql-wasm.wasm` missing | run `npm run compile` (not only `webpack`/`watch`) |
