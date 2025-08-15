/**
 * Batch Processing Example
 *
 * This example demonstrates advanced batch processing capabilities:
 * 1. Intelligent batching with dynamic sizing
 * 2. Parallel processing with concurrency control
 * 3. Queue management and priority handling
 * 4. Memory-efficient processing for large datasets
 * 5. Resume functionality for interrupted operations
 * 6. Real-time progress reporting and ETA calculation
 */

import { ServiceManager } from '../../src/lib/service-manager.js';
import { logger } from '../../src/utils/logger.js';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { Worker } from 'worker_threads';
import os from 'os';

/**
 * Advanced Batch Processor for large-scale cleanup operations
 */
export class CloudflareBatchProcessor extends EventEmitter {
  constructor(apiToken, accountId, options = {}) {
    super();

    this.serviceManager = new ServiceManager(apiToken, accountId);
    this.options = {
      maxConcurrency: Math.min(options.maxConcurrency || 3, os.cpus().length),
      dynamicBatching: options.dynamicBatching !== false,
      initialBatchSize: options.initialBatchSize || 10,
      minBatchSize: options.minBatchSize || 5,
      maxBatchSize: options.maxBatchSize || 25,
      memoryThreshold: options.memoryThreshold || 512 * 1024 * 1024, // 512MB
      resumeFile: options.resumeFile || '.batch-processing-state.json',
      enableWorkers: options.enableWorkers || false,
      rateLimit: options.rateLimit || { requests: 100, window: 60000 }, // 100 req/min
      ...options
    };

    this.state = {
      totalItems: 0,
      processedItems: 0,
      succeededItems: 0,
      failedItems: 0,
      currentBatchSize: this.options.initialBatchSize,
      startTime: null,
      lastSaveTime: null,
      queues: new Map(),
      workers: [],
      rateLimiter: {
        requests: [],
        lastReset: Date.now()
      }
    };

    this.setupEventHandlers();
  }

  setupEventHandlers() {
    // Memory monitoring
    setInterval(() => {
      const memUsage = process.memoryUsage();
      if (memUsage.heapUsed > this.options.memoryThreshold) {
        this.emit('memory-warning', {
          current: memUsage.heapUsed,
          threshold: this.options.memoryThreshold,
          recommendation: 'Consider reducing batch size or concurrency'
        });
      }
    }, 30000);

    // Auto-save state every 60 seconds
    setInterval(() => {
      this.saveState().catch(error => {
        logger.warn('Failed to auto-save batch processing state', { error: error.message });
      });
    }, 60000);
  }

  async saveState() {
    try {
      const stateData = {
        ...this.state,
        timestamp: Date.now(),
        options: this.options
      };

      await fs.writeFile(this.options.resumeFile, JSON.stringify(stateData, null, 2));
      this.state.lastSaveTime = Date.now();
      this.emit('state-saved', { timestamp: this.state.lastSaveTime });
    } catch (error) {
      logger.error('Failed to save batch processing state', { error: error.message });
      throw error;
    }
  }

  async loadState() {
    try {
      const stateData = await fs.readFile(this.options.resumeFile, 'utf-8');
      const savedState = JSON.parse(stateData);

      // Merge saved state with current state
      this.state = {
        ...this.state,
        ...savedState,
        workers: [], // Reset workers
        rateLimiter: {
          requests: [],
          lastReset: Date.now()
        }
      };

      this.emit('state-loaded', {
        resumedItems: this.state.processedItems,
        totalItems: this.state.totalItems
      });

      return true;
    } catch (error) {
      // File doesn't exist or is corrupted - start fresh
      return false;
    }
  }

