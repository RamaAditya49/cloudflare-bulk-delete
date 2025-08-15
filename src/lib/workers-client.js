import { CloudflareClient } from './cloudflare-client.js';
import { logger, ProgressLogger } from '../utils/logger.js';
import dayjs from 'dayjs';

/**
 * Cloudflare Workers Client
 * Specialized for handling Cloudflare Workers deployments operations
 */
export class WorkersClient extends CloudflareClient {
  constructor(apiToken, accountId) {
    super(apiToken, accountId);
    this.serviceType = 'workers';
  }

  /**
   * List all Workers scripts in account
   */
  async listScripts() {
    try {
      logger.info('Fetching list of Cloudflare Workers scripts...');

      const response = await this.get(`/accounts/${this.accountId}/workers/scripts`);

      if (response.success) {
        logger.info(`Found ${response.result.length} Workers scripts`);
        return response.result;
      } else {
        throw new Error('Failed to fetch Workers scripts');
      }
    } catch (error) {
      logger.error('Failed to fetch Workers scripts list:', error.message);
      throw error;
    }
  }

  /**
   * Get specific script details
   */
  async getScript(scriptName) {
    try {
      const response = await this.get(`/accounts/${this.accountId}/workers/scripts/${scriptName}`);

      if (response.success) {
        return response.result;
      } else {
        throw new Error(`Failed to fetch script ${scriptName}`);
      }
    } catch (error) {
      logger.error(`Failed to fetch script ${scriptName} details:`, error.message);
      throw error;
    }
  }

  /**
   * List deployments for specific Worker script
   * Note: Workers uses different concept - each deployment is a script version
   */
  async listDeployments(scriptName, options = {}) {
    try {
      const { page = 1, perPage = 25 } = options;

      logger.info(`Fetching deployment history for Worker ${scriptName} (page ${page})...`);

      const params = {
        page,
        per_page: perPage
      };

      // Workers API uses a different endpoint for deployment history
      const response = await this.get(
        `/accounts/${this.accountId}/workers/scripts/${scriptName}/deployments`,
        params
      );

      if (response.success) {
        return {
          deployments: response.result,
          pagination: response.result_info || {}
        };
      } else {
        throw new Error(`Failed to fetch deployments for ${scriptName}`);
      }
    } catch (error) {
      // If deployments endpoint is not available, try script versions
      logger.debug('Deployment endpoint not available, trying script versions...');
      return await this.listScriptVersions(scriptName, options);
    }
  }

  /**
   * List script versions as alternative to deployments
   */
  async listScriptVersions(scriptName, options = {}) {
    try {
      const { page = 1, perPage = 25 } = options;

      logger.info(`Fetching versions for Worker ${scriptName}...`);

      const params = {
        page,
        per_page: perPage
      };

      const response = await this.get(
        `/accounts/${this.accountId}/workers/scripts/${scriptName}/versions`,
        params
      );

      if (response.success) {
        // Transform versions to look like deployments for consistency
        const transformedVersions = response.result.map(version => ({
          id: version.id,
          created_on: version.created_on,
          modified_on: version.modified_on,
          version: version.number,
          metadata: version.metadata,
          environment: 'production', // Workers usually production
          status: 'active' // Assume active if exists
        }));

        return {
          deployments: transformedVersions,
          pagination: response.result_info || {}
        };
      } else {
        throw new Error(`Failed to fetch versions for ${scriptName}`);
      }
    } catch (error) {
      logger.error(`Failed to fetch versions for ${scriptName}:`, error.message);
      throw error;
    }
  }

