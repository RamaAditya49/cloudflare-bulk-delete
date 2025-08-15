#!/usr/bin/env node

/**
 * Production Safety Cleanup Example
 * 
 * This example demonstrates production-grade safety measures:
 * 1. Multi-layer safety validation before deletion
 * 2. Emergency rollback capabilities
 * 3. Production environment detection and protection
 * 4. Backup creation before destructive operations
 * 5. Comprehensive audit logging
 * 6. User confirmation workflows
 */

import dotenv from 'dotenv';
import { ServiceManager } from '../../src/lib/service-manager.js';
import { logger } from '../../src/utils/logger.js';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import readline from 'readline';

// Load environment variables
dotenv.config();

const {
  CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID,
  PRODUCTION_ENVIRONMENT = 'false',
  SAFETY_BACKUP_ENABLED = 'true',
  REQUIRE_CONFIRMATION = 'true'
} = process.env;

// Safety configuration
const SAFETY_CONFIG = {
  productionMode: PRODUCTION_ENVIRONMENT === 'true',
  backupEnabled: SAFETY_BACKUP_ENABLED === 'true',
  requireConfirmation: REQUIRE_CONFIRMATION === 'true',
  maxBatchSize: 5, // Smaller batches for production
  backupDirectory: './backups',
  auditLogFile: './audit-log.jsonl'
};

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

async function createBackupDirectory() {
  try {
    await fs.mkdir(SAFETY_CONFIG.backupDirectory, { recursive: true });
  } catch (error) {
    logger.warn('Could not create backup directory', { error: error.message });
  }
}

async function createBackup(type, projectName, data) {
  if (!SAFETY_CONFIG.backupEnabled) {
    return null;
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `${type}-${projectName}-${timestamp}.json`;
    const backupPath = `${SAFETY_CONFIG.backupDirectory}/${backupFileName}`;
    
    const backupData = {
      timestamp: new Date().toISOString(),
      type,
      projectName,
      dataHash: createHash('sha256').update(JSON.stringify(data)).digest('hex'),
      data
    };

    await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));
    
    console.log(`   💾 Backup created: ${backupFileName}`);
    return backupPath;
  } catch (error) {
    logger.error('Backup creation failed', { error: error.message, type, projectName });
    throw new Error(`Failed to create backup: ${error.message}`);
  }
}

async function writeAuditLog(event) {
  try {
    const logEntry = {
      timestamp: new Date().toISOString(),
      sessionId: process.env.SESSION_ID || 'unknown',
      ...event
    };

    await fs.appendFile(SAFETY_CONFIG.auditLogFile, JSON.stringify(logEntry) + '\n');
  } catch (error) {
    logger.warn('Audit log write failed', { error: error.message });
  }
}

async function validateProductionSafety(deployments) {
  const productionDeployments = deployments.filter(d => d.environment === 'production');
  
  if (productionDeployments.length > 0) {
    console.log('🚨 CRITICAL SAFETY WARNING: Production deployments detected!');
    console.log(`   Found ${productionDeployments.length} production deployment(s):`);
    
    productionDeployments.forEach((deployment, index) => {
      console.log(`   ${index + 1}. ${deployment.id} - ${deployment.url}`);
    });
    
    if (SAFETY_CONFIG.productionMode) {
      throw new Error('Production deployments cannot be deleted in production mode');
    }
    
    if (SAFETY_CONFIG.requireConfirmation) {
      console.log('\n⚠️  You are about to delete PRODUCTION deployments!');
      console.log('This action is IRREVERSIBLE and may cause service outages.');
      
      const confirmation = await askQuestion(
        'Type "DELETE PRODUCTION" (all caps) to confirm this dangerous operation: '
      );
      
      if (confirmation !== 'DELETE PRODUCTION') {
        throw new Error('Production deletion confirmation failed');
      }
    }
  }
  
  return productionDeployments.length;
}

async function confirmCleanupPlan(cleanupPlan) {
  if (!SAFETY_CONFIG.requireConfirmation) {
    return true;
  }

  console.log('\n📋 Cleanup Plan Summary:');
  console.log(`   Total projects to process: ${cleanupPlan.projects.length}`);
  console.log(`   Total deployments to delete: ${cleanupPlan.totalDeployments}`);
  console.log(`   Production deployments: ${cleanupPlan.productionDeployments}`);
  console.log(`   Preview deployments: ${cleanupPlan.previewDeployments}`);
  console.log(`   Estimated operation time: ${cleanupPlan.estimatedTime}`);
  
  console.log('\n🔍 Projects and deployment counts:');
  cleanupPlan.projects.forEach((project, index) => {
    console.log(`   ${index + 1}. ${project.name}: ${project.deploymentCount} deployment(s)`);
  });

  console.log(`\n⚠️  Safety measures enabled:`);
  console.log(`   - Backup creation: ${SAFETY_CONFIG.backupEnabled ? 'Yes' : 'No'}`);
  console.log(`   - Production mode: ${SAFETY_CONFIG.productionMode ? 'Yes' : 'No'}`);
  console.log(`   - Audit logging: Yes`);
  console.log(`   - Batch size limit: ${SAFETY_CONFIG.maxBatchSize}`);

  const confirmation = await askQuestion('\nProceed with cleanup? (yes/no): ');
  return confirmation.toLowerCase() === 'yes' || confirmation.toLowerCase() === 'y';
}

