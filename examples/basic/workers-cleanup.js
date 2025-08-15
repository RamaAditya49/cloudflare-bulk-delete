#!/usr/bin/env node

/**
 * Basic Workers Script Cleanup Example
 * 
 * This example demonstrates how to:
 * 1. Connect to Cloudflare API
 * 2. List Workers scripts and their details
 * 3. Clean up unused or old Workers scripts
 * 4. Maintain safety with dry-run mode
 */

import dotenv from 'dotenv';
import { ServiceManager } from '../../src/lib/service-manager.js';
import { logger } from '../../src/utils/logger.js';

// Load environment variables
dotenv.config();

const { 
  CLOUDFLARE_API_TOKEN, 
  CLOUDFLARE_ACCOUNT_ID,
  DEFAULT_DRY_RUN = 'true'
} = process.env;

async function basicWorkersCleanup() {
  try {
    console.log('🚀 Starting Basic Workers Cleanup Example\n');

    // Validate required environment variables
    if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
      throw new Error('Missing required environment variables: CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID');
    }

    // Initialize service manager
    const serviceManager = new ServiceManager(CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID);
    
    // Validate connection
    console.log('🔍 Validating Cloudflare API connection...');
    const connectionStatus = await serviceManager.validateConnections();
    
    if (!connectionStatus.overall) {
      throw new Error(`Connection validation failed: Pages: ${connectionStatus.pages}, Workers: ${connectionStatus.workers}`);
    }
    
    console.log('✅ API connection validated successfully\n');

    // List all Workers scripts
    console.log('📋 Fetching Workers scripts...');
    const resources = await serviceManager.listAllResources();
    
    if (resources.workers.length === 0) {
      console.log('ℹ️  No Workers scripts found in this account');
      return;
    }

    console.log(`📊 Found ${resources.workers.length} Workers script(s):`);
    resources.workers.forEach((script, index) => {
      console.log(`  ${index + 1}. ${script.id} (created: ${new Date(script.created_on).toLocaleDateString()})`);
    });
    console.log();

    // Interactive mode - show script details and let user decide
    const scriptsToDelete = [];
    
    for (const script of resources.workers) {
      console.log(`🔄 Analyzing script: ${script.id}`);
      
      try {
        // Get detailed information about the script
        const details = await serviceManager.getWorkerDetails(script.id);
        const createdDate = new Date(script.created_on);
        const ageInDays = Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24));
        
        console.log(`   📅 Created: ${createdDate.toLocaleDateString()} (${ageInDays} days ago)`);
        console.log(`   📝 Script size: ${details.script?.length || 0} characters`);
        
        // Check if script has routes or custom domains
        if (details.routes && details.routes.length > 0) {
          console.log(`   🌐 Routes configured: ${details.routes.length}`);
          details.routes.forEach((route, index) => {
            console.log(`      ${index + 1}. ${route.pattern} (zone: ${route.zone_name || 'N/A'})`);
          });
        } else {
          console.log(`   📍 No routes configured`);
        }

        // Basic criteria for cleanup suggestion
        let shouldSuggestCleanup = false;
        const reasons = [];

        // Suggest cleanup for scripts older than 30 days with no routes
        if (ageInDays > 30 && (!details.routes || details.routes.length === 0)) {
          shouldSuggestCleanup = true;
          reasons.push('Old script with no routes');
        }

        // Suggest cleanup for very small scripts (likely test scripts)
        if (details.script && details.script.length < 100) {
          shouldSuggestCleanup = true;
          reasons.push('Very small script (likely test)');
        }

        // Scripts with "test" or "demo" in the name
        if (script.id.toLowerCase().includes('test') || script.id.toLowerCase().includes('demo')) {
          shouldSuggestCleanup = true;
          reasons.push('Test/demo script name pattern');
        }

        if (shouldSuggestCleanup) {
          console.log(`   🧹 Cleanup suggested: ${reasons.join(', ')}`);
          scriptsToDelete.push({
            script,
            reasons,
            details
          });
        } else {
          console.log(`   ✅ Script appears to be in use - keeping`);
        }

      } catch (scriptError) {
        console.error(`   ⚠️  Warning: Could not analyze ${script.id}: ${scriptError.message}`);
        continue;
      }
      
      console.log(); // Add spacing between scripts
    }

    // Show cleanup summary
    if (scriptsToDelete.length === 0) {
      console.log('✨ No scripts suggested for cleanup. All scripts appear to be in use.');
      return;
    }

    console.log(`🧹 Found ${scriptsToDelete.length} script(s) suggested for cleanup:`);
    scriptsToDelete.forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.script.id} - ${item.reasons.join(', ')}`);
    });
    console.log();

    // Perform cleanup with safety options
    const dryRun = DEFAULT_DRY_RUN === 'true';
    console.log(`${dryRun ? '🔍 [DRY RUN]' : '🗑️  [ACTUAL]'} Cleaning up suggested scripts...`);
    
    const scriptIds = scriptsToDelete.map(item => item.script.id);
    const result = await serviceManager.bulkDeleteWorkers(
      scriptIds,
      {
        dryRun,
        batchSize: 3,
        validateBeforeDelete: true
      }
    );

    console.log(`✅ Cleanup completed: ${result.success} succeeded, ${result.failed} failed`);
    
    if (result.failed > 0) {
      console.log(`⚠️  Some deletions failed. Check logs for details.`);
    }

    if (result.success > 0) {
      console.log(`🎉 Successfully ${dryRun ? 'identified' : 'cleaned up'} ${result.success} Workers script(s)`);
    }
    
    if (dryRun) {
      console.log('\n💡 Tip: Set DEFAULT_DRY_RUN=false in your .env file to perform actual cleanup');
      console.log('⚠️  Important: Always review suggested scripts carefully before actual deletion');
    }

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    logger.error('Basic Workers cleanup failed', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

// Execute the cleanup if this script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  basicWorkersCleanup()
    .catch(error => {
      console.error('❌ Unhandled error:', error);
      process.exit(1);
    });
}

export { basicWorkersCleanup };