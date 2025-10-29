/**
 * Storage Engine - Pure JavaScript storage using sql.js (no native modules)
 */

import * as path from 'path';
import * as fs from 'fs';
import initSqlJs, { Database } from 'sql.js';
import { TextChunk } from '../types';

export class StorageEngine {
  private db: Database | null = null;
  private dbPath: string;
  private vectorDimension: number = 384;
  private SQL: any = null;

  constructor(storagePath: string) {
    this.dbPath = path.join(storagePath, 'docrag.db');
  }

  async initialize(): Promise<void> {
    try {
      const dir = path.dirname(this.dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Initialize sql.js with locateFile to help it find the WASM file
      this.SQL = await initSqlJs({
        locateFile: (file: string) => {
          // First try dist folder (where extension runs from)
          const distPath = path.join(__dirname, file);
          if (fs.existsSync(distPath)) {
            return distPath;
          }
          // Try node_modules as fallback
          const wasmPath = path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', file);
          if (fs.existsSync(wasmPath)) {
            return wasmPath;
          }
          // Last resort: return the file name and let sql.js try to find it
          return file;
        }
      });

      if (fs.existsSync(this.dbPath)) {
        const buffer = fs.readFileSync(this.dbPath);
        this.db = new this.SQL.Database(buffer);
      } else {
        this.db = new this.SQL.Database();
      }

      this.createTables();
      this.save();
      console.log('Storage initialized');
    } catch (error) {
      console.error('Storage initialization error:', error);
      throw error;
    }
  }

  private createTables(): void {
    if (!this.db) return;

    this.db.run(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        page_url TEXT NOT NULL,
        library TEXT NOT NULL,
        title TEXT NOT NULL,
        section TEXT,
        chunk_index INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS embeddings (
        chunk_id INTEGER PRIMARY KEY,
        embedding TEXT NOT NULL,
        FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
      )
    `);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS libraries (
        name TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        last_indexed TIMESTAMP,
        status TEXT DEFAULT 'pending'
      )
    `);

    this.db.run(`CREATE INDEX IF NOT EXISTS idx_chunks_library ON chunks(library)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_chunks_url ON chunks(page_url)`);
  }

  storeChunk(chunk: TextChunk): number {
    if (!this.db) throw new Error('Database not initialized');

    try {
      this.db.run(
        `INSERT INTO chunks (text, page_url, library, title, section, chunk_index)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [chunk.text, chunk.pageUrl, chunk.library, chunk.metadata.title, chunk.metadata.section || null, chunk.metadata.chunkIndex]
      );

      const result = this.db.exec('SELECT last_insert_rowid() as id');
      const chunkId = result[0].values[0][0] as number;

      if (chunk.embedding && chunk.embedding.length > 0) {
        this.storeEmbedding(chunkId, chunk.embedding);
      }

      if (chunkId % 100 === 0) {
        this.save();
      }

      return chunkId;
    } catch (error) {
      console.error('Error storing chunk:', error);
      throw error;
    }
  }

  private storeEmbedding(chunkId: number, embedding: number[]): void {
    if (!this.db) return;
    const embeddingJson = JSON.stringify(embedding);
    this.db.run(`INSERT OR REPLACE INTO embeddings (chunk_id, embedding) VALUES (?, ?)`, [chunkId, embeddingJson]);
  }

  getChunksByLibrary(library: string): TextChunk[] {
    if (!this.db) return [];

    try {
      const result = this.db.exec(
        `SELECT id, text, page_url, library, title, section, chunk_index FROM chunks WHERE library = ?`,
        [library]
      );

      if (!result || result.length === 0) return [];

      const chunks: TextChunk[] = [];
      const columns = result[0].columns;
      const values = result[0].values;

      for (const row of values) {
        const chunk: any = {};
        columns.forEach((col, idx) => {
          chunk[col] = row[idx];
        });
        chunks.push(this.rowToChunk(chunk));
      }

      return chunks;
    } catch (error) {
      console.error('Error getting chunks:', error);
      return [];
    }
  }

  searchByKeyword(query: string, library?: string, limit: number = 10): TextChunk[] {
    if (!this.db) return [];

    try {
      let sql = `SELECT id, text, page_url, library, title, section, chunk_index FROM chunks WHERE text LIKE ?`;
      const params: any[] = [`%${query}%`];

      if (library) {
        sql += ' AND library = ?';
        params.push(library);
      }

      sql += ' LIMIT ?';
      params.push(limit);

      const result = this.db.exec(sql, params);

      if (!result || result.length === 0) return [];

      const chunks: TextChunk[] = [];
      const columns = result[0].columns;
      const values = result[0].values;

      for (const row of values) {
        const chunk: any = {};
        columns.forEach((col, idx) => {
          chunk[col] = row[idx];
        });
        chunks.push(this.rowToChunk(chunk));
      }

      return chunks;
    } catch (error) {
      console.error('Error searching chunks:', error);
      return [];
    }
  }

  getEmbedding(chunkId: number): number[] | null {
    if (!this.db) return null;

    try {
      const result = this.db.exec(`SELECT embedding FROM embeddings WHERE chunk_id = ?`, [chunkId]);

      if (!result || result.length === 0) return null;

      const embeddingJson = result[0].values[0][0] as string;
      return JSON.parse(embeddingJson);
    } catch (error) {
      console.error('Error getting embedding:', error);
      return null;
    }
  }

  getAllEmbeddings(): Map<number, number[]> {
    if (!this.db) return new Map();

    try {
      const result = this.db.exec(`SELECT chunk_id, embedding FROM embeddings`);

      const embeddings = new Map<number, number[]>();

      if (!result || result.length === 0) return embeddings;

      const values = result[0].values;
      for (const row of values) {
        const chunkId = row[0] as number;
        const embeddingJson = row[1] as string;
        embeddings.set(chunkId, JSON.parse(embeddingJson));
      }

      return embeddings;
    } catch (error) {
      console.error('Error getting all embeddings:', error);
      return new Map();
    }
  }

  clearLibrary(library: string): void {
    if (!this.db) return;

    try {
      this.db.run('DELETE FROM chunks WHERE library = ?', [library]);
      this.save();
      console.log(`Cleared library: ${library}`);
    } catch (error) {
      console.error('Error clearing library:', error);
    }
  }

  updateLibraryStatus(name: string, url: string, status: string): void {
    if (!this.db) return;

    try {
      this.db.run(
        `INSERT OR REPLACE INTO libraries (name, url, last_indexed, status) VALUES (?, ?, datetime('now'), ?)`,
        [name, url, status]
      );
      this.save();
    } catch (error) {
      console.error('Error updating library status:', error);
    }
  }

  getStats(): { totalChunks: number; libraries: string[] } {
    if (!this.db) return { totalChunks: 0, libraries: [] };

    try {
      const countResult = this.db.exec('SELECT COUNT(*) as count FROM chunks');
      const totalChunks = countResult[0]?.values[0]?.[0] as number || 0;

      const libResult = this.db.exec('SELECT DISTINCT library FROM chunks');
      const libraries = libResult[0]?.values.map(row => row[0] as string) || [];

      return { totalChunks, libraries };
    } catch (error) {
      console.error('Error getting stats:', error);
      return { totalChunks: 0, libraries: [] };
    }
  }

  private rowToChunk(row: any): TextChunk {
    return {
      id: row.id,
      text: row.text,
      pageUrl: row.page_url,
      library: row.library,
      metadata: {
        title: row.title,
        section: row.section,
        chunkIndex: row.chunk_index
      }
    };
  }

  private save(): void {
    if (!this.db) return;

    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);
    } catch (error) {
      console.error('Error saving database:', error);
    }
  }

  close(): void {
    if (this.db) {
      this.save();
      this.db.close();
      this.db = null;
      console.log('Database closed');
    }
  }
}
