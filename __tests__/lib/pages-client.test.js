import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { PagesClient } from '../../src/lib/pages-client.js';

// Mock the base client
const mockCloudflareClient = {
  makeRequest: jest.fn()
};

jest.unstable_mockModule('../../src/lib/cloudflare-client.js', () => ({
  CloudflareClient: jest.fn(() => mockCloudflareClient)
}));

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
      const mockProjects = [
        { name: 'project1', id: '1' },
        { name: 'project2', id: '2' }
      ];
      mockCloudflareClient.makeRequest.mockResolvedValue(mockProjects);

      const result = await pagesClient.listProjects();

      expect(result).toEqual(mockProjects);
      expect(mockCloudflareClient.makeRequest).toHaveBeenCalledWith(
        'GET',
        `/accounts/${mockAccountId}/pages/projects`
      );
    });
  });

  describe('getProject', () => {
    test('should fetch specific project details', async () => {
      const mockProject = { name: 'test-project', id: '123' };
      mockCloudflareClient.makeRequest.mockResolvedValue(mockProject);

      const result = await pagesClient.getProject('test-project');

      expect(result).toEqual(mockProject);
      expect(mockCloudflareClient.makeRequest).toHaveBeenCalledWith(
        'GET',
        `/accounts/${mockAccountId}/pages/projects/test-project`
      );
    });
  });

  describe('listAllDeployments', () => {
    test('should fetch all deployments for project', async () => {
      const mockDeployments = [
        { id: 'deploy1', environment: 'preview' },
        { id: 'deploy2', environment: 'production' }
      ];
      mockCloudflareClient.makeRequest.mockResolvedValue(mockDeployments);

      const result = await pagesClient.listAllDeployments('test-project');

      expect(result).toEqual(mockDeployments);
      expect(mockCloudflareClient.makeRequest).toHaveBeenCalledWith(
        'GET',
        `/accounts/${mockAccountId}/pages/projects/test-project/deployments`
      );
    });

    test('should apply filters correctly', async () => {
      const mockDeployments = [
        { id: 'deploy1', environment: 'preview', created_on: '2023-01-01' }
      ];
      mockCloudflareClient.makeRequest.mockResolvedValue(mockDeployments);

      const result = await pagesClient.listAllDeployments('test-project', {
        environment: 'preview',
        maxAge: 30
      });

      expect(result).toEqual(mockDeployments);
    });
  });

  describe('deleteDeployment', () => {
    test('should delete deployment successfully', async () => {
      mockCloudflareClient.makeRequest.mockResolvedValue({ success: true });

      const result = await pagesClient.deleteDeployment('test-project', 'deploy-id');

      expect(result.success).toBe(true);
      expect(mockCloudflareClient.makeRequest).toHaveBeenCalledWith(
        'DELETE',
        `/accounts/${mockAccountId}/pages/projects/test-project/deployments/deploy-id`,
        undefined
      );
    });

    test('should handle dry run mode', async () => {
      const result = await pagesClient.deleteDeployment('test-project', 'deploy-id', {
        dryRun: true
      });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(mockCloudflareClient.makeRequest).not.toHaveBeenCalled();
    });
  });

  describe('bulkDeleteDeployments', () => {
    test('should delete multiple deployments', async () => {
      const deployments = [
        { id: 'deploy1', environment: 'preview' },
        { id: 'deploy2', environment: 'preview' }
      ];
      
      mockCloudflareClient.makeRequest.mockResolvedValue({ success: true });

      const result = await pagesClient.bulkDeleteDeployments('test-project', deployments);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(2);
      expect(mockCloudflareClient.makeRequest).toHaveBeenCalledTimes(2);
    });

    test('should respect production protection', async () => {
      const deployments = [
        { id: 'deploy1', environment: 'preview' },
        { id: 'deploy2', environment: 'production' }
      ];
      
      mockCloudflareClient.makeRequest.mockResolvedValue({ success: true });

      const result = await pagesClient.bulkDeleteDeployments('test-project', deployments, {
        skipProduction: true
      });

      expect(result.success).toBe(1);
      expect(result.skipped).toBe(1);
      expect(mockCloudflareClient.makeRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteProject', () => {
    test('should delete entire project successfully', async () => {
      mockCloudflareClient.makeRequest.mockResolvedValue({ success: true });

      const result = await pagesClient.deleteProject('test-project');

      expect(result.success).toBe(true);
      expect(mockCloudflareClient.makeRequest).toHaveBeenCalledWith(
        'DELETE',
        `/accounts/${mockAccountId}/pages/projects/test-project`,
        undefined
      );
    });

    test('should handle dry run for project deletion', async () => {
      const result = await pagesClient.deleteProject('test-project', { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(mockCloudflareClient.makeRequest).not.toHaveBeenCalled();
    });
  });
});