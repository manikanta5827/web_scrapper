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
 * Helper for exponential backoff retries
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let attempt = 0;
  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt >= retries) throw error;
      const delay = baseDelay * Math.pow(2, attempt - 1);
      logger.warn(`Retrying S3 upload after error: ${error instanceof Error ? error.message : 'Unknown'}. Attempt ${attempt}/${retries}. Waiting ${delay}ms...`);
      await new Promise(res => setTimeout(res, delay));
    }
  }
  throw new Error('Retry failed');
}

/**
 * Generates an idempotent S3 key based on the URL hash.
 */
function generateS3Key(url: string, type: 'html' | 'md'): string {
  const folder = type === 'html' ? 'raw' : 'cleaned';
  const extension = type === 'html' ? '.html' : '.md';
  const parsed = new URL(url);
  
  // Use a hash of the full URL for the filename
  const hash = Bun.hash(url).toString(16);
  return `${folder}/${parsed.hostname}/${hash}${extension}`;
}

/**
 * Uploads content to S3 and returns the URL.
 * Throws an error if the upload fails after all retries.
 */
export async function uploadToS3(
  url: string, 
  content: string, 
  type: 'html' | 'md' = 'html'
): Promise<string> {
  if (!config.s3.accessKeyId || !config.s3.secretAccessKey) {
    throw new Error(`S3 credentials missing, cannot upload for ${url}`);
  }

  const contentType = type === 'html' ? 'text/html' : 'text/markdown';

  try {
    const key = generateS3Key(url, type);
    
    await retryWithBackoff(async () => {
      logger.debug(`Uploading ${type.toUpperCase()} to S3 (Attempt): ${key}`);
      await s3.send(new PutObjectCommand({
        Bucket: config.s3.bucket,
        Key: key,
        Body: content,
        ContentType: contentType,
      }));
    });
    
    const s3Url = `https://${config.s3.bucket}.s3.${config.s3.region}.amazonaws.com/${key}`;
    logger.debug(`S3 ${type.toUpperCase()} Upload successful: ${s3Url}`);
    return s3Url;
  } catch (error) {
    const msg = `S3 ${type.toUpperCase()} Upload failed for ${url} after retries: ${error instanceof Error ? error.message : 'Unknown'}`;
    logger.error(msg);
    throw new Error(msg);
  }
}