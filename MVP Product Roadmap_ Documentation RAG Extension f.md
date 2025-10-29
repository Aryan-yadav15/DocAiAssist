
# MVP Product Roadmap: Documentation RAG Extension for VS Code

## Product Overview

### What We're Building

A VS Code extension that vectorizes documentation from any library (LangChain, React, FastAPI, etc.) to provide GitHub Copilot with up-to-date context, solving the problem of outdated API suggestions caused by Copilot's training data cutoff.

### Core Value Proposition

When developers paste a documentation URL, the extension automatically discovers all pages, creates embeddings locally, and registers as a VS Code Language Model tool that Copilot queries in real-time to generate code using the latest API versions.

### Target User

Developers frustrated with AI coding assistants suggesting deprecated syntax, particularly for rapidly evolving libraries where the assistant's training data is 1-3 years outdated.[^1][^2][^3]

***

## Technical Architecture

### Technology Stack

**Extension Core**

- **Language**: TypeScript (required for VS Code Extension API)
- **Runtime**: Node.js (bundled with VS Code)
- **Extension Framework**: VS Code Extension API v1.85+
- **Build Tool**: esbuild (faster than webpack)

**Embedding \& RAG**

- **Embedding Model**: all-MiniLM-L6-v2 (primary), E5-large-v2 (alternative)
    - Size: 23MB vs 300MB
    - Dimensions: 384 vs 1024
    - Quality trade-off: 15% lower accuracy but 10x faster
- **Embedding Runtime**: Transformers.js (@xenova/transformers v3.0+)
- **Vector Database**: SQLite + sqlite-vss extension
- **Full-Text Search**: SQLite FTS5 (for BM25)
- **Reranker**: bge-reranker-base (150MB, optional for MVP)

**Documentation Scraping**

- **Static Sites**: Cheerio v1.0+ (primary)
- **Dynamic Sites**: Puppeteer v21+ (fallback only)
- **XML Parsing**: xml2js v0.6+ (for sitemap.xml)
- **HTTP Client**: axios v1.6+

**Text Processing**

- **Chunking**: LangChain.js text splitters
- **Token Counting**: gpt-tokenizer (for accurate chunk sizing)
- **HTML Cleaning**: turndown (HTML to Markdown conversion)


### Key Technical Decisions

**Why all-MiniLM-L6-v2 over E5-large-v2?**

- 13x smaller download (23MB vs 300MB)
- 3-5x faster embedding generation
- Good enough quality for documentation retrieval (0.73 vs 0.78 retrieval accuracy)
- Easier user onboarding (faster first-time setup)
- Can upgrade to E5 in settings for power users

**Why SQLite over Chroma/FAISS?**

- Single-file storage (no separate server process)
- Built-in support for full-text search (BM25 via FTS5)
- Mature Node.js bindings (better-sqlite3)
- Hybrid search in single database
- 100k-1M vectors perform well (<50ms queries)

**Why Cheerio-first approach?**

- 90% of documentation sites are static HTML
- 100x faster than Puppeteer (no browser overhead)
- 2MB library vs 300MB Chrome binary
- Lower memory usage (10MB vs 200MB per scrape)
- Simpler error handling

***

## System Architecture

### High-Level Flow

```
User Input (URL)
    ↓
URL Detection & Validation
    ↓
Discovery Engine
├─ Try sitemap.xml (fast, complete)
├─ Try navigation extraction (medium, partial)
└─ Try recursive crawl (slow, complete)
    ↓
Documentation Scraper (Cheerio/Puppeteer)
    ↓
Content Preprocessing
├─ HTML → Markdown conversion
├─ Remove navigation/footer
└─ Extract main content
    ↓
Chunking Engine (Recursive, 512 tokens, 50 overlap)
    ↓
Embedding Generation (all-MiniLM-L6-v2)
    ↓
Storage Layer (SQLite + VSS)
├─ Vector embeddings
├─ Full-text index (FTS5)
└─ Metadata (URL, version, timestamp)
    ↓
VS Code Language Model API Registration
    ↓
Query Time:
User codes → Copilot queries → Extension retrieves → Hybrid search (BM25 + Vector) → Top 5 chunks → Copilot context → Better suggestions
```