  /**
   * List ALL deployments/versions for specific Worker script
   */
  async listAllDeployments(scriptName, options = {}) {
    try {
      const { maxAge = null } = options;

      logger.info(`Fetching all deployments for Worker ${scriptName}...`);

      let allDeployments = [];
      let page = 1;
      let hasMore = true;
      const perPage = 100;

      while (hasMore) {
        const result = await this.listDeployments(scriptName, {
          page,
          perPage
        });

        const deployments = result.deployments;
        allDeployments = allDeployments.concat(deployments);

        hasMore = deployments.length === perPage;
        page++;

        if (page > 50) {
          // Safety limit for Workers
          logger.warn('Reached maximum 50 pages limit, stopping...');
          break;
        }
      }

      // Apply age filter if needed
      let filteredDeployments = allDeployments;

      if (maxAge) {
        const cutoffDate = dayjs().subtract(maxAge, 'day');
        filteredDeployments = filteredDeployments.filter(deployment => {
          return dayjs(deployment.created_on).isAfter(cutoffDate);
        });
        logger.info(
          `Age-based filter: ${filteredDeployments.length} deployments newer than ${maxAge} days`
        );
      }

      logger.info(`Total deployments for ${scriptName}: ${filteredDeployments.length}`);
      return filteredDeployments;
    } catch (error) {
      logger.error(`Failed to fetch all deployments for ${scriptName}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete Worker script version or deployment
   */
  async deleteDeployment(scriptName, deploymentId) {
    try {
      logger.debug(`Deleting deployment ${deploymentId} from Worker ${scriptName}...`);

      // Try deployment-specific deletion first
      let response;
      try {
        response = await this.delete(
          `/accounts/${this.accountId}/workers/scripts/${scriptName}/deployments/${deploymentId}`
        );
      } catch (error) {
        // Fall back to version deletion
        logger.debug('Trying to delete as version...');
        response = await this.delete(
          `/accounts/${this.accountId}/workers/scripts/${scriptName}/versions/${deploymentId}`
        );
      }

      if (response.success) {
        logger.debug(`Deployment ${deploymentId} successfully deleted`);
        return true;
      } else {
        throw new Error(`Failed to delete deployment ${deploymentId}`);
      }
    } catch (error) {
      logger.error(`Failed to delete deployment ${deploymentId}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete entire Worker script
   * WARNING: This will permanently delete the script and all its versions/deployments
   */
  async deleteScript(scriptName, options = {}) {
    const { dryRun = false } = options;

    try {
      logger.info(`${dryRun ? '[DRY RUN] ' : ''}Deleting Worker script: ${scriptName}`);

      if (dryRun) {
        logger.info(
          `[DRY RUN] Would permanently delete script "${scriptName}" and all its versions`
        );
        return { success: true, dryRun: true };
      }

      // First, try to get script info to verify it exists
      const _script = await this.getScript(scriptName);
      logger.info(`Found script "${scriptName}" - proceeding with deletion`);

      const response = await this.delete(
        `/accounts/${this.accountId}/workers/scripts/${scriptName}`
      );

      if (response.success) {
        logger.info(`✓ Worker script "${scriptName}" successfully deleted`);
        return { success: true };
      } else {
        throw new Error(`Failed to delete script ${scriptName}`);
      }
    } catch (error) {
      logger.error(`Failed to delete script ${scriptName}:`, error.message);
      throw error;
    }
  }

  /**
   * Bulk delete deployments for specific Worker script
   */
  async bulkDeleteDeployments(scriptName, deployments, options = {}) {
    const { skipLatest = true, dryRun = false } = options;

    if (!Array.isArray(deployments) || deployments.length === 0) {
      logger.warn('No deployments to delete');
      return { success: 0, failed: 0, skipped: 0 };
    }

    // Filter latest deployment if needed
    let deploymentsToDelete = deployments;
    let skippedCount = 0;

    if (skipLatest && deployments.length > 0) {
      // Sort by created date and skip the latest one
      const sorted = [...deployments].sort(
        (a, b) => dayjs(b.created_on).valueOf() - dayjs(a.created_on).valueOf()
      );

      deploymentsToDelete = sorted.slice(1); // Skip first (latest)
      skippedCount = 1;

      logger.debug(`Skipping latest deployment: ${sorted[0].id}`);
    }

    if (dryRun) {
      logger.info(
        `[DRY RUN] Will delete ${deploymentsToDelete.length} deployments (${skippedCount} skipped)`
      );
      deploymentsToDelete.forEach(deployment => {
        logger.info(
          `[DRY RUN] - ${deployment.id} (v${deployment.version || 'unknown'}) - ${deployment.created_on}`
        );
      });
      return { success: 0, failed: 0, skipped: skippedCount, dryRun: true };
    }

    logger.info(
      `Starting bulk delete of ${deploymentsToDelete.length} deployments for Worker ${scriptName}...`
    );

    const progressLogger = new ProgressLogger(deploymentsToDelete.length, 'Bulk Delete Workers');
    let successCount = 0;
    let failedCount = 0;

    for (const deployment of deploymentsToDelete) {
      try {
        await this.deleteDeployment(scriptName, deployment.id);
        successCount++;
        progressLogger.increment(deployment.id);
      } catch (error) {
        failedCount++;
        progressLogger.increment(deployment.id, error);
      }
    }

    const stats = progressLogger.complete();

    return {
      success: successCount,
      failed: failedCount,
      skipped: skippedCount,
      total: deployments.length,
      duration: stats.duration,
      rate: stats.rate
    };
  }

  /**
   * Get deployment statistics for Worker script
   */
  async getDeploymentStats(scriptName, options = {}) {
    try {
      const deployments = await this.listAllDeployments(scriptName, options);

      const stats = {
        total: deployments.length,
        byVersion: {},
        byMonth: {},
        oldest: null,
        newest: null,
        scriptName
      };

      deployments.forEach(deployment => {
        // Group by version
        const version = deployment.version || 'unknown';
        stats.byVersion[version] = (stats.byVersion[version] || 0) + 1;

        // Group by month
        const month = dayjs(deployment.created_on).format('YYYY-MM');
        stats.byMonth[month] = (stats.byMonth[month] || 0) + 1;

        // Track oldest and newest
        const createdOn = dayjs(deployment.created_on);
        if (!stats.oldest || createdOn.isBefore(stats.oldest)) {
          stats.oldest = createdOn.toISOString();
        }
        if (!stats.newest || createdOn.isAfter(stats.newest)) {
          stats.newest = createdOn.toISOString();
        }
      });

      return stats;
    } catch (error) {
      logger.error(`Failed to get statistics for ${scriptName}:`, error.message);
      throw error;
    }
  }
}

// Default export
export default WorkersClient;
