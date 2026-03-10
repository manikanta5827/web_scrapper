import TurndownService from 'turndown';
import { config } from '../utils/config';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// Remove unnecessary elements before conversion
turndownService.remove(['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript']);

/**
 * Converts HTML to clean, readable Markdown.
 * Markdown is significantly better than raw text for LLM ingestion 
 * and structural analysis while being compact.
 */
export function extract(html: string): string {
  if (!html) return '';
  
  // Convert to Markdown
  const markdown = turndownService.turndown(html);
  
  // Clean up whitespace and slice to max length
  return markdown
    .replace(/\n{3,}/g, '\n\n') // Normalize multiple newlines
    .trim()
    .slice(0, config.maxContentLength);
}
