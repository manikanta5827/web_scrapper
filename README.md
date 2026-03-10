# Web Scraper

A high-performance, distributed XML sitemap and web page scraper built with Bun, TypeScript, and PostgreSQL.

### What it does
This project automatically traverses complex website sitemap structures (including nested sitemap indices) to discover every page on a domain. It then scrapes the textual content from those pages, cleans it by removing non-essential elements (like scripts and styles), and stores it in a PostgreSQL database for further analysis.

### Use Cases
- **Content Aggregation:** Building a searchable index of a website's articles or products.
- **SEO Auditing:** Tracking page updates and sitemap health at scale.
- **LLM Training:** Efficiently gathering high-quality text data from specific domains.
- **Data Migration:** Extracting content from legacy websites for a new platform.

### Key Features
- **Distributed Architecture:** Uses `pg-boss` for background job management, allowing multiple workers to run in parallel.
- **Recursive Sitemap Traversal:** Automatically handles nested sitemaps with depth protection.
- **Smart Incremental Scraping:** Uses the `lastmod` field from sitemaps to only re-scrape pages that have actually changed.
- **Hierarchy Tracking:** Assigns a `rootId` to every discovered element, making it easy to track progress for a specific starting sitemap.
- **Robust Error Handling:** Features configurable retries, timeouts, and graceful shutdown.
- **Content Cleaning:** Automatically strips HTML tags, scripts, and styles to extract pure text content.
- **TypeScript First:** Fully typed codebase ensuring reliability and maintainability.
- **Built for Bun:** Leverages the high-performance Bun runtime for faster execution.

### Documentation Links
- [Architecture Overview](ARCHITECTURE.md)
- [Setup & Installation](SETUP.md)
- [API Reference](API.md)

---
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen)](#)
[![License](https://img.shields.io/badge/license-MIT-blue)](#)
[![Version](https://img.shields.io/badge/version-1.0.0-orange)](#)