### Data Flow

**Indexing Pipeline**

```typescript
DocURL → Discover Pages → Scrape HTML → Clean Content → 
Chunk Text → Generate Embeddings → Store in SQLite → 
Index with FTS5 → Update Metadata
```

**Retrieval Pipeline**

```typescript
Copilot Query → BM25 Search (top 50) → Vector Search (top 50) → 
Merge Results → Deduplicate → Rerank (optional) → 
Top 5 Chunks → Return to Copilot
```


***

## Core Components

### 1. Extension Entry Point (`extension.ts`)

**Responsibilities:**

- Register VS Code commands (`indexDocumentation`, `removeLibrary`, `viewIndexedLibraries`)
- Initialize Language Model tool registration
- Set up WebView panel for UI
- Handle extension lifecycle (activate/deactivate)
- Load configuration and persistent storage

**Key APIs Used:**

- `vscode.commands.registerCommand()` - User-triggered actions
- `vscode.lm.registerTool()` - Copilot integration
- `vscode.window.createWebviewPanel()` - UI rendering
- `vscode.ExtensionContext.globalState` - Persistent storage


### 2. Discovery Engine (`discovery/`)

**Responsibilities:**

- Auto-detect documentation structure from URL
- Find all related pages via sitemap/navigation/crawl
- Validate URLs and filter out non-documentation pages
- Handle pagination and multi-section docs

**Modules:**

- `sitemap-parser.ts` - Parse sitemap.xml files
- `navigation-extractor.ts` - Extract links from sidebars
- `recursive-crawler.ts` - Depth-first crawl with filters
- `url-validator.ts` - Check if URL is documentation

**Critical Logic:**

```typescript
async function discoverPages(url: string): Promise<string[]> {
  // Priority 1: Sitemap (fastest, most reliable)
  const sitemapUrls = await findSitemap(url);
  if (sitemapUrls.length > 0) return sitemapUrls;
  
  // Priority 2: Navigation (fast, partial)
  const navUrls = await extractNavigation(url);
  if (navUrls.length > 10) return navUrls;
  
  // Priority 3: Recursive crawl (slow, complete)
  return await recursiveCrawl(url, maxDepth: 5);
}
```


### 3. Scraper Engine (`scraper/`)

**Responsibilities:**

- Fetch HTML from URLs with rate limiting
- Handle retries and error recovery
- Detect if JavaScript rendering needed
- Extract main content and strip navigation/ads

**Modules:**

- `cheerio-scraper.ts` - Static HTML parsing (primary)
- `puppeteer-scraper.ts` - JavaScript-rendered pages (fallback)
- `content-extractor.ts` - Identify main documentation content
- `rate-limiter.ts` - Throttle requests to avoid blocking

**Content Cleaning Strategy:**

```typescript
function extractMainContent(html: string): string {
  const $ = cheerio.load(html);
  
  // Remove noise
  $('nav, header, footer, .sidebar, .ad').remove();
  
  // Extract main content (common selectors)
  const content = $('main, article, .content, .documentation').first();
  
  // Convert to Markdown for better chunking
  return turndown(content.html());
}
```


### 4. Chunking Engine (`chunking/`)

**Responsibilities:**

- Split documentation into optimal-sized chunks
- Preserve code blocks and structure
- Add overlap to prevent context loss
- Track chunk metadata (source URL, position)

**Implementation:**

```typescript
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 512,        // Tokens per chunk
  chunkOverlap: 50,      // 10% overlap
  separators: ['\n\n', '\n', ' ', ''],
  lengthFunction: (text) => encode(text).length // GPT tokenizer
});

interface Chunk {
  id: string;           // UUID
  content: string;      // Markdown text
  url: string;          // Source page
  library: string;      // e.g., "langchain"
  version: string;      // e.g., "0.3.0"
  tokens: number;       // Actual token count
  position: number;     // Chunk order in page
}
```


### 5. Embedding Engine (`embeddings/`)

**Responsibilities:**

