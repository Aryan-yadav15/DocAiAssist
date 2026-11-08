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
      .filter(p => p.length > 0)
      .flatMap(p => this.splitOversized(p));
  }

  /**
   * Split a paragraph larger than chunkSize at sentence boundaries.
   * The scraper collapses whitespace, so a whole page usually arrives as one paragraph.
   */
  private splitOversized(paragraph: string): string[] {
    if (this.estimateTokens(paragraph) <= this.chunkSize) {
      return [paragraph];
    }

    const maxChars = this.chunkSize * 4;
    const sentences = paragraph.split(/(?<=[.!?])\s+/).map(s => s + ' ');
    const pieces: string[] = [];
    let current = '';

    for (const sentence of sentences) {
      if (current.length + sentence.length > maxChars && current.length > 0) {
        pieces.push(current.trim());
        current = '';
      }
      // Hard-split a single sentence that is still too long
      for (let i = 0; i < sentence.length; i += maxChars) {
        const part = sentence.slice(i, i + maxChars);
        if (current.length + part.length > maxChars && current.length > 0) {
          pieces.push(current.trim());
          current = '';
        }
        current += part;
      }
    }

    if (current.trim().length > 0) {
      pieces.push(current.trim());
    }

    return pieces;
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
