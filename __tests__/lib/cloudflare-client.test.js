import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Create proper axios mock
const mockAxiosInstance = {
  get: jest.fn(),
  post: jest.fn(),
  delete: jest.fn(),
  interceptors: {
    response: {
      use: jest.fn()
    }
  }
};

const mockAxios = {
  create: jest.fn(() => mockAxiosInstance),
  defaults: { headers: { common: {} } }
};

jest.unstable_mockModule('axios', () => ({
  default: mockAxios
}));

// Mock config
jest.unstable_mockModule('../../src/config/config.js', () => ({
  config: {
    cloudflare: {
      apiToken: 'default-token',
      accountId: 'default-account',
      baseUrl: 'https://api.cloudflare.com/client/v4',
      rateLimit: {
        concurrent: 5,
        delay: 100
      }
    },
    cli: {
      timeout: 30000
    }
  }
}));

// Mock logger
jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    error: jest.fn(),
    debug: jest.fn(),
    info: jest.fn()
  }
}));

// Import after mocking
const { CloudflareClient } = await import('../../src/lib/cloudflare-client.js');

describe('CloudflareClient', () => {
  let client;
  const mockToken = 'test-api-token';
  const mockAccountId = 'test-account-id';

  beforeEach(() => {
    jest.clearAllMocks();
    client = new CloudflareClient(mockToken, mockAccountId);
  });

  describe('constructor', () => {
    test('should initialize with token and account ID', () => {
      expect(client.apiToken).toBe(mockToken);
      expect(client.accountId).toBe(mockAccountId);
    });

    test('should throw error if token is missing', () => {
      expect(() => new CloudflareClient(null, mockAccountId)).toThrow('API Token and Account ID are required for Cloudflare Client');
    });

    test('should throw error if account ID is missing', () => {
      expect(() => new CloudflareClient(mockToken, null)).toThrow('API Token and Account ID are required for Cloudflare Client');
    });
  });

  describe('get method', () => {
    test('should make successful GET request', async () => {
      const mockResponse = {
        data: {
          success: true,
          result: { test: 'data' }
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.get('/test');

      expect(result).toEqual(mockResponse.data);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test', { params: {} });
    });

    test('should handle GET request with parameters', async () => {
      const mockResponse = { data: { success: true, result: [] } };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const params = { page: 1, limit: 10 };
      await client.get('/test', params);

      expect(mockAxiosInstance.get).toHaveBeenCalledWith('/test', { params });
    });
  });

  describe('validateConnection', () => {
    test('should validate successful connection', async () => {
      const mockResponse = {
        data: {
          success: true,
          result: { user: 'test@example.com' }
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await client.validateConnection();

      expect(result).toEqual({
        valid: true,
        tokenInfo: { user: 'test@example.com' },
        method: 'account-specific'
      });
    });

    test('should handle invalid token and fallback to general validation', async () => {
      // First call fails (account-specific)
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('Account validation failed'));
      // Second call fails (general)
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('General validation failed'));

      const result = await client.validateConnection();

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Both validation methods failed');
    });
  });
});
