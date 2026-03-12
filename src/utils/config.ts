import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';
import { logger } from './logger';

// These are the ONLY allowed process.env variables (Bootstrap only)
const AWS_REGION = process.env.AWS_REGION || 'ap-south-1';
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || '';
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || '';
const NODE_ENV = process.env.NODE_ENV || 'development';

logger.info(`[Config] Bootstrapping for environment: ${NODE_ENV}`);

const ssmClient = new SSMClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY
  }
});

export const config = {
  env: NODE_ENV,
  port: process.env.PORT || '10000',
  
  // These will be filled EXCLUSIVELY by SSM
  databaseUrl: '',
  queueDatabaseUrl: '',
  
  s3: {
    region: AWS_REGION,
    bucket: '', 
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY
  },

  // Dynamic Settings (Defaults)
  userAgent: 'Mozilla/5.0 (compatible; WebScraper/1.0)',
  timeout: 30000,
  enableS3Upload: false, 
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

export async function hydrateConfig(): Promise<void> {
  const path = `/web-scraper/${config.env}/`;
  
  if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
    throw new Error(`[Config] FATAL: AWS Credentials missing. Cannot fetch config from ${path}`);
  }

  try {
    const command = new GetParametersByPathCommand({
      Path: path,
      WithDecryption: true,
      Recursive: true
    });

    const response = await ssmClient.send(command);
    
    if (!response.Parameters || response.Parameters.length === 0) {
      throw new Error(`[Config] FATAL: No parameters found in SSM path "${path}"`);
    }

    for (const param of response.Parameters) {
      if (!param.Name || !param.Value) continue;
      const key = param.Name.replace(path, '');
      
      if (key === 'config') {
        try {
          Object.assign(config, JSON.parse(param.Value));
        } catch (e) {
          logger.error(`[Config] Failed to parse JSON config: ${e}`);
        }
        continue;
      }

      if (key === 'DATABASE_URL') config.databaseUrl = param.Value.replace(/\\\$/g, '$');
      if (key === 'QUEUE_DATABASE_URL') config.queueDatabaseUrl = param.Value;
      if (key === 'AWS_BUCKET_NAME') config.s3.bucket = param.Value;
    }

    logger.info(`[Config] Successfully hydrated from AWS SSM path "${path}"`);
    
    if (!config.databaseUrl) {
      throw new Error(`[Config] FATAL: DATABASE_URL not found in SSM path "${path}"`);
    }
  } catch (error) {
    logger.error(`[Config] Hydration failed: ${error instanceof Error ? error.message : 'Unknown'}`);
    process.exit(1); // Stop app if config cannot be loaded
  }
}
