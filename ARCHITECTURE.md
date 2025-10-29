# DocRAG Architecture Documentation

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         VS Code Extension                        │
│                         (extension.ts)                           │
│                                                                   │
│  Commands: Index, Search, Settings, Clear Cache                  │
│  Status Bar: Shows indexed chunk count                          │
│  Progress: Real-time indexing notifications                     │
└────────────┬─────────────────────────────────────┬──────────────┘
             │                                     │
             ▼                                     ▼
┌────────────────────────┐            ┌─────────────────────────┐
│   Indexing Pipeline    │            │   Search & Integration  │
└────────────────────────┘            └─────────────────────────┘
             │                                     │
             │                                     │
    ┌────────┴────────┐                    ┌──────┴──────┐
    ▼                 ▼                    ▼             ▼
┌─────────┐     ┌──────────┐      ┌───────────┐  ┌─────────────┐
│Discovery│────▶│ Scraper  │      │  Search   │  │  Copilot    │
│ Engine  │     │  Engine  │      │  Engine   │  │ Integration │
└─────────┘     └────┬─────┘      └─────┬─────┘  └──────┬──────┘
                     │                   │               │
                     ▼                   ▼               │
              ┌──────────┐        ┌─────────────┐       │
              │ Chunking │        │ Embeddings  │       │
              │  Engine  │        │   Engine    │       │
              └────┬─────┘        └──────┬──────┘       │
                   │                     │               │
                   └──────────┬──────────┘               │
                              ▼                          │
                      ┌───────────────┐                  │
                      │    Storage    │◀─────────────────┘
                      │    Engine     │
                      │   (SQLite)    │
                      └───────────────┘
```

## 📦 Module Breakdown

### 1. Extension Entry Point (`extension.ts`)

**Purpose:** Main extension lifecycle management

**Responsibilities:**
- Extension activation/deactivation
- Command registration
- Status bar management
- Configuration handling
- Orchestrates the indexing pipeline

**Key Functions:**
```typescript
activate(context)       // Extension startup
indexDocumentation()    // Trigger indexing
searchDocumentation()   // Trigger search
openSettings()          // Open config
clearCache()           // Clear data
deactivate()           // Cleanup
```

### 2. Discovery Engine (`discovery/discoveryEngine.ts`)

**Purpose:** Discover all documentation pages from a base URL

**Strategies:**
1. **Sitemap.xml parsing** (preferred, fast)
2. **Web crawling** (fallback, slower)

**Features:**
- Automatic sitemap detection
- Recursive link crawling
- Visited URL tracking
- Depth limiting (max 3 levels)
- URL filtering and normalization

**Flow:**
```
Input: Base URL (e.g., https://react.dev)
  ↓
Try sitemap.xml first
  ↓
If found: Parse XML, extract URLs
  ↓
If not: Crawl navigation/content links
  ↓
Output: Array of documentation URLs
```

### 3. Scraper Engine (`scraper/scraperEngine.ts`)

**Purpose:** Extract clean content from HTML pages

**Process:**
1. Fetch HTML from URL
2. Load into Cheerio parser
3. Remove unwanted elements (nav, footer, ads)
4. Extract title (h1, title tag, og:title)
5. Extract main content (article, main, .content)
6. Extract metadata (headers, code blocks, links)
7. Clean and normalize text

**Content Selection Priority:**
```
main > article > .content > .documentation > body
```

### 4. Chunking Engine (`chunking/chunkingEngine.ts`)

**Purpose:** Split documentation into optimal-sized chunks

**Strategy:**
- Target: 512 tokens per chunk (~2048 characters)
- Overlap: 50 tokens (~200 characters)
- Split at paragraph boundaries
- Preserve semantic coherence

**Algorithm:**
```
1. Split text into paragraphs
2. Build chunks up to 512 tokens
3. When limit reached:
   - Save current chunk
   - Take last 50 tokens as overlap
   - Start new chunk with overlap
4. Attach metadata (title, URL, index)
```

**Benefits:**
- Maintains context across chunks
- Optimal for embedding models
- Prevents splitting mid-sentence

### 5. Embeddings Engine (`embeddings/embeddingsEngine.ts`)

**Purpose:** Generate vector embeddings for semantic search

**Model:** `Xenova/all-MiniLM-L6-v2`
- Dimensions: 384
- Fast inference (~50ms per text)
- Runs locally (no API calls)
- First run downloads model (~90MB)

**Process:**
```typescript
1. Initialize model (once)
2. For each text chunk:
   - Tokenize text
   - Pass through model
   - Apply mean pooling
   - Normalize vector
   - Output: float32[384]
```

**Optimizations:**
- Batch processing (32 chunks at a time)
- Model caching
- Progress logging every 100 chunks

### 6. Storage Engine (`storage/storageEngine.ts`)

**Purpose:** Persist chunks and embeddings in SQLite

**Schema:**
```sql
-- Text chunks
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY,
  text TEXT NOT NULL,
  page_url TEXT NOT NULL,
  library TEXT NOT NULL,
  title TEXT NOT NULL,
  section TEXT,
  chunk_index INTEGER,
  created_at TIMESTAMP
);

-- Vector embeddings (384 dimensions)
CREATE TABLE embeddings (
  chunk_id INTEGER PRIMARY KEY,
  embedding BLOB NOT NULL,  -- Float32Array as Buffer
  FOREIGN KEY (chunk_id) REFERENCES chunks(id)
);