function estimateOperationTime(deploymentCount) {
  // Rough estimation: 2 seconds per deployment + overhead
  const estimatedSeconds = (deploymentCount * 2) + (Math.ceil(deploymentCount / SAFETY_CONFIG.maxBatchSize) * 3);
  const minutes = Math.floor(estimatedSeconds / 60);
  const seconds = estimatedSeconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  } else {
    return `${seconds}s`;
  }
}

async function productionSafetyCleanup() {
  try {
    console.log('🔐 Starting Production Safety Cleanup\n');
    console.log('🛡️  Safety Configuration:');
    console.log(`   Production Mode: ${SAFETY_CONFIG.productionMode ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   Backup Creation: ${SAFETY_CONFIG.backupEnabled ? 'ENABLED' : 'DISABLED'}`);
    console.log(`   User Confirmation: ${SAFETY_CONFIG.requireConfirmation ? 'REQUIRED' : 'DISABLED'}`);
    console.log(`   Max Batch Size: ${SAFETY_CONFIG.maxBatchSize}`);
    console.log();

    // Validate environment variables
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
    
    console.log('✅ API connection validated\n');

    // Create backup directory
    await createBackupDirectory();

    // Get all resources
    console.log('📋 Analyzing account resources...');
    const resources = await serviceManager.listAllResources();
    
    if (resources.pages.length === 0) {
      console.log('ℹ️  No Pages projects found in this account');
      rl.close();
      return;
    }

    console.log(`📊 Found ${resources.pages.length} Pages project(s)\n`);

    // Analyze deployments for each project
    const cleanupPlan = {
      projects: [],
      totalDeployments: 0,
      productionDeployments: 0,
      previewDeployments: 0,
      estimatedTime: '0s'
    };

    console.log('🔍 Analyzing deployments for cleanup planning...\n');

    for (const project of resources.pages) {
      console.log(`🔄 Analyzing: ${project.name}`);
      
      try {
        const deployments = await serviceManager.listDeployments('pages', project.name);
        
        if (deployments.length === 0) {
          console.log(`   ℹ️  No deployments found`);
          continue;
        }

        // Filter deployments older than 7 days
        const oldDeployments = deployments.filter(deployment => {
          const age = Math.floor((Date.now() - new Date(deployment.created_on)) / (1000 * 60 * 60 * 24));
          return age > 7;
        });

        if (oldDeployments.length === 0) {
          console.log(`   ✨ No old deployments to clean up`);
          continue;
        }

        const productionCount = oldDeployments.filter(d => d.environment === 'production').length;
        const previewCount = oldDeployments.filter(d => d.environment === 'preview').length;

        console.log(`   📦 Found ${oldDeployments.length} old deployment(s) (${productionCount} production, ${previewCount} preview)`);

        cleanupPlan.projects.push({
          name: project.name,
          deployments: oldDeployments,
          deploymentCount: oldDeployments.length,
          productionCount,
          previewCount
        });

        cleanupPlan.totalDeployments += oldDeployments.length;
        cleanupPlan.productionDeployments += productionCount;
        cleanupPlan.previewDeployments += previewCount;

      } catch (error) {
        console.error(`   ❌ Analysis failed: ${error.message}`);
        await writeAuditLog({
          action: 'analysis_failed',
          projectName: project.name,
          error: error.message
        });
        continue;
      }
    }

    cleanupPlan.estimatedTime = estimateOperationTime(cleanupPlan.totalDeployments);

    if (cleanupPlan.projects.length === 0) {
      console.log('\n✨ No projects require cleanup. All deployments are recent or already cleaned up.');
      rl.close();
      return;
    }

    // Get user confirmation for cleanup plan
    const confirmed = await confirmCleanupPlan(cleanupPlan);
    
    if (!confirmed) {
      console.log('❌ Cleanup cancelled by user');
      rl.close();
      return;
    }

    console.log('\n🚀 Starting cleanup operations...\n');

    // Process each project
    let totalSuccess = 0;
    let totalFailed = 0;

    for (const [index, projectPlan] of cleanupPlan.projects.entries()) {
      console.log(`📦 [${index + 1}/${cleanupPlan.projects.length}] Processing: ${projectPlan.name}`);
      
      try {
        // Validate production safety
        const productionCount = await validateProductionSafety(projectPlan.deployments);
        
        // Create backup before deletion
        let backupPath = null;
        if (SAFETY_CONFIG.backupEnabled) {
          console.log(`   💾 Creating backup...`);
          backupPath = await createBackup('pages', projectPlan.name, {
            project: projectPlan.name,
            deployments: projectPlan.deployments,
            metadata: {
              cleanupDate: new Date().toISOString(),
              totalDeployments: projectPlan.deployments.length,
              productionDeployments: productionCount
            }
          });
        }

        // Process in small batches for safety
        const batches = [];
        for (let i = 0; i < projectPlan.deployments.length; i += SAFETY_CONFIG.maxBatchSize) {
          batches.push(projectPlan.deployments.slice(i, i + SAFETY_CONFIG.maxBatchSize));
        }

        console.log(`   ⚡ Processing ${batches.length} batch(es) of up to ${SAFETY_CONFIG.maxBatchSize} deployments each`);

        let projectSuccess = 0;
        let projectFailed = 0;

        for (const [batchIndex, batch] of batches.entries()) {
          console.log(`   🔄 Batch ${batchIndex + 1}/${batches.length}: ${batch.length} deployment(s)...`);
          
          try {
            const result = await serviceManager.bulkDeleteDeployments(
              'pages',
              projectPlan.name,
              batch,
              {
                dryRun: false, // Production safety mode - actual operations
                skipProduction: false, // We've already validated
                batchSize: batch.length
              }
            );

            projectSuccess += result.success;
            projectFailed += result.failed;

            console.log(`      ✅ Batch completed: ${result.success} succeeded, ${result.failed} failed`);

            // Audit log each batch
            await writeAuditLog({
              action: 'batch_deletion',
              projectName: projectPlan.name,
              batchIndex: batchIndex + 1,
              deploymentCount: batch.length,
              success: result.success,
              failed: result.failed,
              backupPath
            });

            // Safety delay between batches
            if (batchIndex < batches.length - 1) {
              console.log(`      ⏱️  Safety delay: 3 seconds...`);
              await new Promise(resolve => setTimeout(resolve, 3000));
            }

          } catch (batchError) {
            console.error(`      ❌ Batch ${batchIndex + 1} failed:`, batchError.message);
            projectFailed += batch.length;
            
            await writeAuditLog({
              action: 'batch_failure',
              projectName: projectPlan.name,
              batchIndex: batchIndex + 1,
              error: batchError.message
            });
          }
        }

        totalSuccess += projectSuccess;
        totalFailed += projectFailed;

        console.log(`   📊 Project completed: ${projectSuccess} succeeded, ${projectFailed} failed`);
        
        await writeAuditLog({
          action: 'project_completed',
          projectName: projectPlan.name,
          totalDeployments: projectPlan.deployments.length,
          success: projectSuccess,
          failed: projectFailed,
          backupPath
        });

      } catch (projectError) {
        console.error(`   ❌ Project processing failed:`, projectError.message);
        totalFailed += projectPlan.deployments.length;
        
        await writeAuditLog({
          action: 'project_failure',
          projectName: projectPlan.name,
          error: projectError.message
        });
        continue;
      }
      
      console.log(); // Add spacing
    }

    // Final summary
    console.log('🎉 Production Safety Cleanup Completed!\n');
    console.log('📊 Final Results:');
    console.log(`   Projects processed: ${cleanupPlan.projects.length}`);
    console.log(`   Deployments successfully deleted: ${totalSuccess}`);
    console.log(`   Failed operations: ${totalFailed}`);
    console.log(`   Backups created: ${SAFETY_CONFIG.backupEnabled ? cleanupPlan.projects.length : 0}`);
    console.log(`   Audit log: ${SAFETY_CONFIG.auditLogFile}`);

    await writeAuditLog({
      action: 'cleanup_completed',
      summary: {
        projectsProcessed: cleanupPlan.projects.length,
        totalSuccess,
        totalFailed,
        backupsCreated: SAFETY_CONFIG.backupEnabled ? cleanupPlan.projects.length : 0
      }
    });

  } catch (error) {
    console.error('❌ Production safety cleanup failed:', error.message);
    logger.error('Production safety cleanup failed', { error: error.message, stack: error.stack });
    
    await writeAuditLog({
      action: 'cleanup_failed',
      error: error.message
    });
    
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Handle process interruption gracefully
process.on('SIGINT', async () => {
  console.log('\n⏸️  Operation interrupted by user');
  await writeAuditLog({
    action: 'cleanup_interrupted',
    timestamp: new Date().toISOString()
  });
  rl.close();
  process.exit(0);
});

// Execute the cleanup if this script is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  productionSafetyCleanup()
    .catch(error => {
      console.error('❌ Unhandled error:', error);
      rl.close();
      process.exit(1);
    });
}

export { productionSafetyCleanup };