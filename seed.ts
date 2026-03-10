const SITEMAPS = [
  'https://www.shiksha.com/sitemap',
  'https://www.careers360.com/sitemap.xml',
  'https://collegedunia.com/sitemap.xml',
  'https://www.collegedekho.com/sitemap.xml',
  'https://collegevidya.com/sitemap.xml',
];

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3003';

async function seed(): Promise<void> {
  console.log('Seeding sitemaps...');

  for (const url of SITEMAPS) {
    try {
      const res = await fetch(`${SERVER_URL}/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await res.json() as { id: string ,message: string}

      if (res.status === 202) {
        console.log(`Accepted: ${url} (id: ${data.id})`);
      } else if (res.status === 409) {
        console.log(`Already exists, skipping: ${url}`);
      } else {
        console.log(`Unexpected response for ${url}: ${res.status}`);
      }
    } catch (e) {
      console.error(`Failed to seed ${url}: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }

  console.log('Seeding complete.');
}

seed();