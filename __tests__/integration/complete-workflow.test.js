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
const mockConfig = {
  cloudflare: {
    apiToken: 'test-token',
    accountId: 'test-account',
    baseUrl: 'https://api.cloudflare.com/client/v4',
    rateLimit: {
      concurrent: 5,
      delay: 100
    }
  },
  cli: {
    timeout: 30000
  }
};

jest.unstable_mockModule('../../src/config/config.js', () => ({
  config: mockConfig,
  validateConfig: jest.fn()
}));

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
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

// Mock pLimit
jest.unstable_mockModule('p-limit', () => ({
  default: jest.fn(() => (fn) => fn())
}));

// Import after mocking
const { ServiceManager } = await import('../../src/lib/service-manager.js');

describe('Integration Tests - Complete Workflows', () => {
  let serviceManager;
  const mockToken = 'cf-test-token-123';
  const mockAccountId = 'test-account-456';

  beforeEach(() => {
    jest.clearAllMocks();
    serviceManager = new ServiceManager(mockToken, mockAccountId);
  });

  describe('Pages Complete Cleanup Workflow', () => {
    test('should handle complete pages deployment cleanup workflow', async () => {
      // Mock list projects response
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          success: true,
          result: [
            { name: 'test-project', id: 'proj-123', created_on: '2023-01-01' },
            { name: 'another-project', id: 'proj-456', created_on: '2023-01-02' }
          ]
        }
      });

      // Mock empty workers response
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          success: true,
          result: []
        }
      });

      // Mock list deployments response
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          success: true,
          result: [
            {
              id: 'deploy-1',
              url: 'https://deploy-1.test-project.pages.dev',
              environment: 'preview',
              created_on: '2024-01-01T00:00:00Z'
            },
            {
              id: 'deploy-2',
              url: 'https://deploy-2.test-project.pages.dev',
              environment: 'preview',
              created_on: '2024-01-02T00:00:00Z'
            },
            {
              id: 'deploy-3',
              url: 'https://test-project.pages.dev',
              environment: 'production',
              created_on: '2024-01-03T00:00:00Z'
            }
          ]
        }
      });

      // Mock additional get call for total count
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: { success: false }
      });

      // Mock bulk delete responses
      mockAxiosInstance.delete.mockResolvedValue({
        data: { success: true }
      });

      // Get all resources
      const resources = await serviceManager.listAllResources();
      expect(resources.pages).toHaveLength(2);

      // Get deployments for first project
      const deployments = await serviceManager.listDeployments('pages', 'test-project');
      expect(deployments).toHaveLength(3);

      // Filter preview deployments only (exclude production)
      const previewDeployments = deployments.filter(d => d.environment === 'preview');
      expect(previewDeployments).toHaveLength(2);

      // Bulk delete preview deployments with proper options
      const deleteResult = await serviceManager.bulkDeleteDeployments(
        'pages',
        'test-project',
        previewDeployments,
        { skipProduction: false, keepLatest: 0 }
      );

      expect(deleteResult.success).toBe(2);
      expect(deleteResult.failed).toBe(0);
      expect(deleteResult.total).toBe(2);
    });
  });

  describe('Workers Complete Cleanup Workflow', () => {
    test('should handle complete workers deployment cleanup workflow', async () => {
      // Mock empty pages response first
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          success: true,
          result: []
        }
      });

      // Mock list scripts
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          success: true,
          result: [
            { id: 'worker-1', script: 'test-worker', created_on: '2023-01-01' },
            { id: 'worker-2', script: 'another-worker', created_on: '2023-01-02' }
          ]
        }
      });

      // Mock list deployments (first call fails, second succeeds with versions)
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('Deployments endpoint not available'));
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          success: true,
          result: [
            {
              id: 'version-1',
              number: '1',
              created_on: '2024-01-01T00:00:00Z'
            },
            {
              id: 'version-2',
              number: '2',
              created_on: '2024-01-02T00:00:00Z'
            },
            {
              id: 'version-3',
              number: '3',
              created_on: '2024-01-03T00:00:00Z'
            }
          ]
        }
      });

      // Mock delete version responses
      mockAxiosInstance.delete.mockResolvedValue({
        data: { success: true }
      });

      const resources = await serviceManager.listAllResources();
      expect(resources.workers).toHaveLength(2);

      const deployments = await serviceManager.listDeployments('workers', 'test-worker');
      expect(deployments).toHaveLength(3);

      // Delete older versions with skipLatest=false to delete all
      const deleteResult = await serviceManager.bulkDeleteDeployments(
        'workers',
        'test-worker',
        deployments,
        { skipLatest: false }
      );

      expect(deleteResult.success).toBe(3);
      expect(deleteResult.failed).toBe(0);
      expect(deleteResult.total).toBe(3);
    });
  });

  describe('Error Handling in Workflows', () => {
    test('should handle API failures gracefully during workflow', async () => {
      // Mock initial success for pages
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          success: true,
          result: [{ name: 'test-project', id: 'proj-1' }]
        }
      });

      // Mock initial success for workers (empty)
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: {
          success: true,
          result: []
        }
      });

      const resources = await serviceManager.listAllResources();
      expect(resources.pages).toHaveLength(1);
      expect(resources.workers).toHaveLength(0);

      // Mock API failure for deployments
      mockAxiosInstance.get.mockRejectedValueOnce(new Error('API Error'));

      // This should throw the error since ServiceManager doesn't catch it
      await expect(serviceManager.listDeployments('pages', 'test-project')).rejects.toThrow('API Error');
    });
  });
});
