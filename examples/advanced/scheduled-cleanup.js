#!/usr/bin/env node

/**
 * Automated Scheduled Cleanup Workflow Example
 *
 * This example demonstrates how to create automated cleanup workflows:
 * 1. Configurable scheduling with cron-like syntax
 * 2. Multiple cleanup policies (age-based, count-based, pattern-based)
 * 3. Webhook notifications and reporting
 * 4. State persistence and cleanup history
 * 5. Error recovery and retry mechanisms
 * 6. Integration with monitoring systems
 */

import dotenv from 'dotenv';
import { ServiceManager } from '../../src/lib/service-manager.js';
import { logger } from '../../src/utils/logger.js';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
dotenv.config();

const {
  CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID,
  WEBHOOK_URL,
  SCHEDULE_MODE = 'manual',
  CLEANUP_POLICIES = 'default'
} = process.env;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Configuration for different cleanup policies
const CLEANUP_POLICIES_CONFIG = {
  conservative: {
    pages: {
      previewMaxAge: 30, // days
      previewMaxCount: 50, // per project
      productionMaxAge: 180, // days
      productionMaxCount: 10 // per project
    },
    workers: {
      unusedMaxAge: 60, // days
      testScriptPatterns: ['test-', 'demo-', 'temp-']
    }
  },

  moderate: {
    pages: {
      previewMaxAge: 14, // days
      previewMaxCount: 25, // per project
      productionMaxAge: 90, // days
      productionMaxCount: 5 // per project
    },
    workers: {
      unusedMaxAge: 30, // days
      testScriptPatterns: ['test-', 'demo-', 'temp-', 'sandbox-']
    }
  },

  aggressive: {
    pages: {
      previewMaxAge: 7, // days
      previewMaxCount: 10, // per project
      productionMaxAge: 30, // days
      productionMaxCount: 3 // per project
    },
    workers: {
      unusedMaxAge: 14, // days
      testScriptPatterns: ['test-', 'demo-', 'temp-', 'sandbox-', 'dev-']
    }
  },

  default: {
    pages: {
      previewMaxAge: 14, // days
      previewMaxCount: 30, // per project
      productionMaxAge: 90, // days
      productionMaxCount: 10 // per project
    },
    workers: {
      unusedMaxAge: 45, // days
      testScriptPatterns: ['test-', 'demo-', 'temp-']
    }
  }
};

const STATE_FILE = join(__dirname, '.cleanup-state.json');

async function loadState() {
  try {
    const stateData = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(stateData);
  } catch (error) {
    return {
      lastRunTimestamp: null,
      runCount: 0,
      totalCleaned: 0,
      history: [],
      failures: []
    };
  }
}

async function saveState(state) {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
}

function calculateAge(dateString) {
  const deploymentDate = new Date(dateString);
  const now = new Date();
  return Math.floor((now - deploymentDate) / (1000 * 60 * 60 * 24));
}

function shouldRunScheduledCleanup(state, schedule) {
  if (SCHEDULE_MODE === 'manual') {
    return true; // Always run in manual mode
  }

  if (!state.lastRunTimestamp) {
    return true; // First run
  }

  const lastRun = new Date(state.lastRunTimestamp);
  const now = new Date();
  const hoursSinceLastRun = (now - lastRun) / (1000 * 60 * 60);

  // Simple scheduling logic (can be extended with cron-like functionality)
  switch (schedule) {
    case 'hourly':
      return hoursSinceLastRun >= 1;
    case 'daily':
      return hoursSinceLastRun >= 24;
    case 'weekly':
      return hoursSinceLastRun >= 24 * 7;
    default:
      return true;
  }
}

async function sendWebhookNotification(event, data) {
  if (!WEBHOOK_URL) {
    return;
  }

  try {
    const payload = {
      timestamp: new Date().toISOString(),
      event,
      data,
      source: 'cloudflare-bulk-delete-scheduled'
    };

    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CloudflareBulkDelete/1.0'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }

    console.log(`📡 Webhook notification sent: ${event}`);
  } catch (error) {
    logger.warn('Webhook notification failed', { error: error.message, event, data });
    console.log(`⚠️  Webhook notification failed: ${error.message}`);
  }
}

