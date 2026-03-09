import { load } from 'cheerio';
import { config } from '../config';

export function extract(html: string): string {
  const $ = load(html);
  $('script, style, nav, footer, header, aside').remove();
  return $('body').text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, config.maxContentLength);
}
