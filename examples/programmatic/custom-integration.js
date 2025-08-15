/**
 * Custom Integration Example - Using as a Library
 * 
 * This example demonstrates how to integrate the Cloudflare Bulk Delete tool
 * into your own Node.js applications, CI/CD pipelines, or automation scripts.
 * 
 * Features demonstrated:
 * 1. Library integration patterns
 * 2. Custom event handling and hooks
 * 3. Progress monitoring and callbacks
 * 4. Error handling and recovery
 * 5. Integration with external systems
 * 6. Custom filtering and selection logic
 */

import { ServiceManager } from '../../src/lib/service-manager.js';
import { logger } from '../../src/utils/logger.js';

/**
 * CloudflareCleanupIntegration - A wrapper class for easy integration
 */
export class CloudflareCleanupIntegration {
  constructor(apiToken, accountId, options = {}) {
    this.serviceManager = new ServiceManager(apiToken, accountId);
    this.options = {
      enableHooks: true,
      enableProgressCallbacks: true,
      enableMetrics: true,
      ...options
    };
    
    this.hooks = new Map();
    this.metrics = {
      startTime: null,
      endTime: null,
      totalProcessed: 0,
      totalCleaned: 0,
      totalFailed: 0,
      errors: []
    };
  }

  /**
   * Register a hook for custom logic at different stages
   */
  on(event, callback) {
    if (!this.options.enableHooks) return this;
    
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    this.hooks.get(event).push(callback);
    return this;
  }

  /**
   * Execute hooks for a given event
   */
  async executeHooks(event, data = {}) {
    if (!this.options.enableHooks || !this.hooks.has(event)) {
      return data;
    }

    let result = data;
    for (const callback of this.hooks.get(event)) {
      try {
        const hookResult = await callback(result);
        if (hookResult !== undefined) {
          result = hookResult;
        }
      } catch (error) {
        logger.warn(`Hook execution failed for event: ${event}`, { error: error.message });
      }
    }
    return result;
  }

  /**
   * Custom deployment filter with business logic
   */
  async customDeploymentFilter(deployments, options = {}) {
    const {
      maxAge = 30,
      environment = 'preview',
      keepLatest = 5,
      branchPatterns = [],
      excludePatterns = [],
      customLogic = null
    } = options;

    let filtered = deployments.filter(deployment => {
      // Environment filter
      if (environment && deployment.environment !== environment) {
        return false;
      }

      // Age filter
      const age = Math.floor((Date.now() - new Date(deployment.created_on)) / (1000 * 60 * 60 * 24));
      if (age < maxAge) {
        return false;
      }

      // Branch pattern filter
      if (branchPatterns.length > 0) {
        const matches = branchPatterns.some(pattern => {
          if (typeof pattern === 'string') {
            return deployment.source?.branch?.includes(pattern);
          }
          return pattern.test(deployment.source?.branch || '');
        });
        if (!matches) return false;
      }

      // Exclude patterns
      if (excludePatterns.length > 0) {
        const excluded = excludePatterns.some(pattern => {
          if (typeof pattern === 'string') {
            return deployment.source?.branch?.includes(pattern) || 
                   deployment.id.includes(pattern);
          }
          return pattern.test(deployment.source?.branch || '') ||
                 pattern.test(deployment.id);
        });
        if (excluded) return false;
      }

      return true;
    });

    // Apply custom logic if provided
    if (customLogic && typeof customLogic === 'function') {
      filtered = await customLogic(filtered, deployments);
    }

    // Sort by creation date and apply keepLatest
    if (keepLatest > 0) {
      filtered.sort((a, b) => new Date(b.created_on) - new Date(a.created_on));
      if (filtered.length > keepLatest) {
        // Keep the latest ones, return the rest for deletion
        filtered = filtered.slice(keepLatest);
      } else {
        filtered = [];
      }
    }

    return await this.executeHooks('deployments-filtered', {
      original: deployments,
      filtered,
      options
    });
  }

