import { SSMClient, GetParametersByPathCommand } from '@aws-sdk/client-ssm';

const region = process.env.AWS_REGION || 'ap-south-1';
const env = process.env.NODE_ENV || 'production';
const path = `/web-scraper/${env}/`;

const ssm = new SSMClient({ region });

async function fetchAndPrint() {
  try {
    const command = new GetParametersByPathCommand({
      Path: path,
      WithDecryption: true,
      Recursive: true
    });

    const response = await ssm.send(command);
    
    if (response.Parameters) {
      for (const param of response.Parameters) {
        if (!param.Name || !param.Value) continue;
        const key = param.Name.replace(path, '');
        
        // Skip the complex JSON config object for shell exports
        if (key === 'config') continue;
        
        // Print in a format shell can eval: export KEY='VALUE'
        // Escape single quotes in the value
        const safeValue = param.Value.replace(/'/g, "'\\''");
        console.log(`export ${key}='${safeValue}'`);
      }
    }
  } catch (e) {
    console.error(`Error fetching SSM params: ${e}`);
    process.exit(1);
  }
}

fetchAndPrint();
