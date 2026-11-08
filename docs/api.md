# Commands, settings and the Copilot tool

DocRAG has no HTTP API. Its surface is four VS Code commands, six settings ([setup.md](setup.md#settings)) and one
language-model tool. All are declared under `contributes` in [`package.json`](../package.json).

## Commands

| Command | ID | What it does | Code |
|---|---|---|---|
| DocRAG: Index Documentation | `docrag.indexDocumentation` | QuickPick of configured libraries (or "All Libraries"), then runs the indexing pipeline with a progress notification. If none are configured, offers to open settings. | [`extension.ts:85`](../src/extension.ts#L85) |
| DocRAG: Search Documentation | `docrag.searchDocumentation` | Input box → hybrid search over all libraries (10 results) → QuickPick of `title · library · first 100 chars`; selecting one opens the page URL in the browser. | [`extension.ts:255`](../src/extension.ts#L255) |
| DocRAG: Open Settings | `docrag.openSettings` | Opens the Settings UI filtered to `docrag`. Also the status-bar item's click action. | [`extension.ts:295`](../src/extension.ts#L295) |
| DocRAG: Clear Cache | `docrag.clearCache` | After a Yes/No warning, deletes the chunks and embeddings of every library **currently in `docrag.libraries`**. | [`extension.ts:302`](../src/extension.ts#L302) |

The status bar item (right side) shows `DocRAG: <n> chunks`, or `DocRAG: Indexing...` while a run is in progress;
its tooltip lists the indexed libraries ([`extension.ts:350`](../src/extension.ts#L350)).

## Language-model tool: `docrag-search`

Declared in `package.json` → `contributes.languageModelTools` and implemented in
[`copilotIntegration.ts:24`](../src/integration/copilotIntegration.ts#L24). In Copilot chat it can be referenced as
`#docrag` (`toolReferenceName`), and agent mode may call it on its own based on its `modelDescription`.

**Input** (`inputSchema`)

```json
{ "query": "how do I proxy API requests to my backend" }
```

**Output** — one `LanguageModelTextPart` header plus one part per result, top 3 by reciprocal rank fusion. The example below
was produced by running the extension's own `SearchEngine` against the Vite index from the [demo](../README.md#-see-it-work)
and applying the tool's formatting (`copilotIntegration.ts:45-58`); chunk text is truncated here with `…`:

```markdown
Here's relevant documentation context:

## Server Options ​
Source: https://vite.dev/config/server-options
Library: Vite

more details.Example:jsexport default defineConfig({ server: { open: '/docs/index.html', }, })server.proxy ​Type: Record<string, string | ProxyOptions>Configure custom proxy rules for the dev server.

Expects an object of { key: options } pairs. Any requests whose request path starts with that key will be proxied to the specified target. …

---

## Preview Options ​
Source: https://vite.dev/config/preview-options
Library: Vite

…

---

## Server Options ​
Source: https://vite.dev/config/server-options
Library: Vite

…

---
```

The odd spacing (`Example:jsexport`, the trailing `​` zero-width space in titles) is how the scraper flattens the page;
see [architecture.md → Known limits](architecture.md#known-limits).

| Case | Output |
|---|---|
| nothing indexed, or no hits | `No relevant documentation found.` |
| exception during search | `Error retrieving documentation: <error>` |

Calling the tool from a signed-in Copilot session was **not** verified during maintenance: the test VS Code had no
Copilot account. What was verified is that the tool now registers without the `Tool "docrag-search" was not contributed`
error.
