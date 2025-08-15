/**
 * Monitoring and Observability Cleanup Example
 *
 * This example demonstrates comprehensive monitoring and observability:
 * 1. Real-time metrics collection and reporting
 * 2. Integration with monitoring systems (Prometheus, Grafana, DataDog)
 * 3. Custom alerting and notification systems
 * 4. Performance analytics and optimization insights
 * 5. Health checks and system status monitoring
 * 6. Distributed tracing for complex operations
 */

import { ServiceManager } from '../../src/lib/service-manager.js';
import { logger } from '../../src/utils/logger.js';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import { performance } from 'perf_hooks';

/**
 * Comprehensive Monitoring System for Cleanup Operations
 */
export class CloudflareCleanupMonitor extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      metricsInterval: options.metricsInterval || 30000, // 30 seconds
      healthCheckInterval: options.healthCheckInterval || 60000, // 1 minute
      alertThresholds: {
        errorRate: options.errorRateThreshold || 0.1, // 10%
        avgResponseTime: options.responseTimeThreshold || 5000, // 5 seconds
        memoryUsage: options.memoryThreshold || 512 * 1024 * 1024, // 512MB
        apiRateLimit: options.apiRateLimitThreshold || 0.8 // 80% of rate limit
      },
      integrations: {
        prometheus: options.prometheus || false,
        datadog: options.datadog || false,
        webhook: options.webhookUrl || null,
        logFile: options.logFile || './cleanup-metrics.jsonl'
      },
      ...options
    };

    this.metrics = {
      // System metrics
      startTime: Date.now(),
      uptime: 0,
      memoryUsage: { heapUsed: 0, heapTotal: 0, external: 0 },
      cpuUsage: { user: 0, system: 0 },

      // Operation metrics
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      operationDurations: [],
      apiCalls: {
        total: 0,
        successful: 0,
        failed: 0,
        rateLimitHits: 0,
        averageResponseTime: 0,
        responseTimeHistory: []
      },

      // Cleanup metrics
      itemsProcessed: 0,
      itemsDeleted: 0,
      itemsFailed: 0,
      projectsProcessed: 0,
      batchesProcessed: 0,

      // Error tracking
      errors: [],
      errorsByType: new Map(),
      errorsByProject: new Map(),

      // Performance metrics
      throughput: 0,
      efficiency: 0,
      resourceUtilization: 0
    };

    this.alertState = {
      errorRateAlert: false,
      responseTimeAlert: false,
      memoryAlert: false,
      rateLimitAlert: false
    };

    this.traces = new Map(); // For distributed tracing

    this.startMetricsCollection();
    this.startHealthChecks();
  }

  /**
   * Start collecting metrics at regular intervals
   */
  startMetricsCollection() {
    this.metricsInterval = setInterval(() => {
      this.collectSystemMetrics();
      this.calculatePerformanceMetrics();
      this.checkAlertConditions();
      this.emitMetrics();
      this.logMetrics();
    }, this.options.metricsInterval);
  }

  /**
   * Start health check monitoring
   */
  startHealthChecks() {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const healthStatus = await this.performHealthCheck();
        this.emit('health-check', healthStatus);
      } catch (error) {
        this.emit('health-check-failed', { error: error.message });
        logger.error('Health check failed', { error: error.message });
      }
    }, this.options.healthCheckInterval);
  }

  /**
   * Collect system-level metrics
   */
  collectSystemMetrics() {
    // Update uptime
    this.metrics.uptime = Date.now() - this.metrics.startTime;

    // Memory usage
    const memUsage = process.memoryUsage();
    this.metrics.memoryUsage = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss
    };

    // CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    this.metrics.cpuUsage = {
      user: cpuUsage.user,
      system: cpuUsage.system
    };
  }

  /**
   * Calculate performance and efficiency metrics
   */
  calculatePerformanceMetrics() {
    // Calculate throughput (items per second)
    if (this.metrics.uptime > 0) {
      this.metrics.throughput = this.metrics.itemsProcessed / (this.metrics.uptime / 1000);
    }

    // Calculate efficiency (success rate)
    if (this.metrics.totalOperations > 0) {
      this.metrics.efficiency = this.metrics.successfulOperations / this.metrics.totalOperations;
    }

    // Calculate average API response time
    if (this.metrics.apiCalls.responseTimeHistory.length > 0) {
      const recent = this.metrics.apiCalls.responseTimeHistory.slice(-100); // Last 100 calls
      this.metrics.apiCalls.averageResponseTime =
        recent.reduce((sum, time) => sum + time, 0) / recent.length;
    }

    // Calculate resource utilization
    this.metrics.resourceUtilization = Math.min(
      this.metrics.memoryUsage.heapUsed / this.metrics.memoryUsage.heapTotal,
      1.0
    );
  }

  /**
   * Check alert conditions and trigger notifications
   */
  checkAlertConditions() {
    const thresholds = this.options.alertThresholds;

    // Error rate alert
    const errorRate =
      this.metrics.totalOperations > 0
        ? this.metrics.failedOperations / this.metrics.totalOperations
        : 0;

    if (errorRate > thresholds.errorRate && !this.alertState.errorRateAlert) {
      this.alertState.errorRateAlert = true;
      this.triggerAlert('error_rate_high', {
        currentRate: errorRate,
        threshold: thresholds.errorRate,
        totalOperations: this.metrics.totalOperations,
        failedOperations: this.metrics.failedOperations
      });
    } else if (errorRate <= thresholds.errorRate * 0.8) {
      this.alertState.errorRateAlert = false;
    }

    // Response time alert
    if (
      this.metrics.apiCalls.averageResponseTime > thresholds.avgResponseTime &&
      !this.alertState.responseTimeAlert
    ) {
      this.alertState.responseTimeAlert = true;
      this.triggerAlert('response_time_high', {
        currentTime: this.metrics.apiCalls.averageResponseTime,
        threshold: thresholds.avgResponseTime
      });
    } else if (this.metrics.apiCalls.averageResponseTime <= thresholds.avgResponseTime * 0.8) {
      this.alertState.responseTimeAlert = false;
    }

    // Memory usage alert
    if (
      this.metrics.memoryUsage.heapUsed > thresholds.memoryUsage &&
      !this.alertState.memoryAlert
    ) {
      this.alertState.memoryAlert = true;
      this.triggerAlert('memory_usage_high', {
        currentUsage: this.metrics.memoryUsage.heapUsed,
        threshold: thresholds.memoryUsage,
        utilization: this.metrics.resourceUtilization
      });
    } else if (this.metrics.memoryUsage.heapUsed <= thresholds.memoryUsage * 0.8) {
      this.alertState.memoryAlert = false;
    }
  }

  /**
   * Trigger alert notifications
   */
  async triggerAlert(type, data) {
    const alert = {
      type,
      severity: this.getAlertSeverity(type),
      timestamp: new Date().toISOString(),
      data,
      metrics: this.getAlertRelevantMetrics(type)
    };

    this.emit('alert', alert);

    // Send to integrations
    if (this.options.integrations.webhook) {
      await this.sendWebhookAlert(alert);
    }

    // Log alert
    logger.warn(`Alert triggered: ${type}`, alert);
  }

  getAlertSeverity(type) {
    const severityMap = {
      error_rate_high: 'critical',
      response_time_high: 'warning',
      memory_usage_high: 'warning',
      api_rate_limit_hit: 'critical',
      health_check_failed: 'critical'
    };
    return severityMap[type] || 'info';
  }

  getAlertRelevantMetrics(type) {
    switch (type) {
      case 'error_rate_high':
        return {
          totalOperations: this.metrics.totalOperations,
          failedOperations: this.metrics.failedOperations,
          recentErrors: this.metrics.errors.slice(-5)
        };
      case 'response_time_high':
        return {
          averageResponseTime: this.metrics.apiCalls.averageResponseTime,
          recentResponseTimes: this.metrics.apiCalls.responseTimeHistory.slice(-10)
        };
      case 'memory_usage_high':
        return this.metrics.memoryUsage;
      default:
        return {};
    }
  }

  /**
   * Send webhook alert notification
   */
  async sendWebhookAlert(alert) {
    try {
      const response = await fetch(this.options.integrations.webhook, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'CloudflareCleanupMonitor/1.0'
        },
        body: JSON.stringify({
          text: `🚨 Cloudflare Cleanup Alert: ${alert.type}`,
          alert,
          timestamp: alert.timestamp
        })
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      logger.error('Failed to send webhook alert', { error: error.message, alert });
    }
  }

  /**
   * Perform comprehensive health check
   */
  async performHealthCheck() {
    const healthCheck = {
      timestamp: new Date().toISOString(),
      uptime: this.metrics.uptime,
      status: 'healthy',
      checks: {
        memory: 'pass',
        api: 'pass',
        performance: 'pass',
        errors: 'pass'
      },
      metrics: {
        memoryUsageMB: Math.round(this.metrics.memoryUsage.heapUsed / 1024 / 1024),
        throughput: this.metrics.throughput,
        errorRate:
          this.metrics.totalOperations > 0
            ? this.metrics.failedOperations / this.metrics.totalOperations
            : 0,
        avgResponseTime: this.metrics.apiCalls.averageResponseTime
      }
    };

    // Check memory usage
    if (this.metrics.memoryUsage.heapUsed > this.options.alertThresholds.memoryUsage) {
      healthCheck.checks.memory = 'warning';
      healthCheck.status = 'degraded';
    }

    // Check error rate
    const errorRate = healthCheck.metrics.errorRate;
    if (errorRate > this.options.alertThresholds.errorRate) {
      healthCheck.checks.errors = 'fail';
      healthCheck.status = 'unhealthy';
    }

    // Check performance
    if (this.metrics.apiCalls.averageResponseTime > this.options.alertThresholds.avgResponseTime) {
      healthCheck.checks.performance = 'warning';
      if (healthCheck.status === 'healthy') {
        healthCheck.status = 'degraded';
      }
    }

    return healthCheck;
  }

  /**
   * Start tracing for an operation
   */
  startTrace(operationId, type, metadata = {}) {
    const trace = {
      id: operationId,
      type,
      startTime: performance.now(),
      startTimestamp: Date.now(),
      metadata,
      spans: [],
      status: 'started'
    };

    this.traces.set(operationId, trace);

    this.emit('trace-started', {
      operationId,
      type,
      timestamp: trace.startTimestamp
    });

    return trace;
  }

  /**
   * Add span to existing trace
   */
  addSpan(operationId, name, data = {}) {
    const trace = this.traces.get(operationId);
    if (!trace) return;

    const span = {
      name,
      startTime: performance.now(),
      timestamp: Date.now(),
      data,
      duration: null
    };

    trace.spans.push(span);
    return span;
  }

  /**
   * Finish span with duration and result
   */
  finishSpan(operationId, span, result = {}) {
    if (!span) return;

    span.duration = performance.now() - span.startTime;
    span.result = result;
    span.endTimestamp = Date.now();
  }

  /**
   * Finish trace with final metrics
   */
  finishTrace(operationId, result = {}) {
    const trace = this.traces.get(operationId);
    if (!trace) return;

    trace.duration = performance.now() - trace.startTime;
    trace.endTimestamp = Date.now();
    trace.result = result;
    trace.status = result.success ? 'completed' : 'failed';

    // Update metrics
    this.metrics.totalOperations++;
    this.metrics.operationDurations.push(trace.duration);

    if (result.success) {
      this.metrics.successfulOperations++;
    } else {
      this.metrics.failedOperations++;
      if (result.error) {
        this.recordError(result.error, operationId, trace.type);
      }
    }

    this.emit('trace-completed', {
      operationId,
      type: trace.type,
      duration: trace.duration,
      success: result.success,
      spans: trace.spans.length
    });

    // Clean up old traces (keep last 100)
    if (this.traces.size > 100) {
      const oldestKey = this.traces.keys().next().value;
      this.traces.delete(oldestKey);
    }

    return trace;
  }

  /**
   * Record API call metrics
   */
  recordApiCall(duration, success = true, rateLimited = false) {
    this.metrics.apiCalls.total++;
    this.metrics.apiCalls.responseTimeHistory.push(duration);

    // Keep only recent response times
    if (this.metrics.apiCalls.responseTimeHistory.length > 1000) {
      this.metrics.apiCalls.responseTimeHistory =
        this.metrics.apiCalls.responseTimeHistory.slice(-500);
    }

    if (success) {
      this.metrics.apiCalls.successful++;
    } else {
      this.metrics.apiCalls.failed++;
    }

    if (rateLimited) {
      this.metrics.apiCalls.rateLimitHits++;
      this.triggerAlert('api_rate_limit_hit', {
        totalCalls: this.metrics.apiCalls.total,
        rateLimitHits: this.metrics.apiCalls.rateLimitHits
      });
    }
  }

  /**
   * Record error with categorization
   */
  recordError(error, operationId = null, type = null) {
    const errorRecord = {
      message: error.message || error,
      type: error.constructor.name || 'Error',
      timestamp: Date.now(),
      operationId,
      operationType: type,
      stack: error.stack
    };

    this.metrics.errors.push(errorRecord);

    // Categorize errors
    const errorType = errorRecord.type;
    const currentCount = this.metrics.errorsByType.get(errorType) || 0;
    this.metrics.errorsByType.set(errorType, currentCount + 1);

    // Keep only recent errors
    if (this.metrics.errors.length > 1000) {
      this.metrics.errors = this.metrics.errors.slice(-500);
    }

    this.emit('error-recorded', errorRecord);
  }

  /**
   * Record cleanup metrics
   */
  recordCleanup(items) {
    if (typeof items === 'number') {
      this.metrics.itemsProcessed += items;
    } else if (typeof items === 'object') {
      this.metrics.itemsProcessed += items.total || 0;
      this.metrics.itemsDeleted += items.deleted || 0;
      this.metrics.itemsFailed += items.failed || 0;
    }
  }

  /**
   * Emit current metrics
   */
  emitMetrics() {
    const snapshot = {
      timestamp: Date.now(),
      system: {
        uptime: this.metrics.uptime,
        memoryUsage: this.metrics.memoryUsage,
        cpuUsage: this.metrics.cpuUsage
      },
      operations: {
        total: this.metrics.totalOperations,
        successful: this.metrics.successfulOperations,
        failed: this.metrics.failedOperations,
        throughput: this.metrics.throughput,
        efficiency: this.metrics.efficiency
      },
      api: {
        totalCalls: this.metrics.apiCalls.total,
        successfulCalls: this.metrics.apiCalls.successful,
        failedCalls: this.metrics.apiCalls.failed,
        averageResponseTime: this.metrics.apiCalls.averageResponseTime,
        rateLimitHits: this.metrics.apiCalls.rateLimitHits
      },
      cleanup: {
        itemsProcessed: this.metrics.itemsProcessed,
        itemsDeleted: this.metrics.itemsDeleted,
        itemsFailed: this.metrics.itemsFailed,
        projectsProcessed: this.metrics.projectsProcessed,
        batchesProcessed: this.metrics.batchesProcessed
      }
    };

    this.emit('metrics', snapshot);
    return snapshot;
  }

  /**
   * Log metrics to file
   */
  async logMetrics() {
    if (!this.options.integrations.logFile) return;

    try {
      const metricsSnapshot = this.emitMetrics();
      const logLine = JSON.stringify(metricsSnapshot) + '\n';

      await fs.appendFile(this.options.integrations.logFile, logLine);
    } catch (error) {
      logger.warn('Failed to write metrics to log file', { error: error.message });
    }
  }

  /**
   * Get comprehensive metrics report
   */
  getMetricsReport() {
    const now = Date.now();
    const uptimeMinutes = Math.round(this.metrics.uptime / 60000);

    return {
      summary: {
        uptime: `${Math.floor(uptimeMinutes / 60)}h ${uptimeMinutes % 60}m`,
        totalOperations: this.metrics.totalOperations,
        successRate: this.metrics.efficiency * 100,
        throughput: this.metrics.throughput,
        avgResponseTime: this.metrics.apiCalls.averageResponseTime
      },
      performance: {
        memoryUsageMB: Math.round(this.metrics.memoryUsage.heapUsed / 1024 / 1024),
        resourceUtilization: this.metrics.resourceUtilization * 100,
        apiCalls: {
          total: this.metrics.apiCalls.total,
          successful: this.metrics.apiCalls.successful,
          failed: this.metrics.apiCalls.failed,
          rateLimitHits: this.metrics.apiCalls.rateLimitHits
        }
      },
      cleanup: {
        itemsProcessed: this.metrics.itemsProcessed,
        itemsDeleted: this.metrics.itemsDeleted,
        itemsFailed: this.metrics.itemsFailed,
        projects: this.metrics.projectsProcessed,
        batches: this.metrics.batchesProcessed
      },
      errors: {
        total: this.metrics.errors.length,
        byType: Object.fromEntries(this.metrics.errorsByType),
        recent: this.metrics.errors.slice(-5).map(e => ({
          type: e.type,
          message: e.message,
          timestamp: new Date(e.timestamp).toISOString()
        }))
      },
      traces: {
        active: this.traces.size,
        avgDuration:
          this.metrics.operationDurations.length > 0
            ? this.metrics.operationDurations.reduce((sum, d) => sum + d, 0) /
              this.metrics.operationDurations.length
            : 0
      }
    };
  }

  /**
   * Clean up monitoring resources
   */
  cleanup() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.traces.clear();
    this.removeAllListeners();
  }
}

