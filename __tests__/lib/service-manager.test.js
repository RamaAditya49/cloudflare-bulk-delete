import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { ServiceManager } from '../../src/lib/service-manager.js';

// Mock the client classes
const mockPagesClient = {
  listProjects: jest.fn(),
  listAllDeployments: jest.fn(),
  bulkDeleteDeployments: jest.fn(),
  deleteProject: jest.fn()
};

const mockWorkersClient = {
  listScripts: jest.fn(),
  listAllDeployments: jest.fn(),
  bulkDeleteDeployments: jest.fn(),
  deleteScript: jest.fn()
};

const mockValidateConnections = jest.fn();

jest.unstable_mockModule('../../src/lib/pages-client.js', () => ({
  PagesClient: jest.fn(() => mockPagesClient)
}));

jest.unstable_mockModule('../../src/lib/workers-client.js', () => ({
  WorkersClient: jest.fn(() => mockWorkersClient)
}));

describe('ServiceManager', () => {
  let serviceManager;
  const mockToken = 'test-token';
  const mockAccountId = 'test-account';

  beforeEach(() => {
    jest.clearAllMocks();
    serviceManager = new ServiceManager(mockToken, mockAccountId);
    serviceManager.validateConnections = mockValidateConnections;
  });

  describe('constructor', () => {
    test('should initialize with token and account ID', () => {
      expect(serviceManager.apiToken).toBe(mockToken);
      expect(serviceManager.accountId).toBe(mockAccountId);
      expect(serviceManager.pages).toBeDefined();
      expect(serviceManager.workers).toBeDefined();
    });

    test('should throw error for missing credentials', () => {
      expect(() => new ServiceManager(null, mockAccountId)).toThrow('API token is required');
      expect(() => new ServiceManager(mockToken, null)).toThrow('Account ID is required');
    });
  });

  describe('listAllResources', () => {
    test('should fetch all pages and workers resources', async () => {
      const mockPages = [{ name: 'page1' }];
      const mockWorkers = [{ name: 'worker1' }];
      
      mockPagesClient.listProjects.mockResolvedValue(mockPages);
      mockWorkersClient.listScripts.mockResolvedValue(mockWorkers);

      const result = await serviceManager.listAllResources();

      expect(result).toEqual({
        pages: mockPages,
        workers: mockWorkers
      });
      expect(mockPagesClient.listProjects).toHaveBeenCalled();
      expect(mockWorkersClient.listScripts).toHaveBeenCalled();
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

      const result = await serviceManager.listDeployments('pages', 'test-project');

      expect(result).toEqual(mockDeployments);
      expect(mockPagesClient.listAllDeployments).toHaveBeenCalledWith('test-project', undefined);
    });

    test('should fetch deployments for workers resource', async () => {
      const mockDeployments = [{ id: 'version1' }];
      mockWorkersClient.listAllDeployments.mockResolvedValue(mockDeployments);

      const result = await serviceManager.listDeployments('workers', 'test-script');

      expect(result).toEqual(mockDeployments);
      expect(mockWorkersClient.listAllDeployments).toHaveBeenCalledWith('test-script', undefined);
    });

    test('should throw error for invalid resource type', async () => {
      await expect(
        serviceManager.listDeployments('invalid', 'test-resource')
      ).rejects.toThrow('Invalid resource type');
    });
  });

  describe('bulkDeleteDeployments', () => {
    test('should delete deployments for pages resource', async () => {
      const deployments = [{ id: 'deploy1' }];
      const mockResult = { success: 1, failed: 0, total: 1 };
      
      mockPagesClient.bulkDeleteDeployments.mockResolvedValue(mockResult);

      const result = await serviceManager.bulkDeleteDeployments(
        'pages', 'test-project', deployments
      );

      expect(result).toEqual(mockResult);
      expect(mockPagesClient.bulkDeleteDeployments).toHaveBeenCalledWith(
        'test-project', deployments, undefined
      );
    });

    test('should delete deployments for workers resource', async () => {
      const deployments = [{ id: 'version1' }];
      const mockResult = { success: 1, failed: 0, total: 1 };
      
      mockWorkersClient.bulkDeleteDeployments.mockResolvedValue(mockResult);

      const result = await serviceManager.bulkDeleteDeployments(
        'workers', 'test-script', deployments
      );

      expect(result).toEqual(mockResult);
      expect(mockWorkersClient.bulkDeleteDeployments).toHaveBeenCalledWith(
        'test-script', deployments, undefined
      );
    });
  });

  describe('deleteResource', () => {
    test('should delete pages project', async () => {
      const mockResult = { success: true };
      mockPagesClient.deleteProject.mockResolvedValue(mockResult);

      const result = await serviceManager.deleteResource('pages', 'test-project');

      expect(result).toEqual(mockResult);
      expect(mockPagesClient.deleteProject).toHaveBeenCalledWith('test-project', undefined);
    });

    test('should delete workers script', async () => {
      const mockResult = { success: true };
      mockWorkersClient.deleteScript.mockResolvedValue(mockResult);

      const result = await serviceManager.deleteResource('workers', 'test-script');

      expect(result).toEqual(mockResult);
      expect(mockWorkersClient.deleteScript).toHaveBeenCalledWith('test-script', undefined);
    });

    test('should throw error for invalid resource type', async () => {
      await expect(
        serviceManager.deleteResource('invalid', 'test-resource')
      ).rejects.toThrow('Invalid resource type');
    });
  });

  describe('validateConnections', () => {
    test('should validate both pages and workers connections', async () => {
      mockValidateConnections.mockResolvedValue({
        overall: true,
        pages: true,
        workers: true
      });

      const result = await serviceManager.validateConnections();

      expect(result.overall).toBe(true);
      expect(result.pages).toBe(true);
      expect(result.workers).toBe(true);
    });

    test('should handle partial validation failure', async () => {
      mockValidateConnections.mockResolvedValue({
        overall: false,
        pages: true,
        workers: false
      });

      const result = await serviceManager.validateConnections();

      expect(result.overall).toBe(false);
      expect(result.pages).toBe(true);
      expect(result.workers).toBe(false);
    });
  });
});