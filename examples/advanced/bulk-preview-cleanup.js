#!/usr/bin/env node

/**
 * Advanced Bulk Preview Cleanup Example
 *
 * This example demonstrates advanced cleanup scenarios:
 * 1. Cross-project preview deployment cleanup
 * 2. Age-based filtering with customizable thresholds
 * 3. Smart batch processing with rate limiting
 * 4. Detailed progress reporting and statistics
 * 5. Resume capability for large operations
 */

import dotenv from 'dotenv';
import { ServiceManager } from '../../src/lib/service-manager.js';
import { logger } from '../../src/utils/logger.js';
import { promises as fs } from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

const {
  CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID,
  DEFAULT_DRY_RUN = 'true',
  CLEANUP_AGE_DAYS = '7',
  BATCH_SIZE = '10',
  RATE_LIMIT_DELAY = '1000'
} = process.env;

// Configuration
const CONFIG = {
  ageThresholdDays: parseInt(CLEANUP_AGE_DAYS),
  batchSize: parseInt(BATCH_SIZE),
  rateLimitDelay: parseInt(RATE_LIMIT_DELAY),
  dryRun: DEFAULT_DRY_RUN === 'true',
  progressFile: '.cleanup-progress.json'
};

async function loadProgress() {
  try {
    const progressData = await fs.readFile(CONFIG.progressFile, 'utf-8');
    return JSON.parse(progressData);
  } catch (error) {
    return {
      startTime: Date.now(),
      processedProjects: [],
      totalDeployments: 0,
      deletedDeployments: 0,
      failedDeletions: 0,
      skippedProjects: []
    };
  }
}

async function saveProgress(progress) {
  await fs.writeFile(CONFIG.progressFile, JSON.stringify(progress, null, 2));
}

async function cleanupProgress() {
  try {
    await fs.unlink(CONFIG.progressFile);
  } catch (error) {
    // File doesn't exist, ignore
  }
}

function calculateAge(dateString) {
  const deploymentDate = new Date(dateString);
  const now = new Date();
  return Math.floor((now - deploymentDate) / (1000 * 60 * 60 * 24));
}

function formatDuration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