/**
 * Example usage with comprehensive monitoring
 */
export async function monitoredCleanupExample() {
  const monitor = new CloudflareCleanupMonitor({
    metricsInterval: 10000, // 10 seconds for demo
    healthCheckInterval: 30000, // 30 seconds
    errorRateThreshold: 0.15, // 15%
    responseTimeThreshold: 3000, // 3 seconds
    webhookUrl: process.env.SLACK_WEBHOOK_URL,
    logFile: './cleanup-monitoring.jsonl'
  });

  // Setup comprehensive event monitoring
  monitor.on('metrics', metrics => {
    console.log(`📊 Metrics Update:`);
    console.log(
      `   Operations: ${metrics.operations.total} (${Math.round(metrics.operations.efficiency * 100)}% success)`
    );
    console.log(
      `   Throughput: ${Math.round(metrics.operations.throughput * 100) / 100} items/sec`
    );
    console.log(`   Memory: ${Math.round(metrics.system.memoryUsage.heapUsed / 1024 / 1024)}MB`);
    console.log(`   API Avg Response: ${Math.round(metrics.api.averageResponseTime)}ms`);
  });

  monitor.on('alert', alert => {
    console.log(`🚨 ALERT [${alert.severity.toUpperCase()}]: ${alert.type}`);
    console.log(`   ${JSON.stringify(alert.data, null, 2)}`);
  });

  monitor.on('health-check', health => {
    console.log(`💗 Health Check: ${health.status}`);
    if (health.status !== 'healthy') {
      console.log(
        `   Issues: ${Object.entries(health.checks)
          .filter(([_, status]) => status !== 'pass')
          .map(([check, status]) => `${check}: ${status}`)
          .join(', ')}`
      );
    }
  });

  monitor.on('trace-completed', trace => {
    console.log(
      `🔍 Trace: ${trace.operationId} (${trace.type}) completed in ${Math.round(trace.duration)}ms`
    );
  });

  try {
    console.log('🚀 Starting monitored cleanup operation...\n');

    const serviceManager = new ServiceManager(
      process.env.CLOUDFLARE_API_TOKEN,
      process.env.CLOUDFLARE_ACCOUNT_ID
    );

    // Main cleanup operation with tracing
    const mainTrace = monitor.startTrace('main-cleanup', 'cleanup-operation', {
      apiToken: '***hidden***',
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID
    });

    // Connection validation with monitoring
    const validateSpan = monitor.addSpan('main-cleanup', 'validate-connection');
    const startTime = performance.now();

    const connectionStatus = await serviceManager.validateConnections();
    const apiCallDuration = performance.now() - startTime;

    monitor.recordApiCall(apiCallDuration, connectionStatus.overall);
    monitor.finishSpan('main-cleanup', validateSpan, { success: connectionStatus.overall });

    if (!connectionStatus.overall) {
      throw new Error('Connection validation failed');
    }

    // Get resources with monitoring
    const resourceSpan = monitor.addSpan('main-cleanup', 'fetch-resources');
    const resourceStartTime = performance.now();

    const resources = await serviceManager.listAllResources();
    const resourceDuration = performance.now() - resourceStartTime;

    monitor.recordApiCall(resourceDuration, true);
    monitor.finishSpan('main-cleanup', resourceSpan, {
      success: true,
      pagesCount: resources.pages.length,
      workersCount: resources.workers.length
    });

    console.log(
      `📋 Found ${resources.pages.length} Pages projects, ${resources.workers.length} Workers scripts\n`
    );

    // Process each project with detailed monitoring
    for (const [index, project] of resources.pages.entries()) {
      const projectTrace = monitor.startTrace(`project-${project.name}`, 'project-cleanup', {
        projectName: project.name,
        index: index + 1,
        total: resources.pages.length
      });

      try {
        console.log(`📦 [${index + 1}/${resources.pages.length}] Processing: ${project.name}`);

        // Get deployments
        const deploymentsSpan = monitor.addSpan(`project-${project.name}`, 'fetch-deployments');
        const deployStartTime = performance.now();

        const deployments = await serviceManager.listDeployments('pages', project.name);
        const deployDuration = performance.now() - deployStartTime;

        monitor.recordApiCall(deployDuration, true);
        monitor.finishSpan(`project-${project.name}`, deploymentsSpan, {
          success: true,
          deploymentCount: deployments.length
        });

        // Filter old deployments
        const oldDeployments = deployments.filter(deployment => {
          const age = Math.floor(
            (Date.now() - new Date(deployment.created_on)) / (1000 * 60 * 60 * 24)
          );
          return deployment.environment === 'preview' && age > 14;
        });

        if (oldDeployments.length === 0) {
          console.log(`   ✨ No old deployments to clean up`);
          monitor.finishTrace(`project-${project.name}`, { success: true, cleaned: 0 });
          continue;
        }

        console.log(`   🧹 Cleaning up ${oldDeployments.length} old deployment(s)...`);

        // Perform cleanup with monitoring
        const cleanupSpan = monitor.addSpan(`project-${project.name}`, 'cleanup-deployments');
        const cleanupStartTime = performance.now();

        const result = await serviceManager.bulkDeleteDeployments(
          'pages',
          project.name,
          oldDeployments,
          {
            dryRun: false,
            batchSize: 10,
            skipProduction: true
          }
        );

        const cleanupDuration = performance.now() - cleanupStartTime;
        monitor.recordApiCall(cleanupDuration, result.success > 0 || result.failed === 0);
        monitor.finishSpan(`project-${project.name}`, cleanupSpan, {
          success: result.failed === 0,
          cleaned: result.success,
          failed: result.failed
        });

        // Update monitoring metrics
        monitor.recordCleanup({
          total: oldDeployments.length,
          deleted: result.success,
          failed: result.failed
        });
        monitor.metrics.projectsProcessed++;

        console.log(`   ✅ Completed: ${result.success} cleaned, ${result.failed} failed`);

        monitor.finishTrace(`project-${project.name}`, {
          success: result.failed === 0,
          cleaned: result.success,
          failed: result.failed
        });
      } catch (error) {
        console.error(`   ❌ Project failed: ${error.message}`);
        monitor.recordError(error, `project-${project.name}`, 'project-cleanup');
        monitor.finishTrace(`project-${project.name}`, {
          success: false,
          error: error.message
        });
      }

      // Small delay between projects
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    monitor.finishTrace('main-cleanup', {
      success: true,
      projectsProcessed: resources.pages.length
    });

    // Final monitoring report
    console.log('\n📊 Final Monitoring Report:');
    const report = monitor.getMetricsReport();
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    console.error('❌ Monitored cleanup failed:', error.message);
    monitor.recordError(error, 'main-cleanup', 'cleanup-operation');
    monitor.finishTrace('main-cleanup', {
      success: false,
      error: error.message
    });
    throw error;
  } finally {
    // Cleanup monitoring resources
    setTimeout(() => {
      monitor.cleanup();
    }, 5000); // Allow time for final metrics
  }
}

export { CloudflareCleanupMonitor };
