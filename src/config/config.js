import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

/**
 * Application configuration for Cloudflare Bulk Delete
 */
export const config = {
  // Cloudflare API Configuration
  cloudflare: {
    apiToken: process.env.CLOUDFLARE_API_TOKEN,
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    baseUrl: 'https://api.cloudflare.com/client/v4',
    // Rate limiting to avoid API throttling
    rateLimit: {
      concurrent: 5, // Maximum 5 concurrent requests
      delay: 100 // 100ms delay between requests
    }
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    file: {
      enabled: process.env.LOG_FILE_ENABLED === 'true',
      path: process.env.LOG_FILE_PATH || 'logs/app.log'
    }
  },

  // CLI Configuration
  cli: {
    confirmationRequired: process.env.CONFIRMATION_REQUIRED !== 'false',
    batchSize: parseInt(process.env.BATCH_SIZE) || 10,
    timeout: parseInt(process.env.TIMEOUT) || 30000
  },

  // Filtering Configuration
  filters: {
    maxAge: process.env.MAX_AGE_DAYS ? parseInt(process.env.MAX_AGE_DAYS) : null,
    environment: process.env.FILTER_ENVIRONMENT || null,
    status: process.env.FILTER_STATUS || null
  }
};

/**
 * Validate required configuration
 */
export function validateConfig() {
  const errors = [];

  if (!config.cloudflare.apiToken) {
    errors.push('CLOUDFLARE_API_TOKEN environment variable is required');
  }

  if (!config.cloudflare.accountId) {
    errors.push('CLOUDFLARE_ACCOUNT_ID environment variable is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }

  return true;
}

// Default export for backward compatibility
export default config;