- Load embedding model (cached locally)
- Generate vector embeddings for chunks
- Normalize vectors for cosine similarity
- Batch processing for efficiency

**Implementation:**

```typescript
import { pipeline } from '@xenova/transformers';

class EmbeddingEngine {
  private embedder: any;
  private modelName = 'Xenova/all-MiniLM-L6-v2';
  
  async initialize() {
    this.embedder = await pipeline('feature-extraction', this.modelName);
  }
  
  async embed(text: string): Promise<Float32Array> {
    const output = await this.embedder(text, {
      pooling: 'mean',
      normalize: true
    });
    return new Float32Array(output.data);
  }
  
  async embedBatch(texts: string[]): Promise<Float32Array[]> {
    // Process 32 chunks at a time for efficiency
    const batchSize = 32;
    const results = [];
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      results.push(...await Promise.all(batch.map(t => this.embed(t))));
    }
    return results;
  }
}
```


### 6. Storage Layer (`storage/`)

**Responsibilities:**

- Store embeddings and metadata in SQLite
- Create full-text search index (FTS5 for BM25)
- Manage vector similarity search (VSS)
- Handle CRUD operations for indexed docs

**Schema:**

```sql
-- Metadata table
CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  library TEXT NOT NULL,
  version TEXT,
  indexed_at INTEGER,
  content_hash TEXT
);

-- Chunks table
CREATE TABLE chunks (
  id TEXT PRIMARY KEY,
  doc_id TEXT REFERENCES documents(id),
  content TEXT NOT NULL,
  tokens INTEGER,
  position INTEGER,
  FOREIGN KEY(doc_id) REFERENCES documents(id) ON DELETE CASCADE
);

-- Vector embeddings (sqlite-vss)
CREATE VIRTUAL TABLE chunk_embeddings USING vss0(
  embedding(384)  -- all-MiniLM-L6-v2 dimensions
);

-- Full-text search index (BM25)
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content,
  content=chunks,
  content_rowid=rowid
);
```

**Storage Manager:**

```typescript
import Database from 'better-sqlite3';
import * as vss from 'sqlite-vss';

class StorageManager {
  private db: Database.Database;
  
  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    vss.load(this.db);
    this.initSchema();
  }
  
  insertChunk(chunk: Chunk, embedding: Float32Array) {
    const insertChunk = this.db.prepare(`
      INSERT INTO chunks (id, doc_id, content, tokens, position)
      VALUES (?, ?, ?, ?, ?)
    `);
    insertChunk.run(chunk.id, chunk.docId, chunk.content, chunk.tokens, chunk.position);
    
    // Store embedding
    const insertEmbedding = this.db.prepare(`
      INSERT INTO chunk_embeddings (rowid, embedding)
      VALUES ((SELECT rowid FROM chunks WHERE id = ?), ?)
    `);
    insertEmbedding.run(chunk.id, embedding);
  }
  
  vectorSearch(queryEmbedding: Float32Array, limit: number) {
    return this.db.prepare(`
      SELECT c.id, c.content, vss_distance(e.embedding, ?) as distance
      FROM chunk_embeddings e
      JOIN chunks c ON c.rowid = e.rowid
      WHERE vss_search(e.embedding, ?)
      LIMIT ?
    `).all(queryEmbedding, queryEmbedding, limit);
  }
  
  bm25Search(query: string, limit: number) {
    return this.db.prepare(`
      SELECT id, content, rank
      FROM chunks_fts
      WHERE chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(query, limit);
  }
}
```


### 7. Retrieval Engine (`retrieval/`)

**Responsibilities:**

- Implement hybrid search (BM25 + vector)
- Merge and deduplicate results
- Apply Reciprocal Rank Fusion (RRF)
- Return top-k most relevant chunks

**Hybrid Search Implementation:**

```typescript
class HybridRetriever {
  async retrieve(query: string, k: number = 5): Promise<Chunk[]> {
    // 1. BM25 search (keyword-based)
    const bm25Results = await this.storage.bm25Search(query, 50);
    
    // 2. Vector search (semantic)
    const queryEmbedding = await this.embedder.embed(query);
    const vectorResults = await this.storage.vectorSearch(queryEmbedding, 50);
    
    // 3. Merge using Reciprocal Rank Fusion
    const merged = this.reciprocalRankFusion([
      bm25Results,
      vectorResults
    ]);
    
    // 4. Return top-k
    return merged.slice(0, k);
  }
  
