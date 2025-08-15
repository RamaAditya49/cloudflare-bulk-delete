import { ServiceManager } from './lib/service-manager.js';
import { logger } from './utils/logger.js';
import { config, validateConfig } from './config/config.js';

/**
 * Main entry point for programmatic usage
 */
export class CloudflareBulkDelete {
  constructor(apiToken = config.cloudflare.apiToken, accountId = config.cloudflare.accountId) {
    try {
      validateConfig();
      this.serviceManager = new ServiceManager(apiToken, accountId);
    } catch (error) {
      logger.error('Failed to initialize CloudflareBulkDelete:', error.message);
      throw error;
    }
  }

  /**
   * Validate API connections
   */
  async validateConnections() {
    return await this.serviceManager.validateConnections();
  }

  /**
   * List all resources (Pages and Workers)
   */
  async listAllResources() {
    return await this.serviceManager.listAllResources();
  }

  /**
   * List deployments for specific resource
   */
  async listDeployments(resourceType, resourceName, options = {}) {
    return await this.serviceManager.listDeployments(resourceType, resourceName, options);
  }

  /**
   * Bulk delete deployments for specific resource
   */
  async bulkDeleteDeployments(resourceType, resourceName, deployments, options = {}) {
    return await this.serviceManager.bulkDeleteDeployments(
      resourceType,
      resourceName,
      deployments,
      options
    );
  }

  /**
   * Delete entire resource (Pages project or Workers script)
   */
  async deleteResource(resourceType, resourceName, options = {}) {
    return await this.serviceManager.deleteResource(resourceType, resourceName, options);
  }

  /**
   * Bulk delete deployments for multiple resources
   */
  async bulkDeleteMultipleResources(resources, options = {}) {
    return await this.serviceManager.bulkDeleteMultipleResources(resources, options);
  }

  /**
   * Get comprehensive statistics
   */
  async getComprehensiveStats(options = {}) {
    return await this.serviceManager.getComprehensiveStats(options);
  }

  /**
   * Helper method for bulk delete all old deployments
   */
  async cleanupOldDeployments(options = {}) {
    const {
      maxAge = 30, // days
      dryRun = false,
      skipProduction = true,
      skipLatest = true
    } = options;

    logger.info(`Starting cleanup of deployments older than ${maxAge} days...`);

    try {
      // Get all resources
      const resources = await this.listAllResources();

      const resourcesToClean = [];

      // Add Pages projects
      for (const project of resources.pages) {
        resourcesToClean.push({
          type: 'pages',
          name: project.name,
          deploymentOptions: { maxAge }
        });
      }

      // Add Workers scripts
      for (const script of resources.workers) {
        resourcesToClean.push({
          type: 'workers',
          name: script.name,
          deploymentOptions: { maxAge }
        });
      }

      if (resourcesToClean.length === 0) {
        logger.info('No resources found to cleanup');
        return { success: true, message: 'No resources found' };
      }

      // Perform bulk cleanup
      const result = await this.bulkDeleteMultipleResources(resourcesToClean, {
        dryRun,
        skipProduction,
        skipLatest
      });

      logger.info(
        `Cleanup completed: ${result.totalDeleted} deployments deleted from ${result.totalResources} resources`
      );

      return result;
    } catch (error) {
      logger.error('Failed to cleanup deployments:', error.message);
      throw error;
    }
  }

  /**
   * Helper method for cleanup based on number of deployments to keep
   */
  async cleanupByCount(options = {}) {
    const {
      keepCount = 5, // Number of latest deployments to keep
      dryRun = false,
      skipProduction = true
    } = options;

    logger.info(`Starting cleanup, keeping ${keepCount} latest deployments per resource...`);

    try {
      const resources = await this.listAllResources();
      const results = [];

      // Process each resource
      for (const project of resources.pages) {
        try {
          const allDeployments = await this.listDeployments('pages', project.name);

          if (allDeployments.length <= keepCount) {
            logger.info(
              `Pages project ${project.name}: ${allDeployments.length} deployments, no cleanup needed`
            );
            continue;
          }

          // Sort by creation date (newest first) and keep only the latest ones
          const sortedDeployments = [...allDeployments].sort(
            (a, b) => new Date(b.created_on) - new Date(a.created_on)
          );

          const deploymentsToDelete = sortedDeployments.slice(keepCount);

          if (deploymentsToDelete.length > 0) {
            const result = await this.bulkDeleteDeployments(
              'pages',
              project.name,
              deploymentsToDelete,
              {
                dryRun,
                skipProduction
              }
            );

            results.push({
              resource: `pages/${project.name}`,
              ...result
            });
          }
        } catch (error) {
          logger.error(`Error processing Pages project ${project.name}:`, error.message);
          results.push({
            resource: `pages/${project.name}`,
            error: error.message
          });
        }
      }

      // Process Workers scripts
      for (const script of resources.workers) {
        try {
          const allDeployments = await this.listDeployments('workers', script.name);

          if (allDeployments.length <= keepCount) {
            logger.info(
              `Workers script ${script.name}: ${allDeployments.length} deployments, no cleanup needed`
            );
            continue;
          }

          const sortedDeployments = [...allDeployments].sort(
            (a, b) => new Date(b.created_on) - new Date(a.created_on)
          );

          const deploymentsToDelete = sortedDeployments.slice(keepCount);

          if (deploymentsToDelete.length > 0) {
            const result = await this.bulkDeleteDeployments(
              'workers',
              script.name,
              deploymentsToDelete,
              {
                dryRun,
                skipLatest: true // Always skip latest for Workers
              }
            );

            results.push({
              resource: `workers/${script.name}`,
              ...result
            });
          }
        } catch (error) {
          logger.error(`Error processing Workers script ${script.name}:`, error.message);
          results.push({
            resource: `workers/${script.name}`,
            error: error.message
          });
        }
      }

      const summary = {
        totalResources: resources.pages.length + resources.workers.length,
        processedResources: results.length,
        totalDeleted: results.reduce((sum, r) => sum + (r.success || 0), 0),
        totalErrors: results.filter(r => r.error).length,
        results,
        dryRun
      };

      logger.info(
        `Cleanup by count completed: ${summary.totalDeleted} deployments deleted from ${summary.processedResources} resources`
      );

      return summary;
    } catch (error) {
      logger.error('Failed to cleanup by count:', error.message);
      throw error;
    }
  }
}

// Export all components for flexibility
export { ServiceManager } from './lib/service-manager.js';
export { PagesClient } from './lib/pages-client.js';
export { WorkersClient } from './lib/workers-client.js';
export { CloudflareClient } from './lib/cloudflare-client.js';
export { logger, ProgressLogger } from './utils/logger.js';
export { config, validateConfig } from './config/config.js';

// Default export
export default CloudflareBulkDelete;
