/**
 * Scraper Engine - Extracts content from documentation pages
 */

import * as cheerio from 'cheerio';
import fetch from 'node-fetch';
import { DocumentationPage } from '../types';

export class ScraperEngine {
  /**
   * Scrape content from a documentation page
   */
  async scrape(url: string, library: string): Promise<DocumentationPage | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.error(`Failed to fetch ${url}: ${response.statusText}`);
        return null;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Remove unwanted elements
      $('script, style, nav, header, footer, .sidebar, .navigation, .ads').remove();

      // Extract title
      const title = this.extractTitle($);

      // Extract main content
      const content = this.extractContent($);

      // Extract metadata
      const metadata = this.extractMetadata($);

      if (!content || content.trim().length < 50) {
        console.warn(`No meaningful content found at ${url}`);
        return null;
      }

      return {
        url,
        title,
        content,
        library,
        metadata
      };
    } catch (error) {
      console.error(`Error scraping ${url}:`, error);
      return null;
    }
  }

  /**
   * Extract page title
   */
  private extractTitle($: cheerio.CheerioAPI): string {
    // Try multiple selectors for title
    const selectors = [
      'h1',
      'title',
      'meta[property="og:title"]',
      '.page-title',
      '.doc-title'
    ];

    for (const selector of selectors) {
      const element = $(selector).first();
      if (element.length > 0) {
        const title = selector.includes('meta') 
          ? element.attr('content') 
          : element.text();
        
        if (title && title.trim().length > 0) {
          return title.trim();
        }
      }
    }

    return 'Untitled';
  }

  /**
   * Extract main content from the page
   */
  private extractContent($: cheerio.CheerioAPI): string {
    // Try to find main content area
    const contentSelectors = [
      'main',
      'article',
      '.content',
      '.doc-content',
      '.documentation',
      '.markdown-body',
      '#content',
      '.main-content'
    ];

    for (const selector of contentSelectors) {
      const element = $(selector).first();
      if (element.length > 0 && element.text().trim().length > 100) {
        return this.cleanText(element.text());
      }
    }

    // Fallback to body
    return this.cleanText($('body').text());
  }

  /**
   * Extract metadata (headers, code blocks, links)
   */
  private extractMetadata($: cheerio.CheerioAPI): {
    headers: string[];
    codeBlocks: string[];
    links: string[];
  } {
    const headers: string[] = [];
    const codeBlocks: string[] = [];
    const links: string[] = [];

    // Extract headers
    $('h1, h2, h3, h4, h5, h6').each((_, elem) => {
      const text = $(elem).text().trim();
      if (text) {
        headers.push(text);
      }
    });

    // Extract code blocks
    $('pre code, pre, code.block').each((_, elem) => {
      const code = $(elem).text().trim();
      if (code && code.length > 10) {
        codeBlocks.push(code);
      }
    });

    // Extract important links
    $('main a, article a, .content a').each((_, elem) => {
      const href = $(elem).attr('href');
      if (href && !href.startsWith('#')) {
        links.push(href);
      }
    });

    return {
      headers: [...new Set(headers)].slice(0, 20),
      codeBlocks: codeBlocks.slice(0, 10),
      links: [...new Set(links)].slice(0, 30)
    };
  }

  /**
   * Clean extracted text
   */
  private cleanText(text: string): string {
    return text
      .replace(/\s+/g, ' ')  // Normalize whitespace
      .replace(/\n{3,}/g, '\n\n')  // Limit consecutive newlines
      .trim();
  }
}
