/**
 * DocRAG Extension - Main entry point
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { DiscoveryEngine } from './discovery/discoveryEngine';
import { ScraperEngine } from './scraper/scraperEngine';
import { ChunkingEngine } from './chunking/chunkingEngine';
import { EmbeddingsEngine } from './embeddings/embeddingsEngine';
import { StorageEngine } from './storage/storageEngine';
import { SearchEngine } from './search/searchEngine';
import { CopilotIntegration } from './integration/copilotIntegration';
import { ExtensionConfig, Library, IndexingProgress } from './types';

let storage: StorageEngine;
let embeddings: EmbeddingsEngine;
let search: SearchEngine;
let copilot: CopilotIntegration;
let statusBarItem: vscode.StatusBarItem;

/**
 * Extension activation
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('DocRAG extension is now active');

  try {
    // Register commands first (so they're available even if init fails)
    context.subscriptions.push(
      vscode.commands.registerCommand('docrag.indexDocumentation', indexDocumentation),
      vscode.commands.registerCommand('docrag.searchDocumentation', searchDocumentation),
      vscode.commands.registerCommand('docrag.openSettings', openSettings),
      vscode.commands.registerCommand('docrag.clearCache', clearCache)
    );

    // Initialize engines
    const storagePath = context.globalStorageUri.fsPath;
    console.log('Storage path:', storagePath);
    
    storage = new StorageEngine(storagePath);
    await storage.initialize();
    console.log('Storage initialized');

    embeddings = new EmbeddingsEngine();
    console.log('Embeddings engine created');
    
    search = new SearchEngine(storage, embeddings);
    console.log('Search engine created');
    
    copilot = new CopilotIntegration(search);
    console.log('Copilot integration created');

    // Register Copilot integration
    copilot.register(context);
    console.log('Copilot integration registered');

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'docrag.openSettings';
    updateStatusBar();
    statusBarItem.show();
    context.subscriptions.push(statusBarItem);
    console.log('Status bar created');

    // Watch for configuration changes
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
        if (e.affectsConfiguration('docrag')) {
          handleConfigurationChange();
        }
      })
    );

    console.log('DocRAG extension initialized successfully');
  } catch (error) {
    console.error('Error activating DocRAG extension:', error);
    vscode.window.showErrorMessage(`DocRAG failed to activate: ${error}`);
  }
}

/**
 * Index documentation command
 */
async function indexDocumentation() {
  const config = getConfig();
  
  if (config.libraries.length === 0) {
    const action = await vscode.window.showInformationMessage(
      'No libraries configured. Would you like to add one?',
      'Add Library',
      'Cancel'
    );
    
    if (action === 'Add Library') {
      await openSettings();
    }
    return;
  }

  // Show library selection
  const libraryNames = config.libraries.map(lib => lib.name);
  const selected = await vscode.window.showQuickPick(
    ['All Libraries', ...libraryNames],
    { placeHolder: 'Select library to index' }
  );

  if (!selected) return;

  const librariesToIndex = selected === 'All Libraries' 
    ? config.libraries 
    : config.libraries.filter(lib => lib.name === selected);

  // Index selected libraries
  for (const library of librariesToIndex) {
    await indexLibrary(library, config);
  }

  vscode.window.showInformationMessage('Indexing completed!');
}

/**
 * Index a single library
 */
