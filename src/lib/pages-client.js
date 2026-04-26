import { CloudflareClient } from './cloudflare-client.js';
import { logger, ProgressLogger } from '../utils/logger.js';
import dayjs from 'dayjs';

/**
 * Cloudflare Pages Client
 * Specialized for handling Cloudflare Pages deployments operations
 */
export class PagesClient extends CloudflareClient {
  constructor(apiToken, accountId) {
    super(apiToken, accountId);
    this.serviceType = 'pages';
  }

  /**
   * List all Pages projects in account
   */
  async listProjects(options = {}) {
    try {
      const { perPage = 100 } = options;
      logger.info('Fetching list of Cloudflare Pages projects...');

      let projects = [];
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const response = await this.get(`/accounts/${this.accountId}/pages/projects`, {
          page,
          per_page: perPage
        });

        if (!response.success) {
          throw new Error('Failed to fetch Pages projects');
        }

        const currentProjects = response.result || [];
        projects = projects.concat(currentProjects);

        const resultInfo = response.result_info || {};
        hasMore = resultInfo.total_pages
          ? page < resultInfo.total_pages
          : currentProjects.length === perPage;
        page++;
      }

      logger.info(`Found ${projects.length} Pages projects`);
      return projects;
    } catch (error) {
      logger.error('Failed to fetch Pages projects list:', error.message);
      throw error;
    }
  }

  /**
   * Get specific project details
   */
  async getProject(projectName) {
    try {
      const response = await this.get(`/accounts/${this.accountId}/pages/projects/${projectName}`);

      if (response.success) {
        return response.result;
      } else {
        throw new Error(`Failed to fetch project ${projectName}`);
      }
    } catch (error) {
      logger.error(`Failed to fetch project ${projectName} details:`, error.message);
      throw error;
    }
  }

  /**
   * List deployments for specific project with pagination
   */
  async listDeployments(projectName, options = {}) {
    try {
      const { environment = null, page = 1, perPage = 100 } = options;

      logger.info(`Fetching deployments for project ${projectName} (page ${page})...`);

      const params = {
        page,
        per_page: perPage
      };

      // Some APIs use 'env' for environment filter
      if (environment) {
        params.env = environment;
      }

      const response = await this.get(
        `/accounts/${this.accountId}/pages/projects/${projectName}/deployments`,
        params
      );

      if (response.success) {
        return {
          deployments: response.result,
          pagination: response.result_info || {}
        };
      } else {
        throw new Error(`Failed to fetch deployments for ${projectName}`);
      }
    } catch (error) {
      logger.error(`Failed to fetch deployments for ${projectName}:`, error.message);
      throw error;
    }
  }

  /**
   * List ALL deployments for specific project
   */
  async listAllDeployments(projectName, options = {}) {
    try {
      const { environment = null, maxAge = null, status = null } = options;

      logger.info(`Fetching all deployments for project ${projectName}...`);

      let allDeployments = [];
      let totalCount = null;
      let page = 1;
      let hasMore = true;
      const perPage = 100;

      while (hasMore) {
        const result = await this.listDeployments(projectName, {
          environment,
          page,
          perPage
        });
        const deployments = result.deployments || [];
        const pagination = result.pagination || {};

        allDeployments = allDeployments.concat(deployments);
        totalCount = pagination.total_count || totalCount;
        hasMore = pagination.total_pages
          ? page < pagination.total_pages
          : deployments.length === perPage;
        page++;

        if (page > 1000) {
          logger.warn('Reached maximum 1000 pages limit, stopping...');
          break;
        }
      }

      logger.info(
        totalCount
          ? `Retrieved ${allDeployments.length}/${totalCount} deployments from API`
          : `Retrieved ${allDeployments.length} deployments from API`
      );

      // Apply additional filters
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

      if (status) {
        filteredDeployments = filteredDeployments.filter(deployment => {
          return deployment.latest_stage?.status === status;
        });
        logger.info(
          `Status-based filter: ${filteredDeployments.length} deployments with status ${status}`
        );
      }

      // Show final count with total info if available
      if (totalCount && totalCount > filteredDeployments.length) {
        logger.info(
          `Final deployments for ${projectName}: ${filteredDeployments.length} (from ${totalCount} total available)`
        );
      } else if (totalCount) {
        logger.info(
          `Final deployments for ${projectName}: ${filteredDeployments.length}/${totalCount}`
        );
      } else {
        logger.info(`Final deployments for ${projectName}: ${filteredDeployments.length}`);
      }

      return filteredDeployments;
    } catch (error) {
      logger.error(`Failed to fetch all deployments for ${projectName}:`, error.message);
      throw error;
    }
  }

  /**
   * Delete single deployment
   * @param {string} projectName - Name of the Pages project
   * @param {string} deploymentId - ID of the deployment to delete
   * @param {object} options - Deletion options
   * @param {boolean} options.force - Force delete aliased deployments (default: true)
   */
  async deleteDeployment(projectName, deploymentId, options = {}) {
    const { force = true } = options;

    try {
      logger.debug(
        `Deleting deployment ${deploymentId} from project ${projectName}${force ? ' (force mode)' : ''}...`
      );

      const params = {};
      if (force) {
        params.force = true;
      }

      const response = await this.delete(
        `/accounts/${this.accountId}/pages/projects/${projectName}/deployments/${deploymentId}`,
        params
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
   * Bulk delete deployments for specific project
   */
  async bulkDeleteDeployments(projectName, deployments, options = {}) {
    const { skipProduction = true, dryRun = false, keepLatest = 1, force = true } = options;

    if (!Array.isArray(deployments) || deployments.length === 0) {
      logger.warn('No deployments to delete');
      return { success: 0, failed: 0, skipped: 0 };
    }

    // Sort deployments by creation date (newest first) to protect latest deployments
    const sortedDeployments = [...deployments].sort(
      (a, b) => new Date(b.created_on) - new Date(a.created_on)
    );

    // Filter deployments based on protection settings
    let skippedCount = 0;

    if (keepLatest > 0) {
      logger.info(`Latest deployment protection: Keeping latest ${keepLatest} deployments safe`);
    }

    if (skipProduction) {
      logger.info('Production protection: Skipping production deployments');
    }

    const deploymentsToDelete = sortedDeployments.filter((deployment, index) => {
      if (keepLatest > 0 && index < keepLatest) {
        skippedCount++;
        logger.debug(
          `Skipping latest deployment #${index + 1}: ${deployment.id} (${deployment.environment}) - ${deployment.created_on}`
        );
        return false;
      }

      if (skipProduction && deployment.environment === 'production') {
        skippedCount++;
        logger.debug(
          `Skipping production deployment: ${deployment.id} (environment: ${deployment.environment})`
        );
        return false;
      }

      return true;
    });

    if (skippedCount > 0) {
      logger.warn(`⚠️  Production protection: ${skippedCount} deployments will be skipped`);
      const tips = [];

      if (skipProduction) {
        tips.push('use --skip-production false to include production deployments');
      }

      if (keepLatest > 0) {
        tips.push('use --keep-latest 0 to include latest deployments');
      }

      if (tips.length > 0) {
        logger.info(`💡 To include protected deployments, ${tips.join('; ')}`);
      }
    }

    if (dryRun) {
      logger.info(
        `[DRY RUN] Will delete ${deploymentsToDelete.length} deployments (${skippedCount} skipped)`
      );
      deploymentsToDelete.forEach((deployment, index) => {
        logger.info(
          `[DRY RUN] ${index + 1}. ${deployment.id} (${deployment.environment || 'unknown'}) - ${deployment.created_on}`
        );
      });
      return { success: 0, failed: 0, skipped: skippedCount, dryRun: true };
    }

    if (deploymentsToDelete.length === 0) {
      logger.info('No deployments to delete after applying filters');
      return { success: 0, failed: 0, skipped: skippedCount };
    }

    logger.info(
      `Starting bulk delete of ${deploymentsToDelete.length} deployments for project ${projectName}...`
    );

    const progressLogger = new ProgressLogger(deploymentsToDelete.length, 'Bulk Delete');
    let successCount = 0;
    let failedCount = 0;

    // Process deployments with rate limiting
    for (const deployment of deploymentsToDelete) {
      try {
        await this.deleteDeployment(projectName, deployment.id, { force });
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
   * Delete entire Pages project
   * WARNING: This will permanently delete the project and all its deployments
   */
  async deleteProject(projectName, options = {}) {
    const { dryRun = false } = options;

    try {
      logger.info(`${dryRun ? '[DRY RUN] ' : ''}Deleting Pages project: ${projectName}`);

      if (dryRun) {
        logger.info(
          `[DRY RUN] Would permanently delete project "${projectName}" and all its deployments`
        );
        return { success: true, dryRun: true };
      }

      // First, try to get project info to verify it exists
      const _project = await this.getProject(projectName);
      logger.info(`Found project "${projectName}" - proceeding with deletion`);

      const response = await this.delete(
        `/accounts/${this.accountId}/pages/projects/${projectName}`
      );

      if (response.success) {
        logger.info(`✓ Pages project "${projectName}" successfully deleted`);
        return { success: true };
      } else {
        throw new Error(`Failed to delete project ${projectName}`);
      }
    } catch (error) {
      logger.error(`Failed to delete project ${projectName}:`, error.message);
      throw error;
    }
  }

  /**
   * Get deployment statistics for project
   */
  async getDeploymentStats(projectName, options = {}) {
    try {
      const deployments = await this.listAllDeployments(projectName, options);

      const stats = {
        total: deployments.length,
        byEnvironment: {},
        byStatus: {},
        byMonth: {},
        oldest: null,
        newest: null
      };

      deployments.forEach(deployment => {
        // Group by environment
        const env = deployment.environment || 'unknown';
        stats.byEnvironment[env] = (stats.byEnvironment[env] || 0) + 1;

        // Group by status
        const status = deployment.latest_stage?.status || 'unknown';
        stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

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
      logger.error(`Failed to get statistics for ${projectName}:`, error.message);
      throw error;
    }
  }
}

// Default export
export default PagesClient;
