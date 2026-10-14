import { CloudflareClient } from './cloudflare-client.js';
import { isUndeletableDeploymentError } from './deployment-errors.js';
import { logger, ProgressLogger } from '../utils/logger.js';
import dayjs from 'dayjs';

const WORKER_VERSION_DELETE_LIMIT =
  'Cloudflare does not let an API token delete Worker versions. This tool deletes historical deployments only, and the deployment serving traffic stays in place.';

function normalizeWorkerDeployments(result) {
  if (Array.isArray(result)) {
    return result.map(mapWorkerDeployment);
  }

  if (result && Array.isArray(result.deployments)) {
    return result.deployments.map(mapWorkerDeployment);
  }

  throw new Error(
    `Cloudflare returned Worker records that are not deployments. ${WORKER_VERSION_DELETE_LIMIT}`
  );
}

function mapWorkerDeployment(deployment) {
  const versionId = deployment.versions?.[0]?.version_id;

  return {
    ...deployment,
    id: deployment.id,
    created_on: deployment.created_on,
    version: versionId || deployment.version || deployment.number || 'unknown',
    environment: deployment.environment || 'production',
    recordType: 'deployment'
  };
}

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
   * List deployments for a Worker script.
   * The first deployment returned by Cloudflare is the one serving traffic.
   * Script versions are a separate record and cannot be deleted with an API token.
   */
  async listDeployments(scriptName, options = {}) {
    try {
      const { page = 1, perPage = 25 } = options;

      logger.info(`Fetching deployment history for Worker ${scriptName} (page ${page})...`);

      const params = {
        page,
        per_page: perPage
      };

      const response = await this.get(
        `/accounts/${this.accountId}/workers/scripts/${scriptName}/deployments`,
        params
      );

      if (!response.success) {
        throw new Error(`Failed to fetch deployments for ${scriptName}`);
      }

      return {
        deployments: normalizeWorkerDeployments(response.result),
        pagination: response.result_info || {}
      };
    } catch (error) {
      if (
        error.status ||
        error.message?.includes('Worker versions') ||
        error.message?.includes('not deployments')
      ) {
        throw error;
      }

      throw new Error(`${error.message}. ${WORKER_VERSION_DELETE_LIMIT}`);
    }
  }

  /**
   * List every Worker deployment. Versions are not included because they cannot be deleted.
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
        const pagination = result.pagination || {};
        allDeployments = allDeployments.concat(deployments);

        hasMore = pagination.total_pages
          ? page < pagination.total_pages
          : deployments.length === perPage;
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
          return dayjs(deployment.created_on).isBefore(cutoffDate);
        });
        logger.info(
          `Age-based filter: ${filteredDeployments.length} deployments older than ${maxAge} days`
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

      const response = await this.delete(
        `/accounts/${this.accountId}/workers/scripts/${scriptName}/deployments/${deploymentId}`
      );

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
      deploymentsToDelete = deployments.slice(1);
      skippedCount = 1;

      logger.debug(`Skipping latest deployment: ${deployments[0].id}`);
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
        if (isUndeletableDeploymentError(error)) {
          skippedCount++;
          logger.warn(
            `Skipped protected Worker deployment ${deployment.id}: ${error.message}. The deployment serving traffic cannot be deleted.`
          );
          progressLogger.increment(deployment.id);
          continue;
        }

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