async function indexLibrary(library: Library, config: ExtensionConfig) {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Indexing ${library.name}`,
      cancellable: false
    },
    async (progress: vscode.Progress<{ message?: string; increment?: number }>) => {
      try {
        // Update status
        storage.updateLibraryStatus(library.name, library.url, 'indexing');
        updateStatusBar('Indexing...');

        // 1. Discovery
        progress.report({ increment: 0, message: 'Discovering pages...' });
        const discovery = new DiscoveryEngine();
        const urls = await discovery.discover(library.url);
        console.log(`Discovered ${urls.length} pages for ${library.name}`);

        // 2. Scraping
        progress.report({ increment: 20, message: 'Scraping content...' });
        const scraper = new ScraperEngine();
        const pages = [];
        
        for (let i = 0; i < urls.length; i++) {
          try {
            const page = await scraper.scrape(urls[i], library.name);
            if (page && page.content && page.content.trim().length > 0) {
              pages.push(page);
            } else {
              console.warn(`Skipping ${urls[i]} - no content`);
            }
          } catch (error) {
            console.error(`Failed to scrape ${urls[i]}:`, error);
          }
          
          if (i % 10 === 0) {
            progress.report({
              increment: 20 / urls.length * 10,
              message: `Scraped ${i}/${urls.length} pages...`
            });
          }
        }

        console.log(`Scraped ${pages.length} pages for ${library.name}`);

        // Check if we got any pages
        if (pages.length === 0) {
          console.error(`No pages scraped for ${library.name}`);
          throw new Error(`Failed to scrape any pages. The website might be blocking requests or the URL might be incorrect.`);
        }

        // 3. Chunking
        progress.report({ increment: 40, message: 'Chunking content...' });
        const chunking = new ChunkingEngine(config.chunkSize, config.chunkOverlap);
        const allChunks = [];
        
        for (const page of pages) {
          try {
            const chunks = chunking.chunk(page);
            if (chunks && chunks.length > 0) {
              allChunks.push(...chunks);
            }
          } catch (error) {
            console.error(`Failed to chunk page ${page.url}:`, error);
          }
        }

        console.log(`Created ${allChunks.length} chunks for ${library.name}`);

        // Skip if no chunks created
        if (allChunks.length === 0) {
          console.warn(`No chunks created for ${library.name}`);
          vscode.window.showWarningMessage(`No content found to index for ${library.name}`);
          return;
        }

        // 4. Generate embeddings
        progress.report({ increment: 60, message: 'Generating embeddings...' });
        await embeddings.initialize();
        
        const texts = allChunks.map(c => c.text);
        const embeddingVectors = await embeddings.embedBatch(texts);
        
        // Attach embeddings to chunks (with validation)
        const validChunks: typeof allChunks = [];
        for (let i = 0; i < allChunks.length; i++) {
          const chunk = allChunks[i];
          const embedding = embeddingVectors[i];
          
          if (chunk && embedding && embedding.length > 0) {
            chunk.embedding = embedding;
            validChunks.push(chunk);
          } else {
            console.warn(`Skipping chunk ${i} due to missing data`);
          }
        }

        console.log(`Valid chunks with embeddings: ${validChunks.length}/${allChunks.length}`);

        // 5. Store in database
        progress.report({ increment: 80, message: 'Storing in database...' });
        storage.clearLibrary(library.name); // Clear old data
        
        for (const chunk of validChunks) {
          storage.storeChunk(chunk);
        }

        // 6. Build search index
        progress.report({ increment: 90, message: 'Building search index...' });
        await search.buildIndex(library.name);

        // Update status
        storage.updateLibraryStatus(library.name, library.url, 'completed');
        progress.report({ increment: 100, message: 'Completed!' });
        
        updateStatusBar();
      } catch (error) {
        console.error(`Error indexing ${library.name}:`, error);
        storage.updateLibraryStatus(library.name, library.url, 'error');
        vscode.window.showErrorMessage(`Failed to index ${library.name}: ${error}`);
        updateStatusBar();
      }
    }
  );
}

/**
 * Search documentation command
 */
async function searchDocumentation() {
  const query = await vscode.window.showInputBox({
    prompt: 'Enter search query',
    placeHolder: 'e.g., useEffect hook'
  });

  if (!query) return;

  try {
    const results = await search.search(query, undefined, 10);
    
    if (results.length === 0) {
      vscode.window.showInformationMessage('No results found');
      return;
    }

    // Show results in quick pick
    const items = results.map(result => ({
      label: result.chunk.metadata.title,
      description: result.chunk.library,
      detail: result.chunk.text.substring(0, 100) + '...',
      result: result
    }));

    const selected = await vscode.window.showQuickPick(items, {
      placeHolder: 'Select a result to view'
    });

    if (selected) {
      // Open URL in browser
      vscode.env.openExternal(vscode.Uri.parse(selected.result.chunk.pageUrl));
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Search failed: ${error}`);
  }
}

/**
 * Open settings command
 */
async function openSettings() {
  vscode.commands.executeCommand('workbench.action.openSettings', 'docrag');
}

/**
 * Clear cache command
 */
async function clearCache() {
  const confirm = await vscode.window.showWarningMessage(
    'This will delete all indexed documentation. Continue?',
    'Yes',
    'No'
  );

  if (confirm !== 'Yes') return;

  const config = getConfig();
  for (const library of config.libraries) {
    storage.clearLibrary(library.name);
  }

  vscode.window.showInformationMessage('Cache cleared successfully');
  updateStatusBar();
}

/**
 * Get extension configuration
 */
function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('docrag');
  return {
    libraries: config.get('libraries', []),
    chunkSize: config.get('chunkSize', 512),
    chunkOverlap: config.get('chunkOverlap', 50),
    maxSearchResults: config.get('maxSearchResults', 5),
    embeddingModel: config.get('embeddingModel', 'Xenova/all-MiniLM-L6-v2'),
    enableCopilotIntegration: config.get('enableCopilotIntegration', true)
  };
}

/**
 * Handle configuration changes
 */
function handleConfigurationChange() {
  const config = getConfig();
  
  // Update copilot integration
  copilot.setEnabled(config.enableCopilotIntegration);
  
  updateStatusBar();
}

/**
 * Update status bar
 */
function updateStatusBar(message?: string) {
  if (message) {
    statusBarItem.text = `$(database) DocRAG: ${message}`;
  } else {
    const stats = storage.getStats();
    statusBarItem.text = `$(database) DocRAG: ${stats.totalChunks} chunks`;
    statusBarItem.tooltip = `Libraries: ${stats.libraries.join(', ') || 'none'}`;
  }
}

/**
 * Extension deactivation
 */
export function deactivate() {
  if (storage) {
    storage.close();
  }
  if (embeddings) {
    embeddings.dispose();
  }
}