  reciprocalRankFusion(resultSets: any[][], k: number = 60): any[] {
    const scores = new Map<string, number>();
    
    for (const results of resultSets) {
      results.forEach((result, rank) => {
        const currentScore = scores.get(result.id) || 0;
        scores.set(result.id, currentScore + 1 / (k + rank + 1));
      });
    }
    
    // Sort by RRF score
    return Array.from(scores.entries())
      .sort((a, b) => b[^1] - a[^1])
      .map(([id]) => this.storage.getChunkById(id));
  }
}
```


### 8. Language Model Tool (`copilot-integration/`)

**Responsibilities:**

- Register as VS Code Language Model tool
- Handle queries from Copilot
- Format retrieved chunks for LLM context
- Track usage and performance

**Implementation:**

```typescript
import * as vscode from 'vscode';

async function registerCopilotTool(retriever: HybridRetriever) {
  const tool = vscode.lm.registerTool('documentation-context', {
    displayName: 'Documentation Context Provider',
    description: 'Provides up-to-date documentation context for coding',
    
    async invoke(request: vscode.LanguageModelToolInvocationRequest) {
      const query = request.input;
      
      // Retrieve relevant documentation
      const chunks = await retriever.retrieve(query, 5);
      
      // Format for LLM
      const context = chunks.map(chunk => 
        `From ${chunk.library} v${chunk.version}:\n${chunk.content}`
      ).join('\n\n---\n\n');
      
      return {
        content: context,
        metadata: {
          sources: chunks.map(c => c.url),
          library: chunks[^0]?.library
        }
      };
    }
  });
  
  return tool;
}
```


### 9. UI Layer (`webview/`)

**Responsibilities:**

- Display indexed libraries and status
- Accept new documentation URLs
- Show indexing progress
- Manage library versions

**Simple HTML UI (No React for MVP):**

```html
<!DOCTYPE html>
<html>
<body>
  <h2>Documentation Index</h2>
  
  <input type="url" id="docUrl" placeholder="https://langchain.com/docs/" />
  <button onclick="indexDocs()">Index Documentation</button>
  
  <div id="progress" style="display:none;">
    <progress id="progressBar" max="100"></progress>
    <span id="progressText"></span>
  </div>
  
  <h3>Indexed Libraries</h3>
  <ul id="libraries"></ul>
  
  <script>
    const vscode = acquireVsCodeApi();
    
    function indexDocs() {
      const url = document.getElementById('docUrl').value;
      vscode.postMessage({ command: 'index', url });
    }
    
    window.addEventListener('message', event => {
      const message = event.data;
      if (message.type === 'progress') {
        document.getElementById('progress').style.display = 'block';
        document.getElementById('progressBar').value = message.value;
        document.getElementById('progressText').textContent = message.text;
      }
    });
  </script>
