import { describe, test, expect, beforeEach, jest } from '@jest/globals';

// Mock PagesClient
const mockPagesClient = {
  listProjects: jest.fn(),
  listAllDeployments: jest.fn(),
  bulkDeleteDeployments: jest.fn(),
  deleteProject: jest.fn(),
  validateConnection: jest.fn(),
  getDeploymentStats: jest.fn(),
  get: jest.fn(),
  accountId: 'test-account'
};

// Mock WorkersClient
const mockWorkersClient = {
  listScripts: jest.fn(),
  listAllDeployments: jest.fn(),
  bulkDeleteDeployments: jest.fn(),
  deleteScript: jest.fn(),
  validateConnection: jest.fn(),
  getDeploymentStats: jest.fn()
};

// Mock config
const mockConfig = {
  cloudflare: {
    apiToken: 'default-token',
    accountId: 'default-account'
  }
};

const mockValidateConfig = jest.fn();

jest.unstable_mockModule('../../src/lib/pages-client.js', () => ({
  PagesClient: jest.fn(() => mockPagesClient)
}));

jest.unstable_mockModule('../../src/lib/workers-client.js', () => ({
  WorkersClient: jest.fn(() => mockWorkersClient)
}));

jest.unstable_mockModule('../../src/config/config.js', () => ({
  config: mockConfig,
  validateConfig: mockValidateConfig
}));

jest.unstable_mockModule('../../src/utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

// Import after mocking
const { ServiceManager } = await import('../../src/lib/service-manager.js');

describe('ServiceManager', () => {
  let serviceManager;
  const mockToken = 'test-token';
  const mockAccountId = 'test-account';

  beforeEach(() => {
    jest.clearAllMocks();
    serviceManager = new ServiceManager(mockToken, mockAccountId);
  });

  describe('constructor', () => {
    test('should initialize with token and account ID', () => {
      expect(serviceManager.apiToken).toBe(mockToken);
      expect(serviceManager.accountId).toBe(mockAccountId);
      expect(serviceManager.pagesClient).toBeDefined();
      expect(serviceManager.workersClient).toBeDefined();
    });
  });

  describe('listAllResources', () => {
    test('should fetch all pages and workers resources', async () => {
      const mockPages = [{ name: 'page1', id: 'page-1', created_on: '2023-01-01' }];
      const mockWorkers = [{ id: 'worker1', created_on: '2023-01-01' }];

      mockPagesClient.listProjects.mockResolvedValue(mockPages);
      mockWorkersClient.listScripts.mockResolvedValue(mockWorkers);

      const result = await serviceManager.listAllResources();

      expect(result.pages).toHaveLength(1);
      expect(result.workers).toHaveLength(1);
      expect(result.pages[0].type).toBe('pages');
      expect(result.workers[0].type).toBe('workers');
    });

    test('should handle errors gracefully', async () => {
      mockPagesClient.listProjects.mockRejectedValue(new Error('Pages API Error'));
      mockWorkersClient.listScripts.mockResolvedValue([]);

      const result = await serviceManager.listAllResources();

      expect(result.pages).toEqual([]);
      expect(result.workers).toEqual([]);
    });
  });

  describe('listDeployments', () => {
    test('should fetch deployments for pages resource', async () => {
      const mockDeployments = [{ id: 'deploy1' }];
      mockPagesClient.listAllDeployments.mockResolvedValue(mockDeployments);
      mockPagesClient.get.mockResolvedValue({ success: false }); // No total count

      const result = await serviceManager.listDeployments('pages', 'test-project');

      expect(result[0].resourceType).toBe('pages');
      expect(result[0].resourceName).toBe('test-project');
      expect(mockPagesClient.listAllDeployments).toHaveBeenCalledWith('test-project', {});
    });

    test('should fetch deployments for workers resource', async () => {
      const mockDeployments = [{ id: 'version1' }];
      mockWorkersClient.listAllDeployments.mockResolvedValue(mockDeployments);

      const result = await serviceManager.listDeployments('workers', 'test-script');

      expect(result[0].resourceType).toBe('workers');
      expect(result[0].resourceName).toBe('test-script');
      expect(mockWorkersClient.listAllDeployments).toHaveBeenCalledWith('test-script', {});
    });

    test('should throw error for invalid resource type', async () => {
      await expect(serviceManager.listDeployments('invalid', 'test-resource')).rejects.toThrow(
        'Unsupported resource type'
      );
    });
  });

  describe('bulkDeleteDeployments', () => {
    test('should delete deployments for pages resource', async () => {
      const deployments = [{ id: 'deploy1' }];
      const mockResult = { success: 1, failed: 0, total: 1 };

      mockPagesClient.bulkDeleteDeployments.mockResolvedValue(mockResult);

      const result = await serviceManager.bulkDeleteDeployments(
        'pages',
        'test-project',
        deployments
      );

      expect(result.resourceType).toBe('pages');
      expect(result.resourceName).toBe('test-project');
      expect(mockPagesClient.bulkDeleteDeployments).toHaveBeenCalledWith(
        'test-project',
        deployments,
        {}
      );
    });

    test('should delete deployments for workers resource', async () => {
      const deployments = [{ id: 'version1' }];
      const mockResult = { success: 1, failed: 0, total: 1 };

      mockWorkersClient.bulkDeleteDeployments.mockResolvedValue(mockResult);

      const result = await serviceManager.bulkDeleteDeployments(
        'workers',
        'test-script',
        deployments
      );

      expect(result.resourceType).toBe('workers');
      expect(result.resourceName).toBe('test-script');
      expect(mockWorkersClient.bulkDeleteDeployments).toHaveBeenCalledWith(
        'test-script',
        deployments,
        {}
      );
    });
  });

  describe('deleteResource', () => {
    test('should delete pages project', async () => {
      const mockResult = { success: true };
      mockPagesClient.deleteProject.mockResolvedValue(mockResult);

      const result = await serviceManager.deleteResource('pages', 'test-project');

      expect(result.resourceType).toBe('pages');
      expect(result.resourceName).toBe('test-project');
      expect(mockPagesClient.deleteProject).toHaveBeenCalledWith('test-project', {});
    });

    test('should delete workers script', async () => {
      const mockResult = { success: true };
      mockWorkersClient.deleteScript.mockResolvedValue(mockResult);

      const result = await serviceManager.deleteResource('workers', 'test-script');

      expect(result.resourceType).toBe('workers');
      expect(result.resourceName).toBe('test-script');
      expect(mockWorkersClient.deleteScript).toHaveBeenCalledWith('test-script', {});
    });

    test('should throw error for invalid resource type', async () => {
      await expect(serviceManager.deleteResource('invalid', 'test-resource')).rejects.toThrow(
        'Unsupported resource type'
      );
    });
  });

  describe('validateConnections', () => {
    test('should validate both pages and workers connections', async () => {
      mockPagesClient.validateConnection.mockResolvedValue({ valid: true });
      mockWorkersClient.validateConnection.mockResolvedValue({ valid: true });

      const result = await serviceManager.validateConnections();

      expect(result.overall).toBe(true);
      expect(result.pages.valid).toBe(true);
      expect(result.workers.valid).toBe(true);
    });

    test('should handle partial validation failure', async () => {
      mockPagesClient.validateConnection.mockResolvedValue({ valid: true });
      mockWorkersClient.validateConnection.mockResolvedValue({ valid: false });

      const result = await serviceManager.validateConnections();

      expect(result.overall).toBe(false);
      expect(result.pages.valid).toBe(true);
      expect(result.workers.valid).toBe(false);
    });
  });
});
