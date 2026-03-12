#!/bin/bash

# Configuration for LOCAL DEVELOPMENT environment
ENV="development"
REGION="ap-south-1"

echo "Setting up LOCAL DEVELOPMENT variables in AWS SSM (Path: /web-scraper/$ENV/)..."

# 1. Database (Use your local postgres URL here if you want local DB, or a cloud dev DB)
aws ssm put-parameter --name "/web-scraper/$ENV/DATABASE_URL" --value "postgresql://user:pass@localhost:5432/web_scraper" --type "SecureString" --overwrite --region "$REGION"
aws ssm put-parameter --name "/web-scraper/$ENV/QUEUE_DATABASE_URL" --value "postgresql://user:pass@localhost:5432/web_scraper" --type "SecureString" --overwrite --region "$REGION"

# 2. S3 Configuration (Can be a separate dev bucket)
aws ssm put-parameter --name "/web-scraper/$ENV/AWS_BUCKET_NAME" --value "web-scraper-dev-bucket" --type "String" --overwrite --region "$REGION"

# 3. Dynamic Config JSON (Dev settings: lower concurrency, S3 disabled by default)
CONFIG_JSON='{
  "batchSize": 50,
  "enableS3Upload": false,
  "timeout": 10000,
  "pageConcurrency": {
    "min": 1,
    "max": 2,
    "scaleUpThreshold": 5,
    "scalerCheckIntervalMs": 10000,
    "batchSize": 10,
    "workerFetchIntervalSeconds": 5
  }
}'

aws ssm put-parameter --name "/web-scraper/$ENV/config" --value "$CONFIG_JSON" --type "String" --overwrite --region "$REGION"

echo "Development setup complete. Your local app will now fetch these variables on boot."
