import TurndownService from 'turndown';

const turndownService = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
});

// Remove unnecessary elements before conversion to keep Markdown clean and save space
turndownService.remove([
  'script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript',
  'img', 'svg', 'canvas', 'video', 'audio', 'source', 'track',
  'form', 'button', 'input', 'select', 'option', 'textarea',
  'head', 'meta', 'link'
] as any[]);

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
    .trim();
}
