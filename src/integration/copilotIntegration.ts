/**
 * Copilot Integration - Provides context to GitHub Copilot using VS Code LM API
 */

import * as vscode from 'vscode';
import { SearchEngine } from '../search/searchEngine';

export class CopilotIntegration {
  private searchEngine: SearchEngine;
  private isEnabled: boolean = true;

  constructor(searchEngine: SearchEngine) {
    this.searchEngine = searchEngine;
  }

  /**
   * Register language model tools for Copilot
   */
  register(context: vscode.ExtensionContext): void {
    const searchEngine = this.searchEngine;
    
    // Register as a language model tool that Copilot can use
    const tool: vscode.LanguageModelTool<{ query: string }> = {
      async invoke(
        options: vscode.LanguageModelToolInvocationOptions<{ query: string }>,
        token: vscode.CancellationToken
      ): Promise<vscode.LanguageModelToolResult> {
        try {
          const query = options.input?.query || '';
          
          // Search documentation
          const results = await searchEngine.search(query, undefined, 3);

          if (results.length === 0) {
            return {
              content: [
                new vscode.LanguageModelTextPart('No relevant documentation found.')
              ]
            };
          }

          // Format results as context
          const contextParts: vscode.LanguageModelTextPart[] = [];
          
          contextParts.push(
            new vscode.LanguageModelTextPart(
              `Here's relevant documentation context:\n\n`
            )
          );

          for (const result of results) {
            const context = `## ${result.chunk.metadata.title}\n` +
              `Source: ${result.chunk.pageUrl}\n` +
              `Library: ${result.chunk.library}\n\n` +
              `${result.chunk.text}\n\n` +
              `---\n\n`;
            
            contextParts.push(new vscode.LanguageModelTextPart(context));
          }

          return { content: contextParts };
        } catch (error) {
          return {
            content: [
              new vscode.LanguageModelTextPart(
                `Error retrieving documentation: ${error}`
              )
            ]
          };
        }
      }
    };

    // Register the tool
    const toolRegistration = vscode.lm.registerTool('docrag-search', tool);
    context.subscriptions.push(toolRegistration);

    // Also listen to active editor changes to provide proactive context
    context.subscriptions.push(
      vscode.window.onDidChangeActiveTextEditor(editor => {
        if (this.isEnabled && editor) {
          this.provideProactiveContext(editor);
        }
      })
    );
  }

  /**
   * Provide proactive context based on current file and cursor position
   */
  private async provideProactiveContext(editor: vscode.TextEditor): Promise<void> {
    try {
      // Get current line and surrounding context
      const position = editor.selection.active;
      const document = editor.document;
      const line = document.lineAt(position).text;

      // Extract potential API/function names
      const tokens = this.extractTokens(line);
      
      if (tokens.length === 0) return;

      // Search for documentation
      const query = tokens.join(' ');
      const results = await this.searchEngine.search(query, undefined, 2);

      if (results.length > 0) {
        // Could show in hover or status bar
        // For now, just cache for Copilot to use
        console.log(`Found ${results.length} relevant docs for: ${query}`);
      }
    } catch (error) {
      // Silently fail for proactive context
      console.error('Proactive context error:', error);
    }
  }

  /**
   * Extract meaningful tokens from code line
   */
  private extractTokens(line: string): string[] {
    // Remove common code characters and split
    const cleaned = line
      .replace(/[(){}[\];,.<>]/g, ' ')
      .replace(/['"]/g, ' ')
      .trim();

    // Split and filter short words
    const tokens = cleaned
      .split(/\s+/)
      .filter(token => token.length > 3)
      .filter(token => !/^\d+$/.test(token)); // Remove pure numbers

    return tokens.slice(0, 5); // Limit tokens
  }

  /**
   * Enable/disable integration
   */
  setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }
}
