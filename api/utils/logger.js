/**
 * Standardized logging utility for the scan pipeline
 * Provides consistent logging format across all scan-related endpoints
 */

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const LOG_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

class Logger {
  constructor(component) {
    this.component = component;
  }

  _log(level, message, data = {}) {
    if (LOG_LEVELS[level] > LOG_LEVEL) return;

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      component: this.component,
      message,
      ...data
    };

    // Format for console output
    const prefix = {
      ERROR: '❌',
      WARN: '⚠️',
      INFO: '📝',
      DEBUG: '🔧'
    }[level] || '📝';

    const baseLog = `${prefix} [${timestamp}] [${this.component}] ${message}`;
    
    if (Object.keys(data).length > 0) {
      console.log(baseLog, data);
    } else {
      console.log(baseLog);
    }

    return logEntry;
  }

  error(message, data = {}) {
    return this._log('ERROR', message, data);
  }

  warn(message, data = {}) {
    return this._log('WARN', message, data);
  }

  info(message, data = {}) {
    return this._log('INFO', message, data);
  }

  debug(message, data = {}) {
    return this._log('DEBUG', message, data);
  }

  // Specialized methods for scan pipeline
  scanStart(scanId, userId, data = {}) {
    return this.info('Scan started', { scanId, userId, ...data });
  }

  scanProgress(scanId, progress, status, data = {}) {
    return this.info('Scan progress update', { scanId, progress, status, ...data });
  }

  scanComplete(scanId, duration, data = {}) {
    return this.info('Scan completed', { scanId, duration, ...data });
  }

  scanError(scanId, error, data = {}) {
    return this.error('Scan error', { scanId, error: error.message, stack: error.stack, ...data });
  }

  apiRequest(method, path, userId, data = {}) {
    return this.info('API request', { method, path, userId, ...data });
  }

  apiResponse(method, path, status, duration, data = {}) {
    return this.info('API response', { method, path, status, duration, ...data });
  }

  dbOperation(operation, table, data = {}) {
    return this.debug('Database operation', { operation, table, ...data });
  }

  externalApi(service, operation, status, data = {}) {
    return this.debug('External API call', { service, operation, status, ...data });
  }
}

// Create logger instances for different components
export const scanLogger = new Logger('SCAN');
export const workerLogger = new Logger('WORKER');
export const analysisLogger = new Logger('ANALYSIS');
export const subscriptionLogger = new Logger('SUBSCRIPTION');
export const apiLogger = new Logger('API');

// Error handling utilities
export class ScanError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = 'ScanError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      stack: this.stack
    };
  }
}

export const ErrorCodes = {
  // Authentication errors
  AUTH_MISSING: 'AUTH_MISSING',
  AUTH_INVALID: 'AUTH_INVALID',
  AUTH_EXPIRED: 'AUTH_EXPIRED',
  
  // Gmail API errors
  GMAIL_TOKEN_INVALID: 'GMAIL_TOKEN_INVALID',
  GMAIL_API_ERROR: 'GMAIL_API_ERROR',
  GMAIL_RATE_LIMIT: 'GMAIL_RATE_LIMIT',
  
  // Database errors
  DB_CONNECTION_ERROR: 'DB_CONNECTION_ERROR',
  DB_QUERY_ERROR: 'DB_QUERY_ERROR',
  DB_CONSTRAINT_ERROR: 'DB_CONSTRAINT_ERROR',
  
  // Scan errors
  SCAN_NOT_FOUND: 'SCAN_NOT_FOUND',
  SCAN_ALREADY_RUNNING: 'SCAN_ALREADY_RUNNING',
  SCAN_TIMEOUT: 'SCAN_TIMEOUT',
  
  // Analysis errors
  ANALYSIS_FAILED: 'ANALYSIS_FAILED',
  GEMINI_API_ERROR: 'GEMINI_API_ERROR',
  GEMINI_RATE_LIMIT: 'GEMINI_RATE_LIMIT',
  
  // Subscription errors
  SUBSCRIPTION_NOT_FOUND: 'SUBSCRIPTION_NOT_FOUND',
  SUBSCRIPTION_INVALID: 'SUBSCRIPTION_INVALID'
};

// Async error handler wrapper
export function withErrorHandling(fn, logger) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ScanError) {
        logger.error(error.message, error.details);
        throw error;
      } else {
        const scanError = new ScanError(
          error.message || 'Unknown error',
          'UNKNOWN_ERROR',
          { originalError: error.name, stack: error.stack }
        );
        logger.error(scanError.message, scanError.details);
        throw scanError;
      }
    }
  };
}

// Rate limiting utilities
export class RateLimiter {
  constructor(maxRequests, windowMs) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = new Map();
  }

  canMakeRequest(key) {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    
    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }
    
    const keyRequests = this.requests.get(key);
    
    // Remove old requests outside the window
    while (keyRequests.length > 0 && keyRequests[0] < windowStart) {
      keyRequests.shift();
    }
    
    if (keyRequests.length >= this.maxRequests) {
      return false;
    }
    
    keyRequests.push(now);
    return true;
  }

  getTimeUntilReset(key) {
    if (!this.requests.has(key)) return 0;
    
    const keyRequests = this.requests.get(key);
    if (keyRequests.length === 0) return 0;
    
    const oldestRequest = keyRequests[0];
    const resetTime = oldestRequest + this.windowMs;
    
    return Math.max(0, resetTime - Date.now());
  }
}

// Create rate limiters for different services
export const gmailRateLimiter = new RateLimiter(250, 60000); // 250 requests per minute
export const geminiRateLimiter = new RateLimiter(60, 60000);  // 60 requests per minute

export default Logger;
