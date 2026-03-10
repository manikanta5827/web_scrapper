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
 * Uploads content to S3 and returns the URL.
 */
export async function uploadToS3(
  url: string, 
  content: string, 
  type: 'html' | 'md' = 'html'
): Promise<string | null> {
  if (!config.s3.accessKeyId || !config.s3.secretAccessKey) {
    logger.warn(`S3 credentials missing (KeyID: ${!!config.s3.accessKeyId}, Secret: ${!!config.s3.secretAccessKey}), skipping upload for ${url}.`);
    return null;
  }

  const folder = type === 'html' ? 'raw' : 'cleaned';
  const extension = type === 'html' ? '.html' : '.md';
  const contentType = type === 'html' ? 'text/html' : 'text/markdown';

  try {
    const key = `${folder}/${new URL(url).hostname}/${Date.now()}-${Math.random().toString(36).substring(7)}${extension}`;
    logger.debug(`Uploading ${type.toUpperCase()} to S3: ${key}`);
    
    await s3.send(new PutObjectCommand({
      Bucket: config.s3.bucket,
      Key: key,
      Body: content,
      ContentType: contentType,
    }));
    
    // Construct public HTTPS URL (assumes public read policy is set on bucket)
    const s3Url = `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;
    logger.debug(`S3 ${type.toUpperCase()} Upload successful: ${s3Url}`);
    return s3Url;
  } catch (error) {
    logger.error(`S3 ${type.toUpperCase()} Upload failed for ${url}: ${error instanceof Error ? error.message : 'Unknown'}`);
    if (error instanceof Error && 'stack' in error) {
      logger.error(error.stack);
    }
    return null;
  }
}