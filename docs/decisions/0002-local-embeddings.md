# 0002 · Embeddings run locally with Transformers.js

- **Status:** accepted
- **Date:** 2025-10-29 (present since the first commit)

## Context

The extension's point is to give an assistant current documentation without extra setup. A hosted embeddings API would
need a key, cost money per page, and send the documentation text (and every query) to a provider.

## Decision

Run `Xenova/all-MiniLM-L6-v2` with `@xenova/transformers` (ONNX Runtime) inside the extension host:
`pipeline('feature-extraction', …)` with mean pooling and normalisation
([`embeddingsEngine.ts:26`](../../src/embeddings/embeddingsEngine.ts#L26)). The model is downloaded once (quantized,
about 23 MB) and cached by Transformers.js.

## Consequences

- No API key, no per-query cost, and queries never leave the machine.
- 384-dimensional vectors. Transformers.js truncates each input at the tokenizer's `model_max_length` of 512 tokens, so
  the chunker's 512-*estimated*-token default (characters ÷ 4) sits right at the limit, and dense code or symbols can
  run past it and be cut off.
- Embedding is CPU-bound and done one chunk at a time, which dominates indexing time.
- The `docrag.embeddingModel` setting exists but is not passed to the engine
  ([`extension.ts:45`](../../src/extension.ts#L45)). Wiring it in also means re-indexing, because vectors from
  different models can't be compared.