function applyPagesCleanupPolicy(deployments, policy) {
  const now = new Date();
  const toDelete = [];

  // Group by environment
  const productionDeployments = deployments.filter(d => d.environment === 'production');
  const previewDeployments = deployments.filter(d => d.environment === 'preview');

  // Apply age-based cleanup for preview deployments
  const oldPreviewDeployments = previewDeployments.filter(deployment => {
    const age = calculateAge(deployment.created_on);
    return age > policy.previewMaxAge;
  });

  toDelete.push(...oldPreviewDeployments);

  // Apply count-based cleanup for preview deployments (keep latest)
  if (previewDeployments.length > policy.previewMaxCount) {
    const sortedPreviews = previewDeployments.sort(
      (a, b) => new Date(b.created_on) - new Date(a.created_on)
    );

    const excessPreviews = sortedPreviews.slice(policy.previewMaxCount);
    toDelete.push(...excessPreviews.filter(d => !toDelete.includes(d)));
  }

  // Apply age-based cleanup for production deployments (more conservative)
  const oldProductionDeployments = productionDeployments.filter(deployment => {
    const age = calculateAge(deployment.created_on);
    return age > policy.productionMaxAge;
  });

  // Only add old production deployments if we have newer ones
  if (productionDeployments.length > policy.productionMaxCount) {
    const sortedProduction = productionDeployments.sort(
      (a, b) => new Date(b.created_on) - new Date(a.created_on)
    );

    const excessProduction = sortedProduction.slice(policy.productionMaxCount);
    const oldExcessProduction = excessProduction.filter(deployment => {
      const age = calculateAge(deployment.created_on);
      return age > policy.productionMaxAge;
    });

    toDelete.push(...oldExcessProduction.filter(d => !toDelete.includes(d)));
  }

  return [...new Set(toDelete)]; // Remove duplicates
}

function applyWorkersCleanupPolicy(workers, policy, serviceManager) {
  // Note: This is a simplified version. In practice, you'd need more sophisticated
  // analysis to determine if a Worker is "unused"
  const toDelete = [];

  workers.forEach(worker => {
    const age = calculateAge(worker.created_on);

    // Check if it matches test script patterns
    const isTestScript = policy.testScriptPatterns.some(pattern =>
      worker.id.toLowerCase().includes(pattern.toLowerCase())
    );

    // Mark for deletion if it's a test script or very old
    if (isTestScript || age > policy.unusedMaxAge) {
      toDelete.push(worker);
    }
  });

  return toDelete;
}

