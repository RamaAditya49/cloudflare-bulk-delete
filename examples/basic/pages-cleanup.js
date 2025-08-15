#!/usr/bin/env node

/**
 * Basic Pages Deployment Cleanup Example
 *
 * This example demonstrates how to:
 * 1. Connect to Cloudflare API
 * 2. List Pages projects and deployments
 * 3. Clean up old preview deployments
 * 4. Maintain production safety
 */

import dotenv from 'dotenv';
import { ServiceManager } from '../../src/lib/service-manager.js';
import { logger } from '../../src/utils/logger.js';

// Load environment variables
dotenv.config();

const { CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, DEFAULT_DRY_RUN = 'true' } = process.env;

async function basicPagesCleanup() {
  try {
    console.log('🚀 Starting Basic Pages Cleanup Example\n');

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

    // List all Pages projects
    console.log('📋 Fetching Pages projects...');
    const resources = await serviceManager.listAllResources();

    if (resources.pages.length === 0) {
      console.log('ℹ️  No Pages projects found in this account');
      return;
    }

    console.log(`📊 Found ${resources.pages.length} Pages project(s):`);
    resources.pages.forEach((project, index) => {
      console.log(`  ${index + 1}. ${project.name} (${project.id})`);
    });
    console.log();

    // Process each Pages project
    for (const project of resources.pages) {
      console.log(`🔄 Processing project: ${project.name}`);

      try {
        // Get all deployments for this project
        const deployments = await serviceManager.listDeployments('pages', project.name);

        if (deployments.length === 0) {
          console.log(`   ℹ️  No deployments found for ${project.name}`);
          continue;
        }

        console.log(`   📦 Found ${deployments.length} deployment(s)`);

        // Filter to get only preview deployments older than 7 days
        const now = new Date();
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const oldPreviewDeployments = deployments.filter(deployment => {
          const deploymentDate = new Date(deployment.created_on);
          return deployment.environment === 'preview' && deploymentDate < sevenDaysAgo;
        });

        if (oldPreviewDeployments.length === 0) {
          console.log(`   ✨ No old preview deployments to clean up for ${project.name}`);
          continue;
        }

        console.log(
          `   🧹 Found ${oldPreviewDeployments.length} old preview deployment(s) to clean up`
        );

        // Show what will be deleted
        oldPreviewDeployments.forEach((deployment, index) => {
          const age = Math.floor((now - new Date(deployment.created_on)) / (1000 * 60 * 60 * 24));
          console.log(`     ${index + 1}. ${deployment.id} (${age} days old) - ${deployment.url}`);
        });

        // Perform cleanup with safety options
        const dryRun = DEFAULT_DRY_RUN === 'true';
        console.log(`   ${dryRun ? '🔍 [DRY RUN]' : '🗑️  [ACTUAL]'} Cleaning up deployments...`);

        const result = await serviceManager.bulkDeleteDeployments(
          'pages',
          project.name,
          oldPreviewDeployments,
          {
            dryRun,
            skipProduction: true,
            keepLatest: 1,
            batchSize: 5
          }
        );

        console.log(
          `   ✅ Cleanup completed: ${result.success} succeeded, ${result.failed} failed`
        );

        if (result.failed > 0) {
          console.log(`   ⚠️  Some deletions failed. Check logs for details.`);
        }
      } catch (projectError) {
        console.error(`   ❌ Error processing ${project.name}:`, projectError.message);
        continue;
      }

      console.log(); // Add spacing between projects
    }

    console.log('🎉 Basic Pages cleanup completed successfully!');

    if (DEFAULT_DRY_RUN === 'true') {
      console.log(
        '\n💡 Tip: Set DEFAULT_DRY_RUN=false in your .env file to perform actual cleanup'
      );
    }
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    logger.error('Basic Pages cleanup failed', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Execute the cleanup if this script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  basicPagesCleanup().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

export { basicPagesCleanup };
