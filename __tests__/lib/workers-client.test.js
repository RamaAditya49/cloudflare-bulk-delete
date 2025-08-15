import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { WorkersClient } from '../../src/lib/workers-client.js';

// Mock the base client
const mockCloudflareClient = {
  makeRequest: jest.fn()
};

jest.unstable_mockModule('../../src/lib/cloudflare-client.js', () => ({
  CloudflareClient: jest.fn(() => mockCloudflareClient)
}));

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
      const mockScripts = [
        { id: 'script1', script: 'worker-1' },
        { id: 'script2', script: 'worker-2' }
      ];
      mockCloudflareClient.makeRequest.mockResolvedValue(mockScripts);

      const result = await workersClient.listScripts();

      expect(result).toEqual(mockScripts);
      expect(mockCloudflareClient.makeRequest).toHaveBeenCalledWith(
        'GET',
        `/accounts/${mockAccountId}/workers/scripts`
      );
    });
  });

  describe('getScript', () => {
    test('should fetch specific script details', async () => {
      const mockScript = { id: 'test-script', script: 'worker-name' };
      mockCloudflareClient.makeRequest.mockResolvedValue(mockScript);

      const result = await workersClient.getScript('test-script');

      expect(result).toEqual(mockScript);
      expect(mockCloudflareClient.makeRequest).toHaveBeenCalledWith(
        'GET',
        `/accounts/${mockAccountId}/workers/scripts/test-script`
      );
    });
  });

  describe('listAllDeployments', () => {
    test('should fetch all deployments for script', async () => {
      const mockDeployments = [
        { id: 'version1', version: '1' },
        { id: 'version2', version: '2' }
      ];
      mockCloudflareClient.makeRequest.mockResolvedValue(mockDeployments);

      const result = await workersClient.listAllDeployments('test-script');

      expect(result).toEqual(mockDeployments);
      expect(mockCloudflareClient.makeRequest).toHaveBeenCalledWith(
        'GET',
        `/accounts/${mockAccountId}/workers/scripts/test-script/versions`
      );
    });

    test('should apply maxAge filter correctly', async () => {
      const mockDeployments = [
        { id: 'version1', created_on: '2023-01-01T00:00:00Z' }
      ];
      mockCloudflareClient.makeRequest.mockResolvedValue(mockDeployments);

      const result = await workersClient.listAllDeployments('test-script', {
        maxAge: 30
      });

      expect(result).toEqual(mockDeployments);
    });
  });

  describe('deleteDeployment', () => {
    test('should delete deployment successfully', async () => {
      mockCloudflareClient.makeRequest.mockResolvedValue({ success: true });

      const result = await workersClient.deleteDeployment('test-script', 'version-id');

      expect(result.success).toBe(true);
      expect(mockCloudflareClient.makeRequest).toHaveBeenCalledWith(
        'DELETE',
        `/accounts/${mockAccountId}/workers/scripts/test-script/versions/version-id`,
        undefined
      );
    });

    test('should handle dry run mode', async () => {
      const result = await workersClient.deleteDeployment('test-script', 'version-id', {
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
        { id: 'version1', version: '1' },
        { id: 'version2', version: '2' }
      ];
      
      mockCloudflareClient.makeRequest.mockResolvedValue({ success: true });

      const result = await workersClient.bulkDeleteDeployments('test-script', deployments);

      expect(result.success).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.total).toBe(2);
      expect(mockCloudflareClient.makeRequest).toHaveBeenCalledTimes(2);
    });

    test('should respect keepLatest option', async () => {
      const deployments = [
        { id: 'version1', version: '1', created_on: '2023-01-01T00:00:00Z' },
        { id: 'version2', version: '2', created_on: '2023-01-02T00:00:00Z' }
      ];
      
      mockCloudflareClient.makeRequest.mockResolvedValue({ success: true });

      const result = await workersClient.bulkDeleteDeployments('test-script', deployments, {
        keepLatest: 1
      });

      expect(result.success).toBe(1);
      expect(result.skipped).toBe(1);
      expect(mockCloudflareClient.makeRequest).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteScript', () => {
    test('should delete entire script successfully', async () => {
      mockCloudflareClient.makeRequest.mockResolvedValue({ success: true });

      const result = await workersClient.deleteScript('test-script');

      expect(result.success).toBe(true);
      expect(mockCloudflareClient.makeRequest).toHaveBeenCalledWith(
        'DELETE',
        `/accounts/${mockAccountId}/workers/scripts/test-script`,
        undefined
      );
    });

    test('should handle dry run for script deletion', async () => {
      const result = await workersClient.deleteScript('test-script', { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(mockCloudflareClient.makeRequest).not.toHaveBeenCalled();
    });
  });

  describe('getDeploymentStats', () => {
    test('should calculate deployment statistics', async () => {
      const mockDeployments = [
        { version: '1.0.0' },
        { version: '1.0.1' },
        { version: '2.0.0' }
      ];
      
      workersClient.listAllDeployments = jest.fn().mockResolvedValue(mockDeployments);

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