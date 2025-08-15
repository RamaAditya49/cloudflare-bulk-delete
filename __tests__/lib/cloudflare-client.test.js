import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { CloudflareClient } from '../../src/lib/cloudflare-client.js';

// Mock axios
const mockAxios = {
  defaults: { headers: { common: {} } },
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
  create: jest.fn(() => mockAxios)
};

jest.unstable_mockModule('axios', () => ({
  default: mockAxios
}));

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
      expect(() => new CloudflareClient(null, mockAccountId)).toThrow('API token is required');
    });

    test('should throw error if account ID is missing', () => {
      expect(() => new CloudflareClient(mockToken, null)).toThrow('Account ID is required');
    });
  });

  describe('makeRequest', () => {
    test('should make successful API request', async () => {
      const mockResponse = {
        data: {
          success: true,
          result: { test: 'data' }
        }
      };
      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await client.makeRequest('GET', '/test');

      expect(result).toEqual({ test: 'data' });
      expect(mockAxios.get).toHaveBeenCalledWith('/test', undefined);
    });

    test('should handle API errors', async () => {
      const mockError = {
        response: {
          data: {
            success: false,
            errors: [{ message: 'API Error' }]
          }
        }
      };
      mockAxios.get.mockRejectedValue(mockError);

      await expect(client.makeRequest('GET', '/test')).rejects.toThrow('API Error');
    });

    test('should handle network errors', async () => {
      const networkError = new Error('Network Error');
      mockAxios.get.mockRejectedValue(networkError);

      await expect(client.makeRequest('GET', '/test')).rejects.toThrow('Network Error');
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
      mockAxios.get.mockResolvedValue(mockResponse);

      const result = await client.validateConnection();

      expect(result).toEqual({
        valid: true,
        tokenInfo: { user: 'test@example.com' },
        method: 'account-specific'
      });
    });

    test('should handle invalid token', async () => {
      const mockError = {
        response: {
          data: {
            success: false,
            errors: [{ message: 'Invalid token' }]
          }
        }
      };
      mockAxios.get.mockRejectedValue(mockError);

      const result = await client.validateConnection();

      expect(result.valid).toBe(false);
    });
  });
});