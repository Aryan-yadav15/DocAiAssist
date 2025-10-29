/**
 * Chunking Engine - Splits text into overlapping chunks
 */

import { TextChunk, DocumentationPage } from '../types';

export class ChunkingEngine {
  private chunkSize: number;
  private chunkOverlap: number;

  constructor(chunkSize: number = 512, chunkOverlap: number = 50) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  /**
   * Chunk a documentation page into smaller pieces
   */
  chunk(page: DocumentationPage): TextChunk[] {
    const chunks: TextChunk[] = [];
    
    // Split by paragraphs first
    const paragraphs = this.splitIntoParagraphs(page.content);
    
    let currentChunk = '';
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      const paragraphTokens = this.estimateTokens(paragraph);
      const currentTokens = this.estimateTokens(currentChunk);

      if (currentTokens + paragraphTokens > this.chunkSize && currentChunk.length > 0) {
        // Save current chunk
        chunks.push(this.createChunk(currentChunk, page, chunkIndex));
        chunkIndex++;

        // Start new chunk with overlap
        currentChunk = this.getOverlap(currentChunk) + paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }

    // Add remaining chunk
    if (currentChunk.trim().length > 0) {
      chunks.push(this.createChunk(currentChunk, page, chunkIndex));
    }

    return chunks;
  }

  /**
   * Split text into paragraphs
   */
  private splitIntoParagraphs(text: string): string[] {
    return text
      .split(/\n\n+/)
      .map(p => p.trim())
      .filter(p => p.length > 0);
  }

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 characters)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Get overlap text from the end of a chunk
   */
  private getOverlap(text: string): string {
    const tokens = this.estimateTokens(text);
    if (tokens <= this.chunkOverlap) {
      return text + '\n\n';
    }

    // Take last N characters that approximate overlap tokens
    const overlapChars = this.chunkOverlap * 4;
    const overlap = text.slice(-overlapChars).trim();
    
    // Try to cut at sentence boundary
    const lastPeriod = overlap.lastIndexOf('. ');
    if (lastPeriod > overlapChars / 2) {
      return overlap.slice(lastPeriod + 2) + '\n\n';
    }

    return overlap + '\n\n';
  }

  /**
   * Create a text chunk object
   */
  private createChunk(text: string, page: DocumentationPage, chunkIndex: number): TextChunk {
    return {
      text: text.trim(),
      pageUrl: page.url,
      library: page.library,
      metadata: {
        title: page.title,
        chunkIndex
      }
    };
  }

  /**
   * Update chunk size settings
   */
  updateSettings(chunkSize: number, chunkOverlap: number): void {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }
}
