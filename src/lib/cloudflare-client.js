import axios from 'axios';
import pLimit from 'p-limit';
import { config } from '../config/config.js';
import { logger } from '../utils/logger.js';

/**
 * Base Cloudflare API Client
 * Provides basic functions for interacting with Cloudflare API
 */
export class CloudflareClient {
  constructor(apiToken = config.cloudflare.apiToken, accountId = config.cloudflare.accountId) {
    if (!apiToken || !accountId) {
      throw new Error('API Token and Account ID are required for Cloudflare Client');
    }

    this.apiToken = apiToken;
    this.accountId = accountId;
    this.baseUrl = config.cloudflare.baseUrl;

    // Setup rate limiting to avoid API throttling
    this.rateLimiter = pLimit(config.cloudflare.rateLimit.concurrent);

    // Setup axios instance with default configuration
    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'cloudflare-bulk-delete/1.0.0'
      },
      timeout: config.cli.timeout
    });

    // Setup response interceptor for error handling
    this.httpClient.interceptors.response.use(
      response => response,
      error => this.handleApiError(error)
    );
  }

  /**
   * Handle API errors with consistent logging and formatting
   */
  handleApiError(error) {
    const errorInfo = {
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data,
      url: error.config?.url,
      method: error.config?.method?.toUpperCase()
    };

    logger.error('Cloudflare API Error:', errorInfo);

    // Custom error messages based on status code
    let message = 'An error occurred while accessing Cloudflare API';

    switch (error.response?.status) {
      case 401:
        message = 'API Token is invalid or lacks permissions';
        break;
      case 403:
        message = 'Access denied. Check API Token permissions';
        break;
      case 404:
        message = 'Resource not found';
        break;
      case 429:
        message = 'Rate limit exceeded. Waiting before retry...';
        break;
      case 500:
      case 502:
      case 503:
        message = 'Server error from Cloudflare. Try again later';
        break;
    }

    const customError = new Error(message);
    customError.originalError = error;
    customError.status = error.response?.status;
    customError.response = error.response?.data;

    throw customError;
  }

  /**
   * Rate-limited request wrapper
   */
  async makeRequest(requestFn) {
    return this.rateLimiter(async () => {
      await this.delay(config.cloudflare.rateLimit.delay);
      return requestFn();
    });
  }

  /**
   * Utility function for delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generic GET request with error handling and rate limiting
   */
  async get(endpoint, params = {}) {
    return this.makeRequest(async () => {
      logger.debug(`GET ${endpoint}`, params);
      const response = await this.httpClient.get(endpoint, { params });
      return response.data;
    });
  }

  /**
   * Generic DELETE request with error handling and rate limiting
   */
  async delete(endpoint, params = {}) {
    return this.makeRequest(async () => {
      logger.debug(`DELETE ${endpoint}`, params);
      const response = await this.httpClient.delete(endpoint, { params });
      return response.data;
    });
  }

  /**
   * Generic POST request with error handling and rate limiting
   */
  async post(endpoint, data = {}) {
    return this.makeRequest(async () => {
      logger.debug(`POST ${endpoint}`, data);
      const response = await this.httpClient.post(endpoint, data);
      return response.data;
    });
  }

  /**
   * Validate API connection and permissions
   */
  async validateConnection() {
    // Try account-specific token verification first
    try {
      const response = await this.get(`/accounts/${this.accountId}/tokens/verify`);

      if (response.success) {
        logger.info('Cloudflare API connection successfully validated (account-specific)');
        return {
          valid: true,
          tokenInfo: response.result,
          method: 'account-specific'
        };
      } else {
        throw new Error('Account-specific token validation failed');
      }
    } catch (accountError) {
      logger.debug('Account-specific validation failed, trying general token verification');

      // Fallback to general token verification
      try {
        const response = await this.get('/user/tokens/verify');

        if (response.success) {
          logger.info('Cloudflare API connection successfully validated (general)');
          return {
            valid: true,
            tokenInfo: response.result,
            method: 'general'
          };
        } else {
          throw new Error('General token validation failed');
        }
      } catch (generalError) {
        logger.error('Connection validation failed on both endpoints:', {
          accountError: accountError.message,
          generalError: generalError.message
        });

        return {
          valid: false,
          error: `Both validation methods failed: ${generalError.message}`
        };
      }
    }
  }

  /**
   * Get account information
   */
  async getAccountInfo() {
    try {
      const response = await this.get(`/accounts/${this.accountId}`);

      if (response.success) {
        return response.result;
      } else {
        throw new Error('Failed to fetch account information');
      }
    } catch (error) {
      logger.error('Failed to get account information:', error.message);
      throw error;
    }
  }
}

// Default export
export default CloudflareClient;
