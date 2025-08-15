import { PagesClient } from './pages-client.js';
import { WorkersClient } from './workers-client.js';
import { logger } from '../utils/logger.js';
import { config, validateConfig } from '../config/config.js';

/**
 * Service Manager for managing bulk delete operations
 * on Cloudflare Pages and Workers in a unified way
 */
export class ServiceManager {
  constructor(apiToken = config.cloudflare.apiToken, accountId = config.cloudflare.accountId) {
    // Validate configuration
    validateConfig();

    this.pagesClient = new PagesClient(apiToken, accountId);
    this.workersClient = new WorkersClient(apiToken, accountId);
    this.apiToken = apiToken;
    this.accountId = accountId;
  }

  /**
   * Validate API connection for both services
   */
  async validateConnections() {
    logger.info('Validating Cloudflare API connections...');

    try {
      const [pagesValidation, workersValidation] = await Promise.all([
        this.pagesClient.validateConnection(),
        this.workersClient.validateConnection()
      ]);

      const result = {
        pages: pagesValidation,
        workers: workersValidation,
        overall: pagesValidation.valid && workersValidation.valid
      };

      if (result.overall) {
        logger.info('All API connections successfully validated');
      } else {
        logger.error('Some API connections failed validation');
      }

      return result;
    } catch (error) {
      logger.error('Error during connection validation:', error.message);
      throw error;
    }
  }

  /**
   * List all resources (Pages projects and Workers scripts)
   */
  async listAllResources() {
    logger.info('Fetching list of all resources...');

    try {
      const [pagesProjects, workersScripts] = await Promise.all([
        this.pagesClient.listProjects().catch(error => {
          logger.warn('Failed to fetch Pages projects:', error.message);
          return [];
        }),
        this.workersClient.listScripts().catch(error => {
          logger.warn('Failed to fetch Workers scripts:', error.message);
          return [];
        })
      ]);

      const resources = {
        pages: pagesProjects.map(project => ({
          type: 'pages',
          name: project.name,
          id: project.id,
          created_on: project.created_on,
          subdomain: project.subdomain,
          domains: project.domains || []
        })),
        workers: workersScripts.map(script => ({
          type: 'workers',
          name: script.id,
          id: script.id,
          created_on: script.created_on,
          modified_on: script.modified_on
        }))
      };

      logger.info(
        `Found ${resources.pages.length} Pages projects and ${resources.workers.length} Workers scripts`
      );
      return resources;
    } catch (error) {
      logger.error('Failed to fetch resources list:', error.message);
      throw error;
    }
  }

  /**
   * List deployments for specific resource
   */
  async listDeployments(resourceType, resourceName, options = {}) {
    logger.info(`Fetching deployments for ${resourceType} "${resourceName}"...`);

    try {
      let deployments = [];
      let totalCount = null;

      if (resourceType === 'pages') {
        // Get deployments and also fetch the API response to get total count
        deployments = await this.pagesClient.listAllDeployments(resourceName, options);

        // Make a separate API call to get the result_info with total_count
        try {
          const response = await this.pagesClient.get(
            `/accounts/${this.pagesClient.accountId}/pages/projects/${resourceName}/deployments`
          );
          if (response.success && response.result_info && response.result_info.total_count) {
            totalCount = response.result_info.total_count;
          }
        } catch (error) {
          logger.debug('Could not fetch total count info:', error.message);
        }
      } else if (resourceType === 'workers') {
        deployments = await this.workersClient.listAllDeployments(resourceName, options);
      } else {
        throw new Error(`Unsupported resource type: ${resourceType}`);
      }

      // Add resource info and total count to each deployment
      const enrichedDeployments = deployments.map(deployment => ({
        ...deployment,
        resourceType,
        resourceName,
        ...(totalCount && { totalCount })
      }));

      return enrichedDeployments;
    } catch (error) {
      logger.error(
        `Failed to fetch deployments for ${resourceType} "${resourceName}":`,
        error.message
      );
      throw error;
    }
  }

  /**
   * Bulk delete deployments for specific resource
   */
  async bulkDeleteDeployments(resourceType, resourceName, deployments, options = {}) {
    logger.info(`Starting bulk delete for ${resourceType} "${resourceName}"...`);

    try {
      let result;

      if (resourceType === 'pages') {
        result = await this.pagesClient.bulkDeleteDeployments(resourceName, deployments, options);
      } else if (resourceType === 'workers') {
        result = await this.workersClient.bulkDeleteDeployments(resourceName, deployments, options);
      } else {
        throw new Error(`Unsupported resource type: ${resourceType}`);
      }

      // Add resource info to result
      result.resourceType = resourceType;
      result.resourceName = resourceName;

      return result;
    } catch (error) {
      logger.error(`Failed bulk delete for ${resourceType} "${resourceName}":`, error.message);
      throw error;
    }
  }

