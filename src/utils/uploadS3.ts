
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
  if (!config.s3.accessKeyId || !config.s3.secretAccessKey) {
    logger.warn(`S3 credentials missing (KeyID: ${!!config.s3.accessKeyId}, Secret: ${!!config.s3.secretAccessKey}), skipping upload for ${url}.`);
    return null;
  }

  try {
    const key = `raw/${new URL(url).hostname}/${Date.now()}-${Math.random().toString(36).substring(7)}.html`;
    logger.debug(`Uploading to S3: ${key}`);
    
    await s3.send(new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: html,
      ContentType: 'text/html',
    }));
    
    // Construct public HTTPS URL (assumes public read policy is set on bucket)
    const s3Url = `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;
    logger.debug(`S3 Upload successful: ${s3Url}`);
    return s3Url;
  } catch (error) {
    logger.error(`S3 Upload failed for ${url}: ${error instanceof Error ? error.message : 'Unknown'}`);
    if (error instanceof Error && 'stack' in error) {
      logger.error(error.stack);
    }
    return null;
  }
}