async function bulkPreviewCleanup() {
  let progress = await loadProgress();

  try {
    console.log('🚀 Starting Advanced Bulk Preview Cleanup\n');
    console.log('📋 Configuration:');
    console.log(`   Age threshold: ${CONFIG.ageThresholdDays} days`);
    console.log(`   Batch size: ${CONFIG.batchSize}`);
    console.log(`   Rate limit delay: ${CONFIG.rateLimitDelay}ms`);
    console.log(`   Dry run: ${CONFIG.dryRun ? 'Yes' : 'No'}`);
    console.log();

    // Validate required environment variables
    if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
      throw new Error(
        'Missing required environment variables: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID'
      );
    }

    // Initialize service manager
    const serviceManager = new ServiceManager(CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID);

    // Validate connection
    console.log('🔍 Validating Cloudflare API connection...');
    const connectionStatus = await serviceManager.validateConnections();

    if (!connectionStatus.overall) {
      throw new Error(
        `Connection validation failed: Pages: ${connectionStatus.pages}, Workers: ${connectionStatus.workers}`
      );
    }

    console.log('✅ API connection validated successfully\n');

    // Get all Pages projects
    console.log('📋 Fetching all Pages projects...');
    const resources = await serviceManager.listAllResources();

    if (resources.pages.length === 0) {
      console.log('ℹ️  No Pages projects found in this account');
      await cleanupProgress();
      return;
    }

    console.log(`📊 Found ${resources.pages.length} Pages project(s)\n`);

    // Filter projects that haven't been processed yet
    const remainingProjects = resources.pages.filter(
      project => !progress.processedProjects.includes(project.name)
    );

    if (remainingProjects.length === 0 && progress.processedProjects.length > 0) {
      console.log('✅ All projects have been processed. Resuming from where we left off...\n');
    }

    console.log(`🔄 Processing ${remainingProjects.length} remaining project(s)...\n`);

    // Process each project
    for (const [index, project] of remainingProjects.entries()) {
      const projectNumber = resources.pages.length - remainingProjects.length + index + 1;
      console.log(`📦 [${projectNumber}/${resources.pages.length}] Processing: ${project.name}`);

      try {
        // Get all deployments for this project
        const deployments = await serviceManager.listDeployments('pages', project.name);

        if (deployments.length === 0) {
          console.log(`   ℹ️  No deployments found`);
          progress.processedProjects.push(project.name);
          await saveProgress(progress);
          continue;
        }

        console.log(`   📦 Found ${deployments.length} total deployment(s)`);

        // Filter preview deployments older than threshold
        const oldPreviewDeployments = deployments.filter(deployment => {
          const age = calculateAge(deployment.created_on);
          return deployment.environment === 'preview' && age > CONFIG.ageThresholdDays;
        });

        if (oldPreviewDeployments.length === 0) {
          console.log(`   ✨ No old preview deployments (>${CONFIG.ageThresholdDays} days) found`);
          progress.processedProjects.push(project.name);
          await saveProgress(progress);
          continue;
        }

        console.log(
          `   🧹 Found ${oldPreviewDeployments.length} old preview deployment(s) to clean up`
        );

        // Show age distribution
        const ageGroups = {
          '7-30 days': 0,
          '30-90 days': 0,
          '90+ days': 0
        };

        oldPreviewDeployments.forEach(deployment => {
          const age = calculateAge(deployment.created_on);
          if (age <= 30) ageGroups['7-30 days']++;
          else if (age <= 90) ageGroups['30-90 days']++;
          else ageGroups['90+ days']++;
        });

        console.log(`   📊 Age distribution:`);
        Object.entries(ageGroups).forEach(([range, count]) => {
          if (count > 0) {
            console.log(`      ${range}: ${count} deployment(s)`);
          }
        });

        // Process in batches with rate limiting
        const batches = [];
        for (let i = 0; i < oldPreviewDeployments.length; i += CONFIG.batchSize) {
          batches.push(oldPreviewDeployments.slice(i, i + CONFIG.batchSize));
        }

        console.log(
          `   ⚡ Processing ${batches.length} batch(es) of up to ${CONFIG.batchSize} deployments each`
        );

        let projectSuccess = 0;
        let projectFailed = 0;

        for (const [batchIndex, batch] of batches.entries()) {
          console.log(
            `   🔄 Batch ${batchIndex + 1}/${batches.length}: Processing ${batch.length} deployment(s)...`
          );

          try {
            const result = await serviceManager.bulkDeleteDeployments(
              'pages',
              project.name,
              batch,
              {
                dryRun: CONFIG.dryRun,
                skipProduction: true,
                batchSize: batch.length
              }
            );

            projectSuccess += result.success;
            projectFailed += result.failed;

            console.log(
              `      ✅ Batch completed: ${result.success} succeeded, ${result.failed} failed`
            );

            // Rate limiting between batches
            if (batchIndex < batches.length - 1 && CONFIG.rateLimitDelay > 0) {
              console.log(`      ⏱️  Rate limiting: waiting ${CONFIG.rateLimitDelay}ms...`);
              await new Promise(resolve => setTimeout(resolve, CONFIG.rateLimitDelay));
            }
          } catch (batchError) {
            console.error(`      ❌ Batch ${batchIndex + 1} failed:`, batchError.message);
            projectFailed += batch.length;
          }
        }

        // Update progress
        progress.totalDeployments += oldPreviewDeployments.length;
        progress.deletedDeployments += projectSuccess;
        progress.failedDeletions += projectFailed;
        progress.processedProjects.push(project.name);

        console.log(`   📊 Project summary: ${projectSuccess} succeeded, ${projectFailed} failed`);

        await saveProgress(progress);
      } catch (projectError) {
        console.error(`   ❌ Project processing failed:`, projectError.message);
        progress.skippedProjects.push({
          name: project.name,
          error: projectError.message,
          timestamp: new Date().toISOString()
        });
        await saveProgress(progress);
        continue;
      }

      console.log(); // Add spacing between projects
    }

    // Final summary
    const duration = Date.now() - progress.startTime;
    console.log('🎉 Bulk Preview Cleanup Completed!\n');
    console.log('📊 Final Statistics:');
    console.log(`   Total runtime: ${formatDuration(duration)}`);
    console.log(
      `   Projects processed: ${progress.processedProjects.length}/${resources.pages.length}`
    );
    console.log(`   Total deployments analyzed: ${progress.totalDeployments}`);
    console.log(
      `   Deployments ${CONFIG.dryRun ? 'identified for cleanup' : 'cleaned up'}: ${progress.deletedDeployments}`
    );
    console.log(`   Failed operations: ${progress.failedDeletions}`);
    console.log(`   Skipped projects: ${progress.skippedProjects.length}`);

    if (progress.skippedProjects.length > 0) {
      console.log('\n⚠️  Skipped projects:');
      progress.skippedProjects.forEach((skipped, index) => {
        console.log(`   ${index + 1}. ${skipped.name}: ${skipped.error}`);
      });
    }

    if (CONFIG.dryRun) {
      console.log(
        '\n💡 Tip: Set DEFAULT_DRY_RUN=false in your .env file to perform actual cleanup'
      );
    }

    // Clean up progress file on successful completion
    await cleanupProgress();
  } catch (error) {
    console.error('❌ Bulk cleanup failed:', error.message);
    logger.error('Bulk preview cleanup failed', {
      error: error.message,
      stack: error.stack,
      progress
    });

    console.log(
      '\n💾 Progress has been saved. You can resume the operation by running the script again.'
    );
    process.exit(1);
  }
}

// Handle process interruption to save progress
process.on('SIGINT', async () => {
  console.log('\n⏸️  Operation interrupted. Saving progress...');
  process.exit(0);
});

// Execute the cleanup if this script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  bulkPreviewCleanup().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

export { bulkPreviewCleanup };
