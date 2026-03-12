import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { logger } from './logger';

// Bootstrap variables
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * AWS SSM Client
 */
const ssmClient = new SSMClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY
  }
});

/**
 * Initial Config (Populated from local .env)
 */
export const config = {
  env: NODE_ENV,
  port: process.env.PORT || '10000',
  
  // Use local .env values as the primary source/fallback
  databaseUrl: (process.env.DATABASE_URL || '').replace(/\\\$/g, '$'),
  queueDatabaseUrl: process.env.QUEUE_DATABASE_URL || process.env.DATABASE_URL || '',
  
  s3: {
    region: AWS_REGION,
    bucket: process.env.AWS_BUCKET_NAME || '',
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY
  },

  // Dynamic Settings (Defaults)
  userAgent: 'Mozilla/5.0 (compatible; WebScraper/1.0)',
  timeout: 30000,
  enableS3Upload: process.env.NODE_ENV !== 'development', // Default: off in dev
  sitemapConcurrency: {
    min: 1,
    max: 5,
    scaleUpThreshold: 10,
    scalerCheckIntervalMs: 30000,
    batchSize: 1,
    workerFetchIntervalSeconds: 15,
  },
  pageConcurrency: {
    min: 1,
    max: 15,
    scaleUpThreshold: 100,
    scalerCheckIntervalMs: 20000,
    batchSize: 100,
    workerFetchIntervalSeconds: 10,
  },
  retryLimit: 3,
  retryDelay: 30,
  maxContentLength: 100000,
  batchSize: 500,

  dbMaxConnections: 10,
  bossMaxConnections: 15,
  dbConnectionTimeout: 60000,
  dbIdleTimeout: 30000,
  logFile: 'logs/app.log',
};

/**
 * Hydrate from AWS SSM (Overlays on top of local .env)
 */
export async function hydrateConfig(): Promise<void> {
  // Skip SSM if credentials are missing (e.g. local dev without AWS)
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    logger.info('[Config] AWS Credentials missing. Skipping SSM hydration, using local .env.');
    return;
  }

  const path = `/web-scraper/${config.env}/`;
  
  try {
    const command = new GetParametersByPathCommand({
      Path: path,
      WithDecryption: true,
      Recursive: true
    });

    const response = await ssmClient.send(command);
    
    if (!response.Parameters || response.Parameters.length === 0) {
      logger.info(`[Config] No parameters found in SSM path "${path}". Staying with local .env.`);
      return;
    }

    for (const param of response.Parameters) {
      if (!param.Name || !param.Value) continue;
      const key = param.Name.replace(path, '');
      
      if (key === 'config') {
        try {
          Object.assign(config, JSON.parse(param.Value));
        } catch (e) {
          logger.error(`[Config] Failed to parse JSON config from SSM: ${e}`);
        }
        continue;
      }

      // Map critical vars
      if (key === 'DATABASE_URL') config.databaseUrl = param.Value.replace(/\\\$/g, '$');
      if (key === 'QUEUE_DATABASE_URL') config.queueDatabaseUrl = param.Value;
      if (key === 'AWS_BUCKET_NAME') config.s3.bucket = param.Value;
    }

    logger.info(`[Config] Successfully overlaid SSM settings from "${path}"`);
  } catch (error) {
    logger.warn(`[Config] SSM hydration failed: ${error instanceof Error ? error.message : 'Unknown'}. Using local .env.`);
  }
}