  /**
   * Delete entire project/script
   * WARNING: This will permanently delete the resource and all its deployments
   */
  async deleteResource(resourceType, resourceName, options = {}) {
    logger.info(
      `${options.dryRun ? '[DRY RUN] ' : ''}Deleting ${resourceType} "${resourceName}"...`
    );

    try {
      let result;

      if (resourceType === 'pages') {
        result = await this.pagesClient.deleteProject(resourceName, options);
      } else if (resourceType === 'workers') {
        result = await this.workersClient.deleteScript(resourceName, options);
      } else {
        throw new Error(`Unsupported resource type: ${resourceType}`);
      }

      // Add resource info to result
      result.resourceType = resourceType;
      result.resourceName = resourceName;

      return result;
    } catch (error) {
      logger.error(`Failed to delete ${resourceType} "${resourceName}":`, error.message);
      throw error;
    }
  }

  /**
   * Bulk delete deployments for multiple resources
   */
  async bulkDeleteMultipleResources(resources, options = {}) {
    const { dryRun = false, skipProduction = true, skipLatest = true } = options;

    if (!Array.isArray(resources) || resources.length === 0) {
      throw new Error('No resources selected for bulk delete');
    }

    logger.info(`Starting bulk delete for ${resources.length} resources...`);

    const results = [];
    let totalDeleted = 0;
    let totalErrors = 0;

    for (const resource of resources) {
      const { type, name, deploymentOptions = {} } = resource;

      try {
        // Get deployments for this resource
        const deployments = await this.listDeployments(type, name, deploymentOptions);

        if (deployments.length === 0) {
          logger.info(`No deployments for ${type} "${name}"`);
          results.push({
            resourceType: type,
            resourceName: name,
            success: 0,
            failed: 0,
            skipped: 0,
            total: 0,
            message: 'No deployments found'
          });
          continue;
        }

        // Perform bulk delete
        const deleteOptions = {
          dryRun,
          skipProduction: type === 'pages' ? skipProduction : false,
          skipLatest: type === 'workers' ? skipLatest : false
        };

        const result = await this.bulkDeleteDeployments(type, name, deployments, deleteOptions);
        results.push(result);

        totalDeleted += result.success;
        totalErrors += result.failed;
      } catch (error) {
        logger.error(`Error processing ${type} "${name}":`, error.message);
        results.push({
          resourceType: type,
          resourceName: name,
          success: 0,
          failed: 1,
          skipped: 0,
          total: 0,
          error: error.message
        });
        totalErrors++;
      }
    }

    const summary = {
      totalResources: resources.length,
      totalDeleted,
      totalErrors,
      results,
      dryRun
    };

    logger.info(
      `Bulk delete completed: ${totalDeleted} deployments deleted, ${totalErrors} errors`
    );
    return summary;
  }

  /**
   * Get comprehensive statistics for all resources
   */
  async getComprehensiveStats(options = {}) {
    logger.info('Fetching comprehensive statistics...');

    try {
      const resources = await this.listAllResources();
      const stats = {
        pages: {
          totalProjects: resources.pages.length,
          projects: {}
        },
        workers: {
          totalScripts: resources.workers.length,
          scripts: {}
        },
        summary: {
          totalResources: resources.pages.length + resources.workers.length,
          totalDeployments: 0,
          oldestDeployment: null,
          newestDeployment: null
        }
      };

      // Get stats for each Pages project
      for (const project of resources.pages) {
        try {
          const projectStats = await this.pagesClient.getDeploymentStats(project.name, options);
          stats.pages.projects[project.name] = projectStats;
          stats.summary.totalDeployments += projectStats.total;

          // Update summary dates
          if (projectStats.oldest) {
            if (
              !stats.summary.oldestDeployment ||
              projectStats.oldest < stats.summary.oldestDeployment
            ) {
              stats.summary.oldestDeployment = projectStats.oldest;
            }
          }
          if (projectStats.newest) {
            if (
              !stats.summary.newestDeployment ||
              projectStats.newest > stats.summary.newestDeployment
            ) {
              stats.summary.newestDeployment = projectStats.newest;
            }
          }
        } catch (error) {
          logger.warn(`Failed to get stats for Pages project ${project.name}:`, error.message);
          stats.pages.projects[project.name] = { error: error.message };
        }
      }

      // Get stats for each Workers script
      for (const script of resources.workers) {
        try {
          const scriptStats = await this.workersClient.getDeploymentStats(script.name, options);
          stats.workers.scripts[script.name] = scriptStats;
          stats.summary.totalDeployments += scriptStats.total;

          // Update summary dates
          if (scriptStats.oldest) {
            if (
              !stats.summary.oldestDeployment ||
              scriptStats.oldest < stats.summary.oldestDeployment
            ) {
              stats.summary.oldestDeployment = scriptStats.oldest;
            }
          }
          if (scriptStats.newest) {
            if (
              !stats.summary.newestDeployment ||
              scriptStats.newest > stats.summary.newestDeployment
            ) {
              stats.summary.newestDeployment = scriptStats.newest;
            }
          }
        } catch (error) {
          logger.warn(`Failed to get stats for Workers script ${script.name}:`, error.message);
          stats.workers.scripts[script.name] = { error: error.message };
        }
      }

      return stats;
    } catch (error) {
      logger.error('Failed to fetch comprehensive statistics:', error.message);
      throw error;
    }
  }
}

// Default export
export default ServiceManager;
