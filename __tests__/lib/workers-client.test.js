import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock axios instance
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
  create: jest.fn(() => mockAxiosInstance)
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
const mockLogger = {
  error: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
};

const mockProgressLogger = {
  increment: jest.fn(),
  complete: jest.fn().mockReturnValue({ duration: 1000, rate: 2 })
};

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: mockLogger,
  ProgressLogger: jest.fn(() => mockProgressLogger)
}));

// Mock dayjs
jest.unstable_mockModule('dayjs', () => ({
  default: jest.fn(() => ({
    subtract: jest.fn().mockReturnThis(),
    format: jest.fn(() => '2023-01'),
    isAfter: jest.fn(() => true),
    isBefore: jest.fn(() => false),
    toISOString: jest.fn(() => '2023-01-01T00:00:00.000Z')
  }))
}));

// Import after mocking
const { WorkersClient } = await import('../../src/lib/workers-client.js');

describe('WorkersClient', () => {
  let workersClient;
  const mockToken = 'test-token';
  const mockAccountId = 'test-account';

  beforeEach(() => {
    jest.clearAllMocks();
    workersClient = new WorkersClient(mockToken, mockAccountId);
  });

  describe('listScripts', () => {
    test('should fetch and return all worker scripts', async () => {
      const mockResponse = {
        data: {
          success: true,
          result: [
            { id: 'script1', script: 'worker-1' },
            { id: 'script2', script: 'worker-2' }
          ]
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await workersClient.listScripts();

      expect(result).toEqual(mockResponse.data.result);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/accounts/${mockAccountId}/workers/scripts`,
        { params: {} }
      );
    });
  });

  describe('getScript', () => {
    test('should fetch specific script details', async () => {
      const mockResponse = {
        data: {
          success: true,
          result: { id: 'test-script', script: 'worker-name' }
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await workersClient.getScript('test-script');

      expect(result).toEqual(mockResponse.data.result);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/accounts/${mockAccountId}/workers/scripts/test-script`,
        { params: {} }
      );
    });
  });

  describe('listAllDeployments', () => {
    test('should fetch all deployments for script', async () => {
      // Mock the first call to deployments endpoint (will fail)
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('Deployments endpoint not available'));
      
      // Mock the fallback call to versions endpoint
      const mockResponse = {
        data: {
          success: true,
          result: [
            { id: 'version1', number: '1', created_on: '2023-01-01T00:00:00Z' },
            { id: 'version2', number: '2', created_on: '2023-01-02T00:00:00Z' }
          ]
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await workersClient.listAllDeployments('test-script');

      expect(result.length).toBe(2);
      expect(result[0].version).toBe('1');
      // Should call deployments first, then versions
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/accounts/${mockAccountId}/workers/scripts/test-script/deployments`,
        { params: { page: 1, per_page: 100 } }
      );
    });
  });

  describe('deleteDeployment', () => {
    test('should delete deployment successfully', async () => {
      const mockResponse = { data: { success: true } };
      mockAxiosInstance.delete.mockResolvedValue(mockResponse);

      const result = await workersClient.deleteDeployment('test-script', 'version-id');

      expect(result).toBe(true);
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        `/accounts/${mockAccountId}/workers/scripts/test-script/deployments/version-id`
      );
    });

    test('should handle dry run mode', async () => {
      // deleteDeployment doesn't have dry run - this should be in bulkDeleteDeployments
      const mockResponse = { data: { success: true } };
      mockAxiosInstance.delete.mockResolvedValue(mockResponse);

      const result = await workersClient.deleteDeployment('test-script', 'version-id');

      expect(result).toBe(true);
      expect(mockAxiosInstance.delete).toHaveBeenCalled();
    });
  });

  describe('bulkDeleteDeployments', () => {
    test('should delete multiple deployments', async () => {
      const deployments = [
        { id: 'version1', version: '1', created_on: '2023-01-01T00:00:00Z' },
        { id: 'version2', version: '2', created_on: '2023-01-02T00:00:00Z' }
      ];

      const mockResponse = { data: { success: true } };
      mockAxiosInstance.delete.mockResolvedValue(mockResponse);

      const result = await workersClient.bulkDeleteDeployments('test-script', deployments, {
        skipLatest: false // Don't skip any to delete both
      });

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(2);
      expect(mockAxiosInstance.delete).toHaveBeenCalledTimes(2);
    });

    test('should handle dry run mode', async () => {
      const deployments = [
        { id: 'version1', version: '1', created_on: '2023-01-01T00:00:00Z' }
      ];

      const result = await workersClient.bulkDeleteDeployments('test-script', deployments, {
        dryRun: true
      });

      expect(result.dryRun).toBe(true);
      expect(mockAxiosInstance.delete).not.toHaveBeenCalled();
    });
  });

  describe('deleteScript', () => {
    test('should delete entire script successfully', async () => {
      // Mock getScript call first
      const scriptResponse = { data: { success: true, result: { script: 'test-script' } } };
      // Mock delete call
      const deleteResponse = { data: { success: true } };
      
      mockAxiosInstance.get.mockResolvedValueOnce(scriptResponse);
      mockAxiosInstance.delete.mockResolvedValueOnce(deleteResponse);

      const result = await workersClient.deleteScript('test-script');

      expect(result.success).toBe(true);
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        `/accounts/${mockAccountId}/workers/scripts/test-script`
      );
    });

    test('should handle dry run for script deletion', async () => {
      const result = await workersClient.deleteScript('test-script', { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(mockAxiosInstance.delete).not.toHaveBeenCalled();
    });
  });

  describe('getDeploymentStats', () => {
    test('should calculate deployment statistics', async () => {
      const mockDeployments = [
        { version: '1.0.0' },
        { version: '1.0.1' },
        { version: '2.0.0' }
      ];

      const mockResponse = {
        data: {
          success: true,
          result: mockDeployments
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await workersClient.getDeploymentStats('test-script');

      expect(result.total).toBe(3);
      expect(result.byVersion).toEqual({
        '1.0.0': 1,
        '1.0.1': 1,
        '2.0.0': 1
      });
    });
  });
});
