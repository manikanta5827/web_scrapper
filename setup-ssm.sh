#!/bin/bash

# Configuration: Update these variables
ENV="production" # or development
REGION="ap-south-1"

echo "Uploading configurations to AWS SSM Parameter Store (Region: $REGION, Env: $ENV)..."

# 1. Database & Secrets (Stored as SecureString)
aws ssm put-parameter --name "/web-scraper/$ENV/DATABASE_URL" --value "REPLACE_WITH_DB_URL" --type "SecureString" --overwrite --region "$REGION"
aws ssm put-parameter --name "/web-scraper/$ENV/QUEUE_DATABASE_URL" --value "REPLACE_WITH_QUEUE_URL" --type "SecureString" --overwrite --region "$REGION"

# 2. S3 Configuration (Stored as String)
aws ssm put-parameter --name "/web-scraper/$ENV/AWS_BUCKET_NAME" --value "web-scraper-raw-html" --type "String" --overwrite --region "$REGION"

# 3. Dynamic Config Object (JSON)
# This includes all your scaling and timing parameters
CONFIG_JSON='{
  "batchSize": 100,
  "enableS3Upload": true,
  "timeout": 30000,
  "pageConcurrency": {
    "min": 1,
    "max": 15,
    "scaleUpThreshold": 100,
    "scalerCheckIntervalMs": 20000,
    "batchSize": 100,
    "workerFetchIntervalSeconds": 10
  }
}'

aws ssm put-parameter --name "/web-scraper/$ENV/config" --value "$CONFIG_JSON" --type "String" --overwrite --region "$REGION"

echo "Upload complete. You can now use POST /api/config/refresh to update the running app."
