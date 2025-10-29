/**
 * Core types and interfaces for the DocRAG extension
 */

export interface Library {
  name: string;
  url: string;
  lastIndexed?: Date;
  status?: 'pending' | 'indexing' | 'completed' | 'error';
}

export interface DocumentationPage {
  url: string;
  title: string;
  content: string;
  library: string;
  metadata: {
    headers: string[];
    codeBlocks: string[];
    links: string[];
  };
}

export interface TextChunk {
  id?: number;
  text: string;
  embedding?: number[];
  pageUrl: string;
  library: string;
  metadata: {
    title: string;
    section?: string;
    chunkIndex: number;
  };
}

export interface SearchResult {
  chunk: TextChunk;
  score: number;
  source: 'vector' | 'keyword' | 'hybrid';
}

export interface IndexingProgress {
  library: string;
  stage: 'discovering' | 'scraping' | 'chunking' | 'embedding' | 'storing';
  current: number;
  total: number;
  message?: string;
}

export interface ExtensionConfig {
  libraries: Library[];
  chunkSize: number;
  chunkOverlap: number;
  maxSearchResults: number;
  embeddingModel: string;
  enableCopilotIntegration: boolean;
}
