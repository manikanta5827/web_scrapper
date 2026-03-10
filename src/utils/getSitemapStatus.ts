import { db, closeDb } from '../db/client';
import { urls } from '../db/schema';
import { eq, count } from 'drizzle-orm';

async function getSitemapStatus(rootId: number) {
  try {
    const results = await db
      .select({
        status: urls.status,
        count: count(),
      })
      .from(urls)
      .where(eq(urls.rootId, rootId))
      .groupBy(urls.status);

    console.log(`Status Report for Root Sitemap ID: ${rootId}`);
    console.table(results);
    
    // Calculate total
    const total = results.reduce((acc, curr) => acc + curr.count, 0);
    console.log(`Total URLs: ${total}`);

  } catch (error) {
    console.error('Error fetching sitemap status:', error);
  } finally {
    await closeDb();
  }
}

// Get rootId from command line argument or default to 1
const rootIdArg = process.argv[2] ? parseInt(process.argv[2]) : 1;

if (isNaN(rootIdArg)) {
  console.error('Please provide a valid numeric rootId');
  process.exit(1);
}

getSitemapStatus(rootIdArg);