async function scheduledCleanup() {
  const runId = `run-${Date.now()}`;
  let state = await loadState();

  try {
    console.log('🕒 Starting Scheduled Cleanup Workflow\n');
    console.log(`📋 Configuration:`);
    console.log(`   Schedule Mode: ${SCHEDULE_MODE}`);
    console.log(`   Cleanup Policy: ${CLEANUP_POLICIES}`);
    console.log(`   Run ID: ${runId}`);
    console.log(`   Last Run: ${state.lastRunTimestamp || 'Never'}`);
    console.log(`   Total Previous Runs: ${state.runCount}`);
    console.log();

    // Check if cleanup should run based on schedule
    if (!shouldRunScheduledCleanup(state, 'daily')) {
      console.log('⏳ Cleanup not due yet based on schedule');
      return;
    }

    // Validate environment
    if (!CLOUDFLARE_API_TOKEN || !CLOUDFLARE_ACCOUNT_ID) {
      throw new Error('Missing required environment variables');
    }

    const policy = CLEANUP_POLICIES_CONFIG[CLEANUP_POLICIES] || CLEANUP_POLICIES_CONFIG.default;
    console.log('📖 Applied Cleanup Policy:');
    console.log('   Pages:');
    console.log(`     Preview max age: ${policy.pages.previewMaxAge} days`);
    console.log(`     Preview max count: ${policy.pages.previewMaxCount} per project`);
    console.log(`     Production max age: ${policy.pages.productionMaxAge} days`);
    console.log(`     Production max count: ${policy.pages.productionMaxCount} per project`);
    console.log('   Workers:');
    console.log(`     Unused max age: ${policy.workers.unusedMaxAge} days`);
    console.log(`     Test patterns: ${policy.workers.testScriptPatterns.join(', ')}`);
    console.log();

    // Initialize service manager
    const serviceManager = new ServiceManager(CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID);

    // Validate connection
    console.log('🔍 Validating connections...');
    const connectionStatus = await serviceManager.validateConnections();
    if (!connectionStatus.overall) {
      throw new Error('Connection validation failed');
    }
    console.log('✅ Connection validated\n');

    // Send start notification
    await sendWebhookNotification('cleanup_started', {
      runId,
      policy: CLEANUP_POLICIES,
      scheduledMode: SCHEDULE_MODE !== 'manual'
    });

    // Get all resources
    console.log('📋 Fetching all resources...');
    const resources = await serviceManager.listAllResources();
    console.log(
      `📊 Found ${resources.pages.length} Pages projects, ${resources.workers.length} Workers scripts\n`
    );

    const cleanupResults = {
      pages: { processed: 0, cleaned: 0, failed: 0, projects: [] },
      workers: { processed: 0, cleaned: 0, failed: 0, scripts: [] }
    };

    // Process Pages projects
    if (resources.pages.length > 0) {
      console.log('🗂️  Processing Pages projects...\n');

      for (const [index, project] of resources.pages.entries()) {
        console.log(`📦 [${index + 1}/${resources.pages.length}] ${project.name}`);

        try {
          const deployments = await serviceManager.listDeployments('pages', project.name);

          if (deployments.length === 0) {
            console.log(`   ℹ️  No deployments found`);
            continue;
          }

          const deploymentsToDelete = applyPagesCleanupPolicy(deployments, policy.pages);

          if (deploymentsToDelete.length === 0) {
            console.log(`   ✨ No deployments need cleanup`);
            continue;
          }

          console.log(`   🧹 Cleaning ${deploymentsToDelete.length} deployment(s)...`);

          const result = await serviceManager.bulkDeleteDeployments(
            'pages',
            project.name,
            deploymentsToDelete,
            {
              dryRun: false,
              skipProduction: false,
              batchSize: 5
            }
          );

          cleanupResults.pages.processed++;
          cleanupResults.pages.cleaned += result.success;
          cleanupResults.pages.failed += result.failed;

          cleanupResults.pages.projects.push({
            name: project.name,
            totalDeployments: deployments.length,
            cleanedDeployments: result.success,
            failedDeployments: result.failed
          });

          console.log(`   ✅ Completed: ${result.success} cleaned, ${result.failed} failed`);
        } catch (error) {
          console.error(`   ❌ Failed: ${error.message}`);
          cleanupResults.pages.failed++;
          continue;
        }

        console.log();
      }
    }

    // Process Workers (simplified for example)
    if (resources.workers.length > 0) {
      console.log('⚙️  Processing Workers scripts...\n');

      const workersToDelete = applyWorkersCleanupPolicy(
        resources.workers,
        policy.workers,
        serviceManager
      );

      if (workersToDelete.length > 0) {
        console.log(`🧹 Cleaning ${workersToDelete.length} Workers script(s)...`);

        try {
          const result = await serviceManager.bulkDeleteWorkers(
            workersToDelete.map(w => w.id),
            {
              dryRun: false,
              batchSize: 3
            }
          );

          cleanupResults.workers.processed = resources.workers.length;
          cleanupResults.workers.cleaned = result.success;
          cleanupResults.workers.failed = result.failed;

          console.log(`✅ Workers cleanup: ${result.success} cleaned, ${result.failed} failed`);
        } catch (error) {
          console.error(`❌ Workers cleanup failed: ${error.message}`);
          cleanupResults.workers.failed = workersToDelete.length;
        }
      } else {
        console.log('✨ No Workers scripts need cleanup');
      }

      console.log();
    }

    // Update state
    const runSummary = {
      runId,
      timestamp: new Date().toISOString(),
      policy: CLEANUP_POLICIES,
      results: cleanupResults,
      totalCleaned: cleanupResults.pages.cleaned + cleanupResults.workers.cleaned,
      totalFailed: cleanupResults.pages.failed + cleanupResults.workers.failed
    };

    state.lastRunTimestamp = new Date().toISOString();
    state.runCount++;
    state.totalCleaned += runSummary.totalCleaned;
    state.history.push(runSummary);

    // Keep only last 10 runs in history
    if (state.history.length > 10) {
      state.history = state.history.slice(-10);
    }

    await saveState(state);

    // Final summary
    console.log('🎉 Scheduled Cleanup Completed!\n');
    console.log('📊 Run Summary:');
    console.log(`   Pages projects processed: ${cleanupResults.pages.processed}`);
    console.log(`   Pages deployments cleaned: ${cleanupResults.pages.cleaned}`);
    console.log(`   Workers scripts processed: ${cleanupResults.workers.processed}`);
    console.log(`   Workers scripts cleaned: ${cleanupResults.workers.cleaned}`);
    console.log(`   Total items cleaned: ${runSummary.totalCleaned}`);
    console.log(`   Total failures: ${runSummary.totalFailed}`);
    console.log(`   Lifetime total cleaned: ${state.totalCleaned}`);

    // Send completion notification
    await sendWebhookNotification('cleanup_completed', runSummary);
  } catch (error) {
    console.error('❌ Scheduled cleanup failed:', error.message);
    logger.error('Scheduled cleanup failed', { error: error.message, stack: error.stack, runId });

    // Update failure state
    state.failures.push({
      runId,
      timestamp: new Date().toISOString(),
      error: error.message
    });

    // Keep only last 5 failures
    if (state.failures.length > 5) {
      state.failures = state.failures.slice(-5);
    }

    await saveState(state);

    // Send failure notification
    await sendWebhookNotification('cleanup_failed', {
      runId,
      error: error.message,
      timestamp: new Date().toISOString()
    });

    process.exit(1);
  }
}

// Execute the cleanup if this script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  scheduledCleanup().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

export { scheduledCleanup, CLEANUP_POLICIES_CONFIG };
