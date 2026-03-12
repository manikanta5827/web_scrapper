/**
 * Helper to handle DB errors during worker processing (e.g. if parent was deleted)
 */
export function isNotFoundError(e: any): boolean {
  // Check for Postgres Foreign Key Violation (23503) or generic "not found"
  const code = e?.code || e?.cause?.code;
  return code === '23503';
}
