# 0004 · Discover pages from sitemap.xml before crawling

- **Status:** accepted
- **Date:** 2025-10-29 (present since the first commit)

## Context

Users configure a library as one URL. The extension needs the set of documentation pages under it, without pulling in
the rest of the site (blog, changelog, marketing pages).

## Decision

Try `<url>/sitemap.xml`, then `<origin>/sitemap.xml`, and keep only `<loc>` entries that **start with the configured URL**
([`discoveryEngine.ts:33`](../../src/discovery/discoveryEngine.ts#L33)). Only if that yields nothing, crawl links found in
`nav`, `main`, `article`, `.docs` and `.documentation`, on the same origin, up to depth 3 and 50 links per page
([`discoveryEngine.ts:70`](../../src/discovery/discoveryEngine.ts#L70)).

## Consequences

- With a sitemap, the configured URL is a precise scope: `https://vite.dev/config` gives exactly the 8 config pages.
- The prefix must match the sitemap's host exactly (`vitejs.dev` vs `vite.dev`), or discovery silently falls back to the
  crawler.
- The crawler has no page cap beyond depth × 50 links, no rate limiting and no `robots.txt` handling, so pointing it at a
  large site can mean thousands of sequential requests. Sitemap index files (`<sitemapindex>`) aren't followed.
