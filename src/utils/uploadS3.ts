
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from './config';
import { logger } from './logger';

// Initialize S3 Client
const s3 = new S3Client({
  region: config.s3.region,
  credentials: {
    accessKeyId: config.s3.accessKeyId,
    secretAccessKey: config.s3.secretAccessKey,
  }
});



/**
 * Uploads raw HTML to S3 and returns the URL.
 */
export async function uploadToS3(url: string, html: string): Promise<string | null> {
  if (!config.s3.accessKeyId) {
    logger.warn('S3 credentials missing, skipping upload.');
    return null;
  }

  try {
    const key = `raw/${new URL(url).hostname}/${Date.now()}-${Math.random().toString(36).substring(7)}.html`;
    await s3.send(new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: html,
      ContentType: 'text/html',
    }));
    
    // Construct public HTTPS URL (assumes public read policy is set on bucket)
    return `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;
  } catch (error) {
    logger.error(`S3 Upload failed for ${url}: ${error instanceof Error ? error.message : 'Unknown'}`);
    return null;
  }
}