  /**
   * Advanced cleanup with custom business logic
   */
  async cleanupWithCustomLogic(options = {}) {
    this.metrics.startTime = Date.now();

    try {
      // Pre-cleanup hook
      await this.executeHooks('before-cleanup', { options });

      // Validate connections
      const connectionStatus = await this.serviceManager.validateConnections();
      if (!connectionStatus.overall) {
        throw new Error('Connection validation failed');
      }

      // Get all resources
      const resources = await this.serviceManager.listAllResources();

      // Pre-process hook
      const processedResources = await this.executeHooks('resources-loaded', {
        resources,
        options
      });

      const results = {
        pages: [],
        workers: [],
        summary: {
          totalProjects: 0,
          totalCleaned: 0,
          totalFailed: 0,
          duration: 0
        }
      };

      // Process Pages projects
      if (options.includePages !== false && processedResources.resources.pages.length > 0) {
        for (const project of processedResources.resources.pages) {
          try {
            // Project-level hook
            const projectData = await this.executeHooks('before-project', {
              project,
              type: 'pages'
            });

            const deployments = await this.serviceManager.listDeployments('pages', project.name);
            
            // Custom filtering
            const filteredResult = await this.customDeploymentFilter(
              deployments,
              options.pagesFilter || {}
            );

            if (filteredResult.filtered.length === 0) {
              continue;
            }

            // Pre-deletion hook
            await this.executeHooks('before-deletion', {
              project: project.name,
              type: 'pages',
              deployments: filteredResult.filtered
            });

            // Perform deletion
            const result = await this.serviceManager.bulkDeleteDeployments(
              'pages',
              project.name,
              filteredResult.filtered,
              {
                dryRun: options.dryRun || false,
                batchSize: options.batchSize || 10,
                ...options.deletionOptions
              }
            );

            // Post-deletion hook
            await this.executeHooks('after-deletion', {
              project: project.name,
              type: 'pages',
              result
            });

            results.pages.push({
              project: project.name,
              totalDeployments: deployments.length,
              targetedForDeletion: filteredResult.filtered.length,
              cleaned: result.success,
              failed: result.failed
            });

            this.metrics.totalProcessed += deployments.length;
            this.metrics.totalCleaned += result.success;
            this.metrics.totalFailed += result.failed;

            // Progress callback
            if (this.options.enableProgressCallbacks && options.onProgress) {
              await options.onProgress({
                type: 'pages',
                project: project.name,
                progress: results.pages.length / processedResources.resources.pages.length,
                result
              });
            }

          } catch (error) {
            this.metrics.errors.push({
              type: 'pages',
              project: project.name,
              error: error.message,
              timestamp: new Date().toISOString()
            });

            // Error hook
            await this.executeHooks('error', {
              type: 'pages',
              project: project.name,
              error
            });

            logger.error(`Pages project cleanup failed: ${project.name}`, { error: error.message });
          }
        }
      }

      // Process Workers (simplified example)
      if (options.includeWorkers !== false && processedResources.resources.workers.length > 0) {
        try {
          // Custom Workers filtering logic
          const workersToDelete = processedResources.resources.workers.filter(worker => {
            const age = Math.floor((Date.now() - new Date(worker.created_on)) / (1000 * 60 * 60 * 24));
            
            // Default: delete test workers older than 7 days
            const isTestWorker = ['test-', 'demo-', 'temp-'].some(prefix => 
              worker.id.toLowerCase().startsWith(prefix)
            );
            
            return isTestWorker && age > (options.workersMaxAge || 7);
          });

          if (workersToDelete.length > 0) {
            const result = await this.serviceManager.bulkDeleteWorkers(
              workersToDelete.map(w => w.id),
              {
                dryRun: options.dryRun || false,
                batchSize: options.workersBatchSize || 5
              }
            );

            results.workers = {
              totalScripts: processedResources.resources.workers.length,
              targetedForDeletion: workersToDelete.length,
              cleaned: result.success,
              failed: result.failed
            };

            this.metrics.totalCleaned += result.success;
            this.metrics.totalFailed += result.failed;
          }

        } catch (error) {
          this.metrics.errors.push({
            type: 'workers',
            error: error.message,
            timestamp: new Date().toISOString()
          });

          await this.executeHooks('error', {
            type: 'workers',
            error
          });

          logger.error('Workers cleanup failed', { error: error.message });
        }
      }

      // Calculate final metrics
      this.metrics.endTime = Date.now();
      results.summary = {
        totalProjects: results.pages.length,
        totalCleaned: this.metrics.totalCleaned,
        totalFailed: this.metrics.totalFailed,
        duration: this.metrics.endTime - this.metrics.startTime
      };

      // Post-cleanup hook
      const finalResults = await this.executeHooks('after-cleanup', {
        results,
        metrics: this.metrics
      });

      return finalResults.results || results;

    } catch (error) {
      this.metrics.errors.push({
        type: 'general',
        error: error.message,
        timestamp: new Date().toISOString()
      });

      await this.executeHooks('error', {
        type: 'general',
        error
      });

      throw error;
    }
  }