</body>
</html>
```


***

## Project Folder Structure

```
docrag-vscode/
│
├── src/
│   ├── extension.ts              # Entry point, VS Code API registration
│   │
│   ├── discovery/
│   │   ├── index.ts              # Main discovery orchestrator
│   │   ├── sitemap-parser.ts    # Parse sitemap.xml
│   │   ├── navigation-extractor.ts  # Extract sidebar links
│   │   ├── recursive-crawler.ts # Depth-first crawling
│   │   └── url-validator.ts     # URL filtering and validation
│   │
│   ├── scraper/
│   │   ├── index.ts              # Scraper orchestrator
│   │   ├── cheerio-scraper.ts   # Static HTML scraping
│   │   ├── puppeteer-scraper.ts # JavaScript-rendered pages
│   │   ├── content-extractor.ts # Main content identification
│   │   └── rate-limiter.ts      # Request throttling
│   │
│   ├── chunking/
│   │   ├── index.ts              # Chunking orchestrator
│   │   ├── recursive-splitter.ts # LangChain integration
│   │   └── chunk-validator.ts   # Validate chunk quality
│   │
│   ├── embeddings/
│   │   ├── index.ts              # Embedding orchestrator
│   │   ├── model-loader.ts      # Transformers.js initialization
│   │   ├── batch-processor.ts   # Batch embedding generation
│   │   └── cache-manager.ts     # Cache embeddings temporarily
│   │
│   ├── storage/
│   │   ├── index.ts              # Storage orchestrator
│   │   ├── sqlite-manager.ts    # SQLite operations
│   │   ├── schema.sql            # Database schema
│   │   └── migrations/           # Schema version migrations
│   │       └── 001-initial.sql
│   │
│   ├── retrieval/
│   │   ├── index.ts              # Retrieval orchestrator
│   │   ├── hybrid-search.ts     # BM25 + vector search
│   │   ├── reranker.ts          # Optional reranking
│   │   └── rrf.ts               # Reciprocal Rank Fusion
│   │
│   ├── copilot-integration/
│   │   ├── tool-registration.ts # VS Code LM API
│   │   └── context-formatter.ts # Format chunks for LLM
│   │
│   ├── ui/
│   │   ├── webview-provider.ts  # WebView panel manager
│   │   └── webview.html         # UI template
│   │
│   ├── utils/
│   │   ├── logger.ts             # Logging utility
│   │   ├── config.ts             # Configuration management
│   │   └── version-detector.ts  # Detect library versions
│   │
│   └── types/
│       ├── chunk.ts              # Chunk interface
│       ├── document.ts           # Document interface
│       └── config.ts             # Configuration types
│
├── webview/                      # Optional: React UI (future)
│   ├── src/
│   │   ├── App.tsx
│   │   └── index.tsx
│   └── package.json
│
├── test/
│   ├── unit/
│   │   ├── discovery.test.ts
│   │   ├── chunking.test.ts
│   │   └── retrieval.test.ts
│   └── integration/
│       └── e2e.test.ts
│
├── resources/
│   ├── icon.png                  # Extension icon
│   └── demo.gif                  # Demo for marketplace
│
├── docs/
│   ├── README.md                 # User documentation
│   ├── ARCHITECTURE.md           # Technical architecture
│   └── CONTRIBUTING.md           # Contribution guidelines
│
├── .vscode/
│   ├── launch.json               # Debug configuration
│   └── tasks.json                # Build tasks
│
├── package.json                  # Extension manifest
├── tsconfig.json                 # TypeScript configuration
├── esbuild.js                    # Build script
├── .vscodeignore                 # Files to exclude from package
├── LICENSE                       # MIT license (required)
└── CHANGELOG.md                  # Version history
```


***

## Configuration \& Settings

### Extension Settings (`package.json` contribution)

```json
{
  "contributes": {
    "configuration": {
      "title": "DocRAG",
      "properties": {
        "docrag.embeddingModel": {
          "type": "string",
          "enum": ["all-MiniLM-L6-v2", "e5-large-v2"],
          "default": "all-MiniLM-L6-v2",
          "description": "Embedding model to use (smaller = faster, larger = better quality)"
        },
        "docrag.chunkSize": {
          "type": "number",
          "default": 512,
          "description": "Number of tokens per chunk"
        },
        "docrag.chunkOverlap": {
          "type": "number",
          "default": 50,
          "description": "Token overlap between chunks"
        },
        "docrag.maxStorageMB": {
          "type": "number",
          "default": 500,
          "description": "Maximum storage for indexed documentation (MB)"
        },
        "docrag.enableReranking": {
          "type": "boolean",
          "default": false,
          "description": "Enable reranking for better quality (slower)"
        }
      }
    }
  }
}
```


***

## Build \& Development

### Build Configuration (`esbuild.js`)

```javascript
const esbuild = require('esbuild');

const production = process.argv.includes('--production');

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'dist/extension.js',
    external: ['vscode'],
    logLevel: 'silent',
    plugins: [],
  });

  if (production) {
    await ctx.rebuild();
    await ctx.dispose();
  } else {
    await ctx.watch();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
```


### Package.json Scripts

```json
{
  "scripts": {
    "compile": "node esbuild.js",
    "watch": "node esbuild.js --watch",
    "package": "vsce package",
    "publish": "vsce publish",
    "test": "node ./out/test/runTest.js",
    "lint": "eslint src --ext ts"
  }
}
```


***

## Performance Targets

### Indexing Performance

- **Small library** (50 pages, FastAPI): <2 minutes
- **Medium library** (200 pages, LangChain): <10 minutes
- **Large library** (1000 pages, Python docs): <45 minutes


### Query Performance

- **Cold query** (first query after startup): <500ms
- **Warm query** (with caching): <100ms
- **Memory usage**: <100MB baseline, +200MB during indexing


### Storage Efficiency

- **Per chunk**: ~5KB (embedding + metadata + content)
- **200-page library**: ~50MB total
- **Compression**: SQLite VACUUM after indexing

***

## Error Handling Strategy

### Graceful Degradation

```typescript
// Try best approach first, fall back gracefully
async function indexDocumentation(url: string) {
  try {
    // Try sitemap
    const pages = await findSitemap(url);
    if (pages.length > 0) return await indexPages(pages);
  } catch (error) {
    logger.warn('Sitemap parsing failed, trying navigation');
  }
  
  try {
    // Try navigation extraction
    const pages = await extractNavigation(url);
    if (pages.length > 0) return await indexPages(pages);
  } catch (error) {
    logger.warn('Navigation extraction failed, trying recursive crawl');
  }
  
  try {
    // Last resort: recursive crawl
    return await recursiveCrawl(url);
  } catch (error) {
    vscode.window.showErrorMessage('Failed to index documentation: ' + error.message);
    throw error;
  }
}
```


### User-Facing Errors

```typescript
enum ErrorType {
  NETWORK_ERROR = 'Cannot reach documentation site',
  AUTH_REQUIRED = 'This site requires authentication',
  JAVASCRIPT_REQUIRED = 'This site needs JavaScript (try enabling browser mode)',
  RATE_LIMITED = 'Too many requests, please wait',
  STORAGE_FULL = 'Storage limit reached, remove old libraries'
}
```


***

## Testing Strategy

### Unit Tests

- Discovery: Test sitemap parsing, URL validation
- Chunking: Test token counting, overlap logic
- Retrieval: Test BM25 + vector search, RRF


### Integration Tests

- End-to-end: Index FastAPI docs → query → verify results
- Benchmark against known queries with expected results


### Test Documentation Sites

1. **FastAPI** (small, well-structured, has sitemap)
2. **LangChain** (medium, complex navigation, JS-heavy)
3. **Python Docs** (large, excellent structure, has sitemap)

***

## Security \& Privacy

### Data Storage

- All data stored locally in VS Code's global storage path
- No external API calls (except optional E5 model download)
- User code never leaves their machine


### Content Scraping

- Respect robots.txt
- Rate limit to 1 request per 100ms
- User-Agent identifies as VS Code extension

***

## MVP Success Criteria

**Functional Requirements:**

- ✅ Index documentation from URL input
- ✅ Auto-discover all pages via sitemap/navigation
- ✅ Generate embeddings locally (all-MiniLM-L6-v2)
- ✅ Store in SQLite with vector search
- ✅ Register as VS Code Language Model tool
- ✅ Copilot queries extension and gets relevant chunks
- ✅ Hybrid search (BM25 + vector) for retrieval

**Quality Metrics:**

- ✅ Retrieval accuracy >70% (measured against manual test queries)
- ✅ Query latency <500ms
- ✅ Successfully indexes 3/3 test sites (FastAPI, LangChain, Python)
- ✅ Extension size <50MB (excluding model cache)
- ✅ No crashes during 100 consecutive queries

**User Experience:**

- ✅ One-click indexing from URL paste
- ✅ Progress indicator during indexing
- ✅ List of indexed libraries with versions
- ✅ Clear error messages for failures

