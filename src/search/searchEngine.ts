/**
 * Search Engine - Hybrid search combining BM25 and vector similarity
 */

import * as natural from 'natural';
import { TextChunk, SearchResult } from '../types';
import { StorageEngine } from '../storage/storageEngine';
import { EmbeddingsEngine } from '../embeddings/embeddingsEngine';

const TfIdf = natural.TfIdf;

export class SearchEngine {
  private storage: StorageEngine;
  private embeddings: EmbeddingsEngine;
  private tfidf: any;

  constructor(storage: StorageEngine, embeddings: EmbeddingsEngine) {
    this.storage = storage;
    this.embeddings = embeddings;
    this.tfidf = new TfIdf();
  }

  /**
   * Build TF-IDF index for BM25 keyword search
   */
  async buildIndex(library?: string): Promise<void> {
    const chunks = library 
      ? this.storage.getChunksByLibrary(library)
      : []; // TODO: get all chunks

    this.tfidf = new TfIdf();
    
    for (const chunk of chunks) {
      this.tfidf.addDocument(chunk.text);
    }

    console.log(`Built search index with ${chunks.length} chunks`);
  }

  /**
   * Hybrid search combining keyword (BM25) and vector similarity
   */
  async search(query: string, library?: string, maxResults: number = 5): Promise<SearchResult[]> {
    // Get keyword search results
    const keywordResults = await this.keywordSearch(query, library, maxResults * 2);
    
    // Get vector search results
    const vectorResults = await this.vectorSearch(query, library, maxResults * 2);

    // Fuse results using Reciprocal Rank Fusion
    const fusedResults = this.fuseResults(keywordResults, vectorResults, maxResults);

    return fusedResults;
  }

  /**
   * Keyword search using TF-IDF (BM25-like)
   */
  private async keywordSearch(query: string, library: string | undefined, limit: number): Promise<SearchResult[]> {
    // Simple keyword search for now
    const chunks = this.storage.searchByKeyword(query, library, limit);
    
    return chunks.map((chunk, index) => ({
      chunk,
      score: 1.0 / (index + 1), // Simple ranking
      source: 'keyword' as const
    }));
  }

  /**
   * Vector similarity search
   */
  private async vectorSearch(query: string, library: string | undefined, limit: number): Promise<SearchResult[]> {
    try {
      // Generate query embedding
      const queryEmbedding = await this.embeddings.embed(query);

      // Get all embeddings from storage
      const allEmbeddings = this.storage.getAllEmbeddings();

      // Calculate cosine similarities
      const similarities: Array<{ chunkId: number; similarity: number }> = [];

      for (const [chunkId, embedding] of allEmbeddings) {
        const similarity = this.cosineSimilarity(queryEmbedding, embedding);
        similarities.push({ chunkId, similarity });
      }

      // Sort by similarity and take top results
      similarities.sort((a, b) => b.similarity - a.similarity);
      const topResults = similarities.slice(0, limit);

      // Get chunks for top results
      const results: SearchResult[] = [];
      for (const { chunkId, similarity } of topResults) {
        // Need to get chunk by ID - add this method to storage
        const chunks = library 
          ? this.storage.getChunksByLibrary(library)
          : [];
        
        const chunk = chunks.find(c => c.id === chunkId);
        if (chunk) {
          results.push({
            chunk,
            score: similarity,
            source: 'vector' as const
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Vector search error:', error);
      return [];
    }
  }

  /**
   * Fuse keyword and vector search results using Reciprocal Rank Fusion
   */
  private fuseResults(
    keywordResults: SearchResult[],
    vectorResults: SearchResult[],
    maxResults: number
  ): SearchResult[] {
    const k = 60; // RRF constant
    const scores = new Map<number, { chunk: TextChunk; score: number }>();

    // Add keyword results
    keywordResults.forEach((result, index) => {
      const chunkId = result.chunk.id!;
      const rrfScore = 1 / (k + index + 1);
      scores.set(chunkId, {
        chunk: result.chunk,
        score: rrfScore
      });
    });

    // Add vector results
    vectorResults.forEach((result, index) => {
      const chunkId = result.chunk.id!;
      const rrfScore = 1 / (k + index + 1);
      
      if (scores.has(chunkId)) {
        scores.get(chunkId)!.score += rrfScore;
      } else {
        scores.set(chunkId, {
          chunk: result.chunk,
          score: rrfScore
        });
      }
    });

    // Sort by fused score
    const fusedResults = Array.from(scores.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map(({ chunk, score }) => ({
        chunk,
        score,
        source: 'hybrid' as const
      }));

    return fusedResults;
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }
}
