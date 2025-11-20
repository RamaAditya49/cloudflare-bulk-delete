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
const { PagesClient } = await import('../../src/lib/pages-client.js');

describe('PagesClient', () => {
  let pagesClient;
  const mockToken = 'test-token';
  const mockAccountId = 'test-account';

  beforeEach(() => {
    jest.clearAllMocks();
    pagesClient = new PagesClient(mockToken, mockAccountId);
  });

  describe('listProjects', () => {
    test('should fetch and return all projects', async () => {
      const mockResponse = {
        data: {
          success: true,
          result: [
            { name: 'project1', id: '1' },
            { name: 'project2', id: '2' }
          ]
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await pagesClient.listProjects();

      expect(result).toEqual(mockResponse.data.result);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/accounts/${mockAccountId}/pages/projects`,
        { params: {} }
      );
    });
  });

  describe('getProject', () => {
    test('should fetch specific project details', async () => {
      const mockResponse = {
        data: {
          success: true,
          result: { name: 'test-project', id: '123' }
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await pagesClient.getProject('test-project');

      expect(result).toEqual(mockResponse.data.result);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/accounts/${mockAccountId}/pages/projects/test-project`,
        { params: {} }
      );
    });
  });

  describe('listAllDeployments', () => {
    test('should fetch all deployments for project', async () => {
      const mockResponse = {
        data: {
          success: true,
          result: [
            { id: 'deploy1', environment: 'preview', created_on: '2023-01-01T00:00:00Z' },
            { id: 'deploy2', environment: 'production', created_on: '2023-01-02T00:00:00Z' }
          ]
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      const result = await pagesClient.listAllDeployments('test-project');

      expect(result).toEqual(mockResponse.data.result);
      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/accounts/${mockAccountId}/pages/projects/test-project/deployments`,
        { params: {} }
      );
    });

    test('should apply environment filter', async () => {
      const mockResponse = {
        data: {
          success: true,
          result: [{ id: 'deploy1', environment: 'preview', created_on: '2023-01-01T00:00:00Z' }]
        }
      };
      mockAxiosInstance.get.mockResolvedValue(mockResponse);

      await pagesClient.listAllDeployments('test-project', { environment: 'preview' });

      expect(mockAxiosInstance.get).toHaveBeenCalledWith(
        `/accounts/${mockAccountId}/pages/projects/test-project/deployments`,
        { params: { env: 'preview' } }
      );
    });
  });

  describe('deleteDeployment', () => {
    test('should delete deployment successfully with force=true by default', async () => {
      const mockResponse = { data: { success: true } };
      mockAxiosInstance.delete.mockResolvedValue(mockResponse);

      const result = await pagesClient.deleteDeployment('test-project', 'deploy-id');

      expect(result).toBe(true);
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        `/accounts/${mockAccountId}/pages/projects/test-project/deployments/deploy-id`,
        { params: { force: true } }
      );
    });

    test('should delete deployment with force=true explicitly', async () => {
      const mockResponse = { data: { success: true } };
      mockAxiosInstance.delete.mockResolvedValue(mockResponse);

      const result = await pagesClient.deleteDeployment('test-project', 'deploy-id', {
        force: true
      });

      expect(result).toBe(true);
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        `/accounts/${mockAccountId}/pages/projects/test-project/deployments/deploy-id`,
        { params: { force: true } }
      );
    });

    test('should delete deployment without force parameter when force=false', async () => {
      const mockResponse = { data: { success: true } };
      mockAxiosInstance.delete.mockResolvedValue(mockResponse);

      const result = await pagesClient.deleteDeployment('test-project', 'deploy-id', {
        force: false
      });

      expect(result).toBe(true);
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        `/accounts/${mockAccountId}/pages/projects/test-project/deployments/deploy-id`,
        { params: {} }
      );
    });
  });

  describe('bulkDeleteDeployments', () => {
    test('should delete multiple deployments', async () => {
      const deployments = [
        { id: 'deploy1', environment: 'preview', created_on: '2023-01-01T00:00:00Z' },
        { id: 'deploy2', environment: 'preview', created_on: '2023-01-02T00:00:00Z' }
      ];

      const mockResponse = { data: { success: true } };
      mockAxiosInstance.delete.mockResolvedValue(mockResponse);

      const result = await pagesClient.bulkDeleteDeployments('test-project', deployments, {
        skipProduction: false, // Don't skip any to delete both
        keepLatest: 0 // Don't keep any latest
      });

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(2);
      expect(mockAxiosInstance.delete).toHaveBeenCalledTimes(2);
    });

    test('should handle dry run mode', async () => {
      const deployments = [
        { id: 'deploy1', environment: 'preview', created_on: '2023-01-01T00:00:00Z' }
      ];

      const result = await pagesClient.bulkDeleteDeployments('test-project', deployments, {
        dryRun: true
      });

      expect(result.dryRun).toBe(true);
      expect(mockAxiosInstance.delete).not.toHaveBeenCalled();
    });
  });

  describe('deleteProject', () => {
    test('should delete entire project successfully', async () => {
      // Mock getProject call
      const projectResponse = { data: { success: true, result: { name: 'test-project' } } };
      // Mock delete call
      const deleteResponse = { data: { success: true } };

      mockAxiosInstance.get.mockResolvedValueOnce(projectResponse);
      mockAxiosInstance.delete.mockResolvedValueOnce(deleteResponse);

      const result = await pagesClient.deleteProject('test-project');

      expect(result.success).toBe(true);
      expect(mockAxiosInstance.delete).toHaveBeenCalledWith(
        `/accounts/${mockAccountId}/pages/projects/test-project`,
        { params: {} }
      );
    });

    test('should handle dry run for project deletion', async () => {
      const result = await pagesClient.deleteProject('test-project', { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(mockAxiosInstance.delete).not.toHaveBeenCalled();
    });
  });
});
