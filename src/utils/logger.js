import winston from 'winston';
import { config } from '../config/config.js';

/**
 * Setup Winston logger with environment-based configuration
 */
const createLogger = () => {
  const transports = [];

  // Console transport with user-friendly format
  transports.push(
    new winston.transports.Console({
      level: config.logging.level,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
          const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          const stackStr = stack ? `\n${stack}` : '';
          return `[${timestamp}] ${level.toUpperCase()}: ${message}${metaStr}${stackStr}`;
        })
      )
    })
  );

  // File transport if enabled
  if (config.logging.file.enabled) {
    transports.push(
      new winston.transports.File({
        filename: config.logging.file.path,
        level: config.logging.level,
        format: winston.format.combine(
          winston.format.timestamp(),
          winston.format.errors({ stack: true }),
          winston.format.json()
        )
      })
    );
  }

  return winston.createLogger({
    level: config.logging.level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    ),
    transports,
    // Handle uncaught exceptions and promise rejections
    exceptionHandlers: [
      new winston.transports.Console({
        format: winston.format.simple()
      })
    ],
    rejectionHandlers: [
      new winston.transports.Console({
        format: winston.format.simple()
      })
    ]
  });
};

// Create logger instance
export const logger = createLogger();

/**
 * Wrapper functions for consistent logging API
 */
export const log = {
  error: (message, ...args) => logger.error(message, ...args),
  warn: (message, ...args) => logger.warn(message, ...args),
  info: (message, ...args) => logger.info(message, ...args),
  debug: (message, ...args) => logger.debug(message, ...args),
  verbose: (message, ...args) => logger.verbose(message, ...args)
};

/**
 * Progress logger for bulk operations
 */
export class ProgressLogger {
  constructor(total, operation = 'Processing') {
    this.total = total;
    this.current = 0;
    this.operation = operation;
    this.startTime = Date.now();
    this.errors = [];
  }

  increment(item = null, error = null) {
    this.current++;

    if (error) {
      this.errors.push({ item, error: error.message });
      logger.warn(`${this.operation} error for ${item}:`, error.message);
    }

    // Log progress every 10% or every 10 items
    const shouldLog =
      this.current % 10 === 0 ||
      this.current / this.total >= (Math.floor(((this.current - 1) / this.total) * 10) + 1) / 10;

    if (shouldLog || this.current === this.total) {
      const percentage = Math.round((this.current / this.total) * 100);
      const elapsed = Date.now() - this.startTime;
      const rate = this.current / (elapsed / 1000);
      const eta = this.current < this.total ? (this.total - this.current) / rate : 0;

      logger.info(
        `${this.operation} progress: ${this.current}/${this.total} (${percentage}%) - ${rate.toFixed(1)}/s - ETA: ${Math.round(eta)}s`
      );
    }
  }

  complete() {
    const elapsed = Date.now() - this.startTime;
    const rate = this.current / (elapsed / 1000);

    logger.info(
      `${this.operation} completed: ${this.current} items processed in ${(elapsed / 1000).toFixed(1)}s (${rate.toFixed(1)}/s)`
    );

    if (this.errors.length > 0) {
      logger.warn(`${this.errors.length} errors occurred during ${this.operation.toLowerCase()}`);
      this.errors.forEach(({ item, error }, index) => {
        logger.error(`Error ${index + 1}: ${item} - ${error}`);
      });
    }

    return {
      total: this.total,
      processed: this.current,
      errors: this.errors.length,
      duration: elapsed,
      rate
    };
  }
}

// Default export
export default logger;
