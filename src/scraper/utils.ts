/**
 * Helper to parse date safely and convert to IST
 */
export function parseDate(dateStr: any): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  
  const istOffset = 5.5 * 60 * 60 * 1000;
  return new Date(d.getTime() + istOffset);
}

/**
 * Helper to handle DB errors during worker processing (e.g. if parent was deleted)
 */
export function isNotFoundError(e: any): boolean {
  // Check for Postgres Foreign Key Violation (23503) or generic "not found"
  const code = e?.code || e?.cause?.code;
  return code === '23503';
}