  /**
   * Get cleanup metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      duration: this.metrics.endTime ? 
        (this.metrics.endTime - this.metrics.startTime) : 
        (Date.now() - this.metrics.startTime)
    };
  }
}

/**
 * Example usage scenarios
 */

// Example 1: Basic integration
export async function basicIntegrationExample() {
  const cleanup = new CloudflareCleanupIntegration(
    process.env.CLOUDFLARE_API_TOKEN,
    process.env.CLOUDFLARE_ACCOUNT_ID
  );

  try {
    const results = await cleanup.cleanupWithCustomLogic({
      dryRun: true,
      includePages: true,
      includeWorkers: false,
      pagesFilter: {
        maxAge: 14,
        environment: 'preview',
        keepLatest: 3
      }
    });

    console.log('Cleanup Results:', JSON.stringify(results, null, 2));
    console.log('Metrics:', cleanup.getMetrics());

    return results;
  } catch (error) {
    console.error('Cleanup failed:', error.message);
    throw error;
  }
}

// Example 2: Advanced integration with hooks and monitoring
export async function advancedIntegrationExample() {
  const cleanup = new CloudflareCleanupIntegration(
    process.env.CLOUDFLARE_API_TOKEN,
    process.env.CLOUDFLARE_ACCOUNT_ID,
    {
      enableHooks: true,
      enableProgressCallbacks: true
    }
  );

  // Add custom hooks
  cleanup
    .on('before-cleanup', async (data) => {
      console.log('🚀 Starting cleanup operation...');
      // Send notification to Slack/Teams/etc.
      return data;
    })
    .on('resources-loaded', async (data) => {
      console.log(`📊 Found ${data.resources.pages.length} Pages projects, ${data.resources.workers.length} Workers scripts`);
      return data;
    })
    .on('before-project', async (data) => {
      console.log(`🔄 Processing project: ${data.project.name}`);
      return data;
    })
    .on('after-deletion', async (data) => {
      console.log(`✅ ${data.project}: ${data.result.success} cleaned, ${data.result.failed} failed`);
      
      // Custom logging to external system
      await logToExternalSystem({
        project: data.project,
        type: data.type,
        cleaned: data.result.success,
        failed: data.result.failed,
        timestamp: new Date().toISOString()
      });
      
      return data;
    })
    .on('error', async (data) => {
      console.error(`❌ Error in ${data.type}: ${data.error.message}`);
      
      // Send alert
      await sendAlert({
        type: 'cleanup_error',
        details: data,
        timestamp: new Date().toISOString()
      });
      
      return data;
    })
    .on('after-cleanup', async (data) => {
      console.log('🎉 Cleanup completed!');
      console.log('📊 Final metrics:', data.metrics);
      
      // Generate report
      await generateCleanupReport(data.results, data.metrics);
      
      return data;
    });

  try {
    const results = await cleanup.cleanupWithCustomLogic({
      dryRun: false,
      pagesFilter: {
        maxAge: 30,
        environment: 'preview',
        keepLatest: 5,
        branchPatterns: ['feature/', 'fix/'],
        excludePatterns: ['hotfix/', 'release/']
      },
      onProgress: async (progress) => {
        console.log(`📈 Progress: ${Math.round(progress.progress * 100)}% - ${progress.project}`);
        
        // Update progress in external system
        await updateProgressTracker(progress);
      }
    });

    return results;
  } catch (error) {
    console.error('Advanced cleanup failed:', error.message);
    throw error;
  }
}

// Example 3: CI/CD Pipeline Integration
export async function cicdPipelineExample() {
  const cleanup = new CloudflareCleanupIntegration(
    process.env.CLOUDFLARE_API_TOKEN,
    process.env.CLOUDFLARE_ACCOUNT_ID
  );

  // CI/CD specific configuration
  const pipelineConfig = {
    dryRun: process.env.CI_CLEANUP_DRY_RUN === 'true',
    pagesFilter: {
      maxAge: parseInt(process.env.CI_CLEANUP_MAX_AGE || '7'),
      environment: 'preview',
      keepLatest: parseInt(process.env.CI_CLEANUP_KEEP_LATEST || '3'),
      branchPatterns: [
        new RegExp(`^${process.env.CI_DEFAULT_BRANCH || 'main'}$`),
        /^feature\//,
        /^bugfix\//
      ],
      excludePatterns: [
        /^release\//,
        /^hotfix\//,
        new RegExp(`^${process.env.CI_PRODUCTION_BRANCH || 'production'}$`)
      ],
      customLogic: async (filtered, original) => {
        // Keep deployments from the last 3 successful builds
        const recentSuccessful = original
          .filter(d => d.latest_stage?.status === 'success')
          .sort((a, b) => new Date(b.created_on) - new Date(a.created_on))
          .slice(0, 3);
        
        return filtered.filter(d => !recentSuccessful.includes(d));
      }
    }
  };

  try {
    console.log('🔧 Running CI/CD cleanup pipeline...');
    const results = await cleanup.cleanupWithCustomLogic(pipelineConfig);
    
    // Set CI output variables
    if (process.env.GITHUB_OUTPUT) {
      const fs = await import('fs').then(m => m.promises);
      await fs.appendFile(process.env.GITHUB_OUTPUT, 
        `cleanup-pages=${results.pages.length}\n` +
        `cleanup-cleaned=${results.summary.totalCleaned}\n` +
        `cleanup-failed=${results.summary.totalFailed}\n`
      );
    }

    return results;
  } catch (error) {
    console.error('CI/CD cleanup failed:', error.message);
    process.exit(1);
  }
}

// Utility functions for integration examples
async function logToExternalSystem(data) {
  // Example: Log to external monitoring system
  console.log('📝 Logging to external system:', data);
}

async function sendAlert(alert) {
  // Example: Send alert via webhook/email/Slack
  console.log('🚨 Sending alert:', alert);
}

async function generateCleanupReport(results, metrics) {
  // Example: Generate and save cleanup report
  console.log('📄 Generating cleanup report...');
}

async function updateProgressTracker(progress) {
  // Example: Update progress in external tracking system
  console.log('📊 Updating progress tracker:', progress);
}

// Export for use in other modules
export default CloudflareCleanupIntegration;