import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { ServiceManager } from '../../src/lib/service-manager.js';

// Mock fetch to simulate Cloudflare API responses
global.fetch = jest.fn();

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
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [
            { name: 'test-project', id: 'proj-123' },
            { name: 'another-project', id: 'proj-456' }
          ]
        })
      });

      // Mock list deployments response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
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
        })
      });

      // Mock bulk delete responses (2 preview deployments)
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
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

      // Bulk delete preview deployments
      const deleteResult = await serviceManager.bulkDeleteDeployments(
        'pages', 'test-project', previewDeployments
      );

      expect(deleteResult.success).toBe(2);
      expect(deleteResult.failed).toBe(0);
      expect(deleteResult.total).toBe(2);
    });

    test('should handle pages project deletion workflow', async () => {
      // Mock list projects
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [{ name: 'old-project', id: 'proj-old' }]
        })
      });

      // Mock delete project
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      const resources = await serviceManager.listAllResources();
      const projectToDelete = resources.pages[0];

      const deleteResult = await serviceManager.deleteResource('pages', projectToDelete.name);
      expect(deleteResult.success).toBe(true);
    });
  });

  describe('Workers Complete Cleanup Workflow', () => {
    test('should handle complete workers deployment cleanup workflow', async () => {
      // Mock list scripts
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [
            { id: 'worker-1', script: 'test-worker' },
            { id: 'worker-2', script: 'another-worker' }
          ]
        })
      });

      // Mock list versions/deployments
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: {
            items: [
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
        })
      });

      // Mock delete version responses (keep latest, delete 2 older)
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      const resources = await serviceManager.listAllResources();
      expect(resources.workers).toHaveLength(2);

      const deployments = await serviceManager.listDeployments('workers', 'test-worker');
      expect(deployments).toHaveLength(3);

      // Keep latest (version-3), delete older versions
      const versionsToDelete = deployments.slice(0, -1); // All except last
      
      const deleteResult = await serviceManager.bulkDeleteDeployments(
        'workers', 'test-worker', versionsToDelete, { keepLatest: true }
      );

      expect(deleteResult.success).toBe(2);
      expect(deleteResult.failed).toBe(0);
      expect(deleteResult.total).toBe(2);
    });

    test('should handle workers script deletion workflow', async () => {
      // Mock list scripts
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [{ id: 'old-worker', script: 'deprecated-worker' }]
        })
      });

      // Mock delete script
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });

      const resources = await serviceManager.listAllResources();
      const scriptToDelete = resources.workers[0];

      const deleteResult = await serviceManager.deleteResource('workers', scriptToDelete.script);
      expect(deleteResult.success).toBe(true);
    });
  });

  describe('Mixed Resource Cleanup Workflow', () => {
    test('should handle cleanup across both pages and workers', async () => {
      // Mock list all resources (both pages and workers)
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [
            { name: 'test-page', id: 'page-1' }
          ]
        })
      });
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [
            { id: 'worker-1', script: 'test-worker' }
          ]
        })
      });

      // Mock deployments for both
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [
            { id: 'page-deploy-1', environment: 'preview' },
            { id: 'page-deploy-2', environment: 'preview' }
          ]
        })
      });
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: {
            items: [
              { id: 'worker-version-1', number: '1' },
              { id: 'worker-version-2', number: '2' }
            ]
          }
        })
      });

      // Mock bulk delete operations
      fetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      const resources = await serviceManager.listAllResources();
      expect(resources.pages).toHaveLength(1);
      expect(resources.workers).toHaveLength(1);

      // Get deployments for both resource types
      const pageDeployments = await serviceManager.listDeployments('pages', 'test-page');
      const workerDeployments = await serviceManager.listDeployments('workers', 'test-worker');

      // Bulk delete from both
      const pageResults = await serviceManager.bulkDeleteDeployments(
        'pages', 'test-page', pageDeployments
      );
      const workerResults = await serviceManager.bulkDeleteDeployments(
        'workers', 'test-worker', workerDeployments
      );

      expect(pageResults.success).toBe(2);
      expect(workerResults.success).toBe(2);
    });
  });

  describe('Error Handling in Workflows', () => {
    test('should handle API failures gracefully during workflow', async () => {
      // Mock initial success, then failure
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [{ name: 'test-project', id: 'proj-1' }]
        })
      });

      // Mock API failure
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          errors: [{ message: 'Invalid token' }]
        })
      });

      const resources = await serviceManager.listAllResources();
      expect(resources.pages).toHaveLength(1);

      // This should handle the API failure gracefully
      const deployments = await serviceManager.listDeployments('pages', 'test-project');
      expect(deployments).toEqual([]); // Should return empty array on error
    });

    test('should handle partial deletion failures', async () => {
      // Mock list deployments
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          result: [
            { id: 'deploy-1', environment: 'preview' },
            { id: 'deploy-2', environment: 'preview' }
          ]
        })
      });

      // Mock partial failure (first succeeds, second fails)
      fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true })
      });
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          success: false,
          errors: [{ message: 'Deployment not found' }]
        })
      });

      const deployments = await serviceManager.listDeployments('pages', 'test-project');
      const result = await serviceManager.bulkDeleteDeployments(
        'pages', 'test-project', deployments
      );

      expect(result.success).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.total).toBe(2);
    });
  });
});