# DocRAG - Documentation Context for GitHub Copilot

A VS Code extension that vectorizes library documentation and provides up-to-date context to GitHub Copilot.

## Features

- 📚 **Index Any Documentation**: Automatically crawl and index documentation from popular libraries
- 🔍 **Hybrid Search**: Combines BM25 keyword search with vector similarity search
- 🤖 **Copilot Integration**: Seamlessly provides relevant documentation context to GitHub Copilot
- ⚡ **Local Processing**: All embeddings generated locally using Transformers.js
- 💾 **Efficient Storage**: SQLite with vector search extension for fast retrieval

## Getting Started

1. Install the extension
2. Run `DocRAG: Index Documentation` command
3. Add your library documentation URLs in settings
4. Start coding - DocRAG will automatically provide context to Copilot!

## Configuration

Configure DocRAG in your VS Code settings:

```json
{
  "docrag.libraries": [
    {
      "name": "React",
      "url": "https://react.dev/reference"
    }
  ],
  "docrag.chunkSize": 512,
  "docrag.chunkOverlap": 50,
  "docrag.maxSearchResults": 5
}
```

## Development

This extension is built with:
- TypeScript
- Transformers.js (all-MiniLM-L6-v2)
- SQLite + sqlite-vss
- Cheerio for web scraping
- Natural (BM25 search)

## License

MIT