-- Library metadata
CREATE TABLE libraries (
  name TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  last_indexed TIMESTAMP,
  status TEXT  -- pending, indexing, completed, error
);
```

**Features:**
- WAL mode for concurrency
- Foreign key constraints
- Indexed lookups by library/URL
- Efficient blob storage for embeddings

### 7. Search Engine (`search/searchEngine.ts`)

**Purpose:** Hybrid search combining keyword and semantic search

**Approach:** Reciprocal Rank Fusion (RRF)

#### Keyword Search (BM25)
- TF-IDF scoring
- Fast text matching
- Good for exact terms

#### Vector Search
- Cosine similarity
- Semantic understanding
- Good for concepts

#### Fusion Algorithm
```typescript
// For each result at rank R:
score = 1 / (k + R)  // k = 60 (RRF constant)

// Combine scores from both methods:
final_score = keyword_score + vector_score

// Sort by final_score
```

**Benefits:**
- Best of both worlds
- Robust to query variations
- Better than either alone

### 8. Copilot Integration (`integration/copilotIntegration.ts`)

**Purpose:** Provide documentation context to GitHub Copilot

**Integration Method:** Language Model Tool API

**Workflow:**
```
1. Register tool: "docrag-search"
2. Copilot calls tool with query
3. Tool searches documentation
4. Format results as context
5. Return to Copilot
6. Copilot uses context in responses
```

**Context Format:**
```
## [Title]
Source: [URL]
Library: [Name]

[Chunk text]

---
```

**Features:**
- Automatic context injection
- Proactive context on editor change
- Configurable enable/disable

## 🔄 Data Flow

### Indexing Flow

```
1. User: Select library to index
   ↓
2. Discovery: Find all doc pages
   ↓
3. Scraper: Extract content from each page
   ↓
4. Chunking: Split into 512-token chunks
   ↓
5. Embeddings: Generate vector for each chunk
   ↓
6. Storage: Save chunks + embeddings to DB
   ↓
7. Search: Build TF-IDF index
   ↓
8. Complete: Update status bar
```

### Search Flow

```
1. User: Enter search query
   ↓
2. Embeddings: Generate query embedding
   ↓
3. Search:
   ├─ Keyword search (BM25)
   └─ Vector search (cosine similarity)
   ↓
4. Fusion: Combine results using RRF
   ↓
5. Rank: Sort by fused score
   ↓
6. Display: Show top N results
```

### Copilot Flow

```
1. User: Types code in editor
   ↓
2. Copilot: Requests suggestions
   ↓
3. Copilot: Calls docrag-search tool
   ↓
4. Search: Find relevant docs
   ↓
5. Integration: Format as context
   ↓
6. Copilot: Include context in prompt
   ↓
7. Copilot: Generate better suggestion
```

## 📊 Performance Characteristics

### Indexing Performance
- **Discovery:** 1-10 seconds (depends on sitemap)
- **Scraping:** 1-2 seconds per page
- **Chunking:** < 1 second per page
- **Embeddings:** ~50ms per chunk
- **Storage:** ~1ms per chunk

**Example:** React docs (200 pages, 1000 chunks)
- Total time: ~5-10 minutes
- Bottleneck: Scraping + Embedding

### Search Performance
- **Keyword search:** < 10ms
- **Vector search:** 50-100ms (for 1000 chunks)
- **Fusion:** < 1ms
- **Total:** < 150ms

### Storage Size
- **Per chunk:** ~2-4 KB (text + metadata)
- **Per embedding:** 1.5 KB (384 floats)
- **Per page:** ~20-40 KB (5-10 chunks avg)

**Example:** 1000 pages = ~30-40 MB database

## 🔧 Configuration Options

```typescript
interface ExtensionConfig {
  libraries: Library[];              // URLs to index
  chunkSize: number;                 // Default: 512 tokens
  chunkOverlap: number;              // Default: 50 tokens
  maxSearchResults: number;          // Default: 5
  embeddingModel: string;            // Default: all-MiniLM-L6-v2
  enableCopilotIntegration: boolean; // Default: true
}
```

## 🔒 Security & Privacy

- ✅ All processing happens locally
- ✅ No data sent to external APIs
- ✅ Embeddings generated on-device
- ✅ SQLite database stored in VS Code's storage
- ✅ Respects user's documentation access permissions

## 🚀 Optimization Opportunities

### Current Bottlenecks
1. **Scraping** - Sequential, network-bound
2. **Embedding** - CPU-intensive, one-at-a-time

### Potential Improvements
1. **Parallel scraping** - Process 5-10 pages at once
2. **Batch embeddings** - True batch processing
3. **Incremental indexing** - Only update changed pages
4. **Vector quantization** - Reduce embedding size
5. **HNSW index** - Faster similarity search

## 📚 Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Language | TypeScript | Type-safe development |
| Runtime | Node.js | VS Code extension host |
| Bundler | Webpack | Module bundling |
| Parser | Cheerio | HTML parsing |
| Embeddings | Transformers.js | Local ML inference |
| Database | SQLite (better-sqlite3) | Data persistence |
| Search | Natural (TF-IDF) | Keyword search |
| Math | Custom | Vector operations |

## 🎓 Learning Resources

- **VS Code API:** https://code.visualstudio.com/api
- **Transformers.js:** https://huggingface.co/docs/transformers.js
- **BM25 Algorithm:** https://en.wikipedia.org/wiki/Okapi_BM25
- **Reciprocal Rank Fusion:** https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf
- **SQLite:** https://www.sqlite.org/docs.html

---

**Architecture Version:** 1.0  
**Last Updated:** October 29, 2025
