/**
 * Embeddings Engine - Generates vector embeddings using Transformers.js
 */

import { pipeline } from '@xenova/transformers';

export class EmbeddingsEngine {
  private model: any | null = null;
  private modelId: string;
  private isInitialized: boolean = false;

  constructor(modelId: string = 'Xenova/all-MiniLM-L6-v2') {
    this.modelId = modelId;
  }

  /**
   * Initialize the embedding model
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      console.log(`Loading embedding model: ${this.modelId}`);
      this.model = await pipeline('feature-extraction', this.modelId);
      this.isInitialized = true;
      console.log('Embedding model loaded successfully');
    } catch (error) {
      console.error('Failed to load embedding model:', error);
      throw error;
    }
  }

  /**
   * Generate embedding for a single text
   */
  async embed(text: string): Promise<number[]> {
    if (!this.isInitialized || !this.model) {
      await this.initialize();
    }

    try {
      const output = await this.model!(text, {
        pooling: 'mean',
        normalize: true
      });

      // Convert to regular array
      return Array.from(output.data as Float32Array);
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (!this.isInitialized || !this.model) {
      await this.initialize();
    }

    const embeddings: number[][] = [];

    // Process in batches to avoid memory issues
    const batchSize = 32;
    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      for (const text of batch) {
        try {
          // Skip empty or very short texts
          if (!text || text.trim().length < 10) {
            console.warn(`Skipping empty or too short text at index ${i}`);
            embeddings.push([]);
            continue;
          }
          
          const embedding = await this.embed(text);
          embeddings.push(embedding);
        } catch (error) {
          console.error(`Error embedding text at index ${embeddings.length}:`, error);
          // Push empty embedding on error
          embeddings.push([]);
        }
      }

      // Progress logging
      if (i % 100 === 0 && i > 0) {
        console.log(`Embedded ${Math.min(i + batchSize, texts.length)}/${texts.length} texts`);
      }
    }

    console.log(`Embedding batch complete: ${embeddings.length} embeddings generated`);
    return embeddings;
  }

  /**
   * Get the dimension of the embeddings
   */
  async getDimension(): Promise<number> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    // all-MiniLM-L6-v2 produces 384-dimensional embeddings
    const testEmbedding = await this.embed('test');
    return testEmbedding.length;
  }

  /**
   * Dispose of the model
   */
  dispose(): void {
    this.model = null;
    this.isInitialized = false;
  }
}