  async cleanupState() {
    try {
      await fs.unlink(this.options.resumeFile);
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  /**
   * Rate limiting implementation
   */
  async applyRateLimit() {
    const now = Date.now();

    // Reset window if needed
    if (now - this.state.rateLimiter.lastReset > this.options.rateLimit.window) {
      this.state.rateLimiter.requests = [];
      this.state.rateLimiter.lastReset = now;
    }

    // Check if we've hit the rate limit
    if (this.state.rateLimiter.requests.length >= this.options.rateLimit.requests) {
      const oldestRequest = Math.min(...this.state.rateLimiter.requests);
      const waitTime = this.options.rateLimit.window - (now - oldestRequest);

      if (waitTime > 0) {
        this.emit('rate-limit-wait', { waitTime });
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    this.state.rateLimiter.requests.push(now);
  }

  /**
   * Dynamic batch size adjustment based on performance
   */
  adjustBatchSize(success, processingTime, errors) {
    if (!this.options.dynamicBatching) return;

    const avgTime = processingTime / success;
    const errorRate = errors / (success + errors);

    // Increase batch size if performance is good
    if (
      errorRate < 0.1 &&
      avgTime < 2000 &&
      this.state.currentBatchSize < this.options.maxBatchSize
    ) {
      this.state.currentBatchSize = Math.min(
        this.state.currentBatchSize + 2,
        this.options.maxBatchSize
      );
      this.emit('batch-size-adjusted', {
        newSize: this.state.currentBatchSize,
        reason: 'performance-increase'
      });
    }
    // Decrease batch size if there are issues
    else if (errorRate > 0.3 || avgTime > 5000) {
      this.state.currentBatchSize = Math.max(
        this.state.currentBatchSize - 2,
        this.options.minBatchSize
      );
      this.emit('batch-size-adjusted', {
        newSize: this.state.currentBatchSize,
        reason: 'performance-decrease'
      });
    }
  }

  /**
   * Create processing queue with priority
   */
  createQueue(name, items, priority = 0) {
    const batches = [];
    for (let i = 0; i < items.length; i += this.state.currentBatchSize) {
      batches.push({
        id: `${name}-batch-${Math.floor(i / this.state.currentBatchSize) + 1}`,
        items: items.slice(i, i + this.state.currentBatchSize),
        priority,
        name,
        attempts: 0,
        maxAttempts: 3
      });
    }

    this.state.queues.set(name, {
      batches,
      totalItems: items.length,
      processedItems: 0,
      priority
    });

    this.emit('queue-created', {
      name,
      totalBatches: batches.length,
      totalItems: items.length,
      priority
    });

    return batches.length;
  }

  /**
   * Get next batch to process (priority-based)
   */
  getNextBatch() {
    let highestPriority = -Infinity;
    let selectedQueue = null;
    let selectedBatch = null;

    for (const [queueName, queue] of this.state.queues) {
      const availableBatch = queue.batches.find(
        batch => batch.attempts < batch.maxAttempts && !batch.processing
      );

      if (availableBatch && queue.priority > highestPriority) {
        highestPriority = queue.priority;
        selectedQueue = queueName;
        selectedBatch = availableBatch;
      }
    }

    if (selectedBatch) {
      selectedBatch.processing = true;
      selectedBatch.startTime = Date.now();

      this.emit('batch-started', {
        queueName: selectedQueue,
        batchId: selectedBatch.id,
        itemCount: selectedBatch.items.length,
        attempt: selectedBatch.attempts + 1
      });
    }

    return selectedBatch ? { queue: selectedQueue, batch: selectedBatch } : null;
  }

  /**
   * Process a single batch
   */
  async processBatch(queueName, batch) {
    const startTime = Date.now();
    batch.attempts++;

    try {
      await this.applyRateLimit();

      let result = { success: 0, failed: 0, errors: [] };

      // Process based on queue type
      if (queueName.startsWith('pages-')) {
        const projectName = queueName.replace('pages-', '');
        result = await this.serviceManager.bulkDeleteDeployments(
          'pages',
          projectName,
          batch.items,
          {
            dryRun: false,
            batchSize: batch.items.length,
            skipProduction: false
          }
        );
      } else if (queueName === 'workers') {
        result = await this.serviceManager.bulkDeleteWorkers(
          batch.items.map(item => item.id || item),
          {
            dryRun: false,
            batchSize: batch.items.length
          }
        );
      }

      const processingTime = Date.now() - startTime;

      // Update state
      const queue = this.state.queues.get(queueName);
      queue.processedItems += batch.items.length;
      this.state.processedItems += batch.items.length;
      this.state.succeededItems += result.success;
      this.state.failedItems += result.failed;

      // Remove completed batch
      const batchIndex = queue.batches.findIndex(b => b.id === batch.id);
      if (batchIndex !== -1) {
        queue.batches.splice(batchIndex, 1);
      }

      // Adjust batch size based on performance
      this.adjustBatchSize(result.success, processingTime, result.failed);

      this.emit('batch-completed', {
        queueName,
        batchId: batch.id,
        result,
        processingTime,
        attempt: batch.attempts
      });

      return result;
    } catch (error) {
      batch.processing = false;
      batch.error = error.message;
      batch.lastAttempt = Date.now();

      this.emit('batch-failed', {
        queueName,
        batchId: batch.id,
        error: error.message,
        attempt: batch.attempts,
        willRetry: batch.attempts < batch.maxAttempts
      });

      // If max attempts reached, mark items as failed
      if (batch.attempts >= batch.maxAttempts) {
        const queue = this.state.queues.get(queueName);
        queue.processedItems += batch.items.length;
        this.state.processedItems += batch.items.length;
        this.state.failedItems += batch.items.length;

        // Remove failed batch
        const batchIndex = queue.batches.findIndex(b => b.id === batch.id);
        if (batchIndex !== -1) {
          queue.batches.splice(batchIndex, 1);
        }
      }

      throw error;
    }
  }

  /**
   * Calculate ETA and progress metrics
   */
  calculateProgress() {
    if (!this.state.startTime || this.state.totalItems === 0) {
      return {
        percentage: 0,
        eta: null,
        itemsPerSecond: 0,
        estimatedTimeRemaining: null
      };
    }

    const elapsedTime = Date.now() - this.state.startTime;
    const percentage = (this.state.processedItems / this.state.totalItems) * 100;
    const itemsPerSecond = this.state.processedItems / (elapsedTime / 1000);
    const remainingItems = this.state.totalItems - this.state.processedItems;
    const estimatedTimeRemaining =
      itemsPerSecond > 0 ? (remainingItems / itemsPerSecond) * 1000 : null;

    return {
      percentage: Math.round(percentage * 100) / 100,
      eta: estimatedTimeRemaining ? new Date(Date.now() + estimatedTimeRemaining) : null,
      itemsPerSecond: Math.round(itemsPerSecond * 100) / 100,
      estimatedTimeRemaining,
      elapsedTime,
      processedItems: this.state.processedItems,
      totalItems: this.state.totalItems,
      succeededItems: this.state.succeededItems,
      failedItems: this.state.failedItems
    };
  }

  /**
   * Main processing function
   */
  async processAllQueues() {
    this.state.startTime = Date.now();
    const activeWorkers = new Set();

    this.emit('processing-started', {
      totalQueues: this.state.queues.size,
      totalItems: this.state.totalItems,
      maxConcurrency: this.options.maxConcurrency
    });

    try {
      while (this.hasRemainingWork() || activeWorkers.size > 0) {
        // Start new workers if slots available
        while (activeWorkers.size < this.options.maxConcurrency) {
          const work = this.getNextBatch();
          if (!work) break;

          const workerPromise = this.processBatch(work.queue, work.batch).finally(() => {
            activeWorkers.delete(workerPromise);
          });

          activeWorkers.add(workerPromise);
        }

        // Wait for at least one worker to complete
        if (activeWorkers.size > 0) {
          await Promise.race(Array.from(activeWorkers));
        }

        // Emit progress update
        const progress = this.calculateProgress();
        this.emit('progress', progress);

        // Save state periodically
        if (!this.state.lastSaveTime || Date.now() - this.state.lastSaveTime > 60000) {
          await this.saveState();
        }

        // Small delay to prevent tight loops
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Wait for all remaining workers to complete
      if (activeWorkers.size > 0) {
        await Promise.all(Array.from(activeWorkers));
      }

      const finalProgress = this.calculateProgress();
      this.emit('processing-completed', {
        ...finalProgress,
        totalTime: Date.now() - this.state.startTime
      });

      await this.cleanupState();
    } catch (error) {
      this.emit('processing-failed', {
        error: error.message,
        progress: this.calculateProgress()
      });
      await this.saveState();
      throw error;
    }
  }

  hasRemainingWork() {
    for (const queue of this.state.queues.values()) {
      if (queue.batches.some(batch => batch.attempts < batch.maxAttempts)) {
        return true;
      }
    }
    return false;
  }
}

/**
 * Example usage scenarios
 */

// Example 1: Large-scale Pages cleanup with batch processing
export async function largePagesCleanupExample() {
  const processor = new CloudflareBatchProcessor(
    process.env.CLOUDFLARE_API_TOKEN,
    process.env.CLOUDFLARE_ACCOUNT_ID,
    {
      maxConcurrency: 3,
      dynamicBatching: true,
      initialBatchSize: 15,
      memoryThreshold: 256 * 1024 * 1024 // 256MB
    }
  );

  // Set up event listeners
  processor.on('processing-started', data => {
    console.log(
      `🚀 Started batch processing: ${data.totalItems} items across ${data.totalQueues} queues`
    );
  });

  processor.on('progress', progress => {
    console.log(
      `📊 Progress: ${progress.percentage}% - ${progress.processedItems}/${progress.totalItems} items`
    );
    if (progress.eta) {
      console.log(`⏰ ETA: ${progress.eta.toLocaleTimeString()}`);
    }
  });

  processor.on('batch-size-adjusted', data => {
    console.log(`⚙️  Batch size adjusted to ${data.newSize} (${data.reason})`);
  });

  processor.on('memory-warning', data => {
    console.log(
      `⚠️  Memory warning: ${Math.round(data.current / 1024 / 1024)}MB / ${Math.round(data.threshold / 1024 / 1024)}MB`
    );
  });

  processor.on('processing-completed', data => {
    console.log(`🎉 Processing completed in ${Math.round(data.totalTime / 1000)}s`);
    console.log(`📊 Final stats: ${data.succeededItems} succeeded, ${data.failedItems} failed`);
  });

  try {
    // Try to resume from previous state
    const resumed = await processor.loadState();
    if (resumed) {
      console.log('📂 Resumed from previous state');
    }

    // Initialize service manager and get resources
    const serviceManager = new ServiceManager(
      process.env.CLOUDFLARE_API_TOKEN,
      process.env.CLOUDFLARE_ACCOUNT_ID
    );

    const resources = await serviceManager.listAllResources();
    console.log(`📋 Found ${resources.pages.length} Pages projects to analyze`);

    // Create processing queues for each project
    let totalDeployments = 0;

    for (const project of resources.pages) {
      try {
        const deployments = await serviceManager.listDeployments('pages', project.name);

        // Filter old preview deployments
        const oldPreviews = deployments.filter(deployment => {
          const age = Math.floor(
            (Date.now() - new Date(deployment.created_on)) / (1000 * 60 * 60 * 24)
          );
          return deployment.environment === 'preview' && age > 14;
        });

        if (oldPreviews.length > 0) {
          const batchCount = processor.createQueue(
            `pages-${project.name}`,
            oldPreviews,
            1 // Priority: 1 for regular cleanup
          );

          totalDeployments += oldPreviews.length;
          console.log(
            `📦 Queued ${oldPreviews.length} deployments from ${project.name} (${batchCount} batches)`
          );
        }
      } catch (error) {
        console.error(`❌ Failed to analyze project ${project.name}: ${error.message}`);
      }
    }

    processor.state.totalItems = totalDeployments;

    if (totalDeployments === 0) {
      console.log('✨ No deployments found for cleanup');
      return;
    }

    // Start batch processing
    await processor.processAllQueues();
  } catch (error) {
    console.error('❌ Batch processing failed:', error.message);
    throw error;
  }
}

// Example 2: Mixed workload with priority queuing
export async function mixedWorkloadExample() {
  const processor = new CloudflareBatchProcessor(
    process.env.CLOUDFLARE_API_TOKEN,
    process.env.CLOUDFLARE_ACCOUNT_ID,
    {
      maxConcurrency: 2,
      rateLimit: { requests: 50, window: 60000 } // More conservative rate limiting
    }
  );

  // Setup comprehensive monitoring
  setupProcessorMonitoring(processor);

  try {
    const serviceManager = new ServiceManager(
      process.env.CLOUDFLARE_API_TOKEN,
      process.env.CLOUDFLARE_ACCOUNT_ID
    );

    const resources = await serviceManager.listAllResources();

    // High priority: Emergency cleanup (very old deployments)
    let emergencyCount = 0;

    // Normal priority: Regular cleanup
    let regularCount = 0;

    // Process Pages projects
    for (const project of resources.pages) {
      const deployments = await serviceManager.listDeployments('pages', project.name);

      // Emergency cleanup: deployments older than 90 days
      const emergency = deployments.filter(d => {
        const age = Math.floor((Date.now() - new Date(d.created_on)) / (1000 * 60 * 60 * 24));
        return d.environment === 'preview' && age > 90;
      });

      // Regular cleanup: deployments 14-90 days old
      const regular = deployments.filter(d => {
        const age = Math.floor((Date.now() - new Date(d.created_on)) / (1000 * 60 * 60 * 24));
        return d.environment === 'preview' && age > 14 && age <= 90;
      });

      if (emergency.length > 0) {
        processor.createQueue(`pages-${project.name}-emergency`, emergency, 10); // High priority
        emergencyCount += emergency.length;
      }

      if (regular.length > 0) {
        processor.createQueue(`pages-${project.name}-regular`, regular, 5); // Normal priority
        regularCount += regular.length;
      }
    }

    // Low priority: Workers cleanup
    if (resources.workers.length > 0) {
      const testWorkers = resources.workers.filter(worker => {
        const isTest = ['test-', 'demo-', 'temp-'].some(prefix =>
          worker.id.toLowerCase().includes(prefix)
        );
        const age = Math.floor((Date.now() - new Date(worker.created_on)) / (1000 * 60 * 60 * 24));
        return isTest && age > 30;
      });

      if (testWorkers.length > 0) {
        processor.createQueue('workers', testWorkers, 1); // Low priority
      }
    }

    processor.state.totalItems = emergencyCount + regularCount + (resources.workers.length || 0);

    console.log(`📊 Workload breakdown:`);
    console.log(`   Emergency: ${emergencyCount} items (priority 10)`);
    console.log(`   Regular: ${regularCount} items (priority 5)`);
    console.log(`   Workers: ${resources.workers.length} items (priority 1)`);

    await processor.processAllQueues();
  } catch (error) {
    console.error('❌ Mixed workload processing failed:', error.message);
    throw error;
  }
}

function setupProcessorMonitoring(processor) {
  processor.on('processing-started', data => {
    console.log(
      `🚀 Batch processing started: ${data.totalItems} items, ${data.maxConcurrency} workers`
    );
  });

  processor.on('queue-created', data => {
    console.log(
      `📋 Queue created: ${data.name} (${data.totalItems} items, ${data.totalBatches} batches, priority ${data.priority})`
    );
  });

  processor.on('batch-started', data => {
    console.log(
      `🔄 Batch started: ${data.batchId} (${data.itemCount} items, attempt ${data.attempt})`
    );
  });

  processor.on('batch-completed', data => {
    console.log(
      `✅ Batch completed: ${data.batchId} - ${data.result.success} succeeded, ${data.result.failed} failed (${data.processingTime}ms)`
    );
  });

  processor.on('batch-failed', data => {
    console.log(
      `❌ Batch failed: ${data.batchId} - ${data.error} (attempt ${data.attempt}${data.willRetry ? ', will retry' : ', max attempts reached'})`
    );
  });

  processor.on('progress', data => {
    if (data.processedItems % 50 === 0) {
      // Log every 50 items
      console.log(
        `📊 Progress: ${data.percentage}% (${data.processedItems}/${data.totalItems}) - ${data.itemsPerSecond} items/sec`
      );
      if (data.eta) {
        console.log(`⏰ ETA: ${data.eta.toLocaleString()}`);
      }
    }
  });

  processor.on('rate-limit-wait', data => {
    console.log(`⏳ Rate limit reached, waiting ${Math.round(data.waitTime / 1000)}s...`);
  });

  processor.on('processing-completed', data => {
    console.log(`🎉 All queues processed successfully!`);
    console.log(`📊 Final Results:`);
    console.log(`   Total time: ${Math.round(data.totalTime / 1000)}s`);
    console.log(`   Items processed: ${data.totalItems}`);
    console.log(`   Success rate: ${Math.round((data.succeededItems / data.totalItems) * 100)}%`);
    console.log(`   Average speed: ${data.itemsPerSecond} items/sec`);
  });
}

export { CloudflareBatchProcessor };
