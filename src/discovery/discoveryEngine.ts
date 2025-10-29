/**
 * Discovery Engine - Discovers documentation pages from a given URL
 */

import * as cheerio from 'cheerio';
import fetch from 'node-fetch';

export class DiscoveryEngine {
  private visitedUrls: Set<string> = new Set();
  private maxDepth: number = 3;

  /**
   * Discover documentation pages from a base URL
   */
  async discover(baseUrl: string): Promise<string[]> {
    const urls: string[] = [];
    
    // Try sitemap first
    const sitemapUrls = await this.discoverFromSitemap(baseUrl);
    if (sitemapUrls.length > 0) {
      return sitemapUrls;
    }

    // Fall back to crawling
    await this.crawl(baseUrl, urls, 0);
    
    return urls;
  }

  /**
   * Try to discover pages from sitemap.xml
   */
  private async discoverFromSitemap(baseUrl: string): Promise<string[]> {
    const sitemapUrls = [
      `${baseUrl}/sitemap.xml`,
      `${new URL(baseUrl).origin}/sitemap.xml`
    ];

    for (const sitemapUrl of sitemapUrls) {
      try {
        const response = await fetch(sitemapUrl);
        if (response.ok) {
          const xml = await response.text();
          const $ = cheerio.load(xml, { xmlMode: true });
          const urls: string[] = [];
          
          $('loc').each((_, elem) => {
            const url = $(elem).text().trim();
            if (url.startsWith(baseUrl)) {
              urls.push(url);
            }
          });

          if (urls.length > 0) {
            console.log(`Found ${urls.length} URLs from sitemap`);
            return urls;
          }
        }
      } catch (error) {
        // Sitemap not found, continue
      }
    }

    return [];
  }

  /**
   * Crawl documentation pages recursively
   */
  private async crawl(url: string, urls: string[], depth: number): Promise<void> {
    if (depth > this.maxDepth || this.visitedUrls.has(url)) {
      return;
    }

    this.visitedUrls.add(url);
    urls.push(url);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        return;
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const baseUrl = new URL(url).origin;

      // Find all links in navigation or main content
      const links: string[] = [];
      $('nav a, main a, article a, .docs a, .documentation a').each((_, elem) => {
        const href = $(elem).attr('href');
        if (href) {
          const absoluteUrl = this.resolveUrl(href, url);
          if (absoluteUrl && absoluteUrl.startsWith(baseUrl) && !this.visitedUrls.has(absoluteUrl)) {
            links.push(absoluteUrl);
          }
        }
      });

      // Crawl found links
      for (const link of links.slice(0, 50)) { // Limit to prevent infinite crawling
        await this.crawl(link, urls, depth + 1);
      }
    } catch (error) {
      console.error(`Error crawling ${url}:`, error);
    }
  }

  /**
   * Resolve relative URL to absolute
   */
  private resolveUrl(href: string, baseUrl: string): string | null {
    try {
      // Skip anchors, external links, and non-http protocols
      if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return null;
      }

      const resolved = new URL(href, baseUrl);
      
      // Only return http/https URLs
      if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') {
        return null;
      }

      return resolved.href;
    } catch {
      return null;
    }
  }

  /**
   * Reset visited URLs for a new discovery session
   */
  reset(): void {
    this.visitedUrls.clear();
  }
}
