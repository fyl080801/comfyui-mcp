/**
 * Enhanced HTTP Client with Robust Error Handling
 *
 * Features:
 * - Automatic retry with exponential backoff
 * - Comprehensive error handling and classification
 * - Circuit breaker pattern
 * - Request timeout management
 * - SSL/TLS error recovery
 */

import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosError } from 'axios'
import { HttpsProxyAgent } from 'https-proxy-agent'
import https from 'https'
import type { AgentOptions } from 'https'

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
const DEFAULT_TIMEOUT = 30000
const MAX_RETRIES = 3
const INITIAL_RETRY_DELAY = 1000

function parseBoolean(value: string | undefined, defaultValue: boolean = false): boolean {
  if (value === undefined || value === '') return defaultValue
  return ['true', '1', 'yes', 'on'].includes(value.toLowerCase())
}

const DISABLE_SSL_VERIFY = parseBoolean(
  process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ? 'true' : process.env.DISABLE_SSL_VERIFY,
  false,
)

// ============================================================================
// Error Types Classification
// ============================================================================

export enum HttpErrorType {
  NETWORK = 'NETWORK',
  TIMEOUT = 'TIMEOUT',
  SSL_TLS = 'SSL_TLS',
  DNS = 'DNS',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  SERVER_ERROR = 'SERVER_ERROR',
  CLIENT_ERROR = 'CLIENT_ERROR',
  UNKNOWN = 'UNKNOWN',
}

export interface EnhancedHttpError extends Error {
  type: HttpErrorType
  statusCode?: number
  originalError?: any
  isRetryable: boolean
  url?: string
}

/**
 * Classify error type and determine if it's retryable
 */
function classifyError(error: any, url?: string): EnhancedHttpError {
  const axiosError = error as AxiosError

  // Network errors
  if (error.code === 'ECONNRESET') {
    return {
      name: 'HttpError',
      message: `Connection reset by server at ${url}. The server closed the connection unexpectedly.`,
      type: HttpErrorType.NETWORK,
      originalError: error,
      isRetryable: true,
      url,
    } as EnhancedHttpError
  }

  if (error.code === 'ENOTFOUND') {
    return {
      name: 'HttpError',
      message: `DNS lookup failed for ${url}. Check if the hostname is correct.`,
      type: HttpErrorType.DNS,
      originalError: error,
      isRetryable: false,
      url,
    } as EnhancedHttpError
  }

  if (error.code === 'ECONNREFUSED') {
    return {
      name: 'HttpError',
      message: `Connection refused at ${url}. Server is not accepting connections.`,
      type: HttpErrorType.CONNECTION_REFUSED,
      originalError: error,
      isRetryable: true,
      url,
    } as EnhancedHttpError
  }

  // SSL/TLS errors
  if (
    error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
    error.code === 'CERT_HAS_EXPIRED' ||
    error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
    error.code === 'SELF_SIGNED_CERT_IN_CHAIN'
  ) {
    return {
      name: 'HttpError',
      message: `SSL/TLS certificate error for ${url}: ${error.code}. Consider setting DISABLE_SSL_VERIFY=true for testing (not for production).`,
      type: HttpErrorType.SSL_TLS,
      originalError: error,
      isRetryable: false,
      url,
    } as EnhancedHttpError
  }

  // Timeout errors
  if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
    return {
      name: 'HttpError',
      message: `Request timeout for ${url}. Server took too long to respond.`,
      type: HttpErrorType.TIMEOUT,
      originalError: error,
      isRetryable: true,
      url,
    } as EnhancedHttpError
  }

  // HTTP errors
  if (axiosError.response) {
    const status = axiosError.response.status
    const isServerError = status >= 500
    const isClientError = status >= 400 && status < 500

    return {
      name: 'HttpError',
      message: `HTTP ${status} error for ${url}: ${axiosError.response.statusText}`,
      type: isServerError ? HttpErrorType.SERVER_ERROR : HttpErrorType.CLIENT_ERROR,
      statusCode: status,
      originalError: error,
      isRetryable: isServerError && status !== 501, // Don't retry 501 Not Implemented
      url,
    } as EnhancedHttpError
  }

  // Unknown error
  return {
    name: 'HttpError',
    message: `Unknown error for ${url}: ${error.message}`,
    type: HttpErrorType.UNKNOWN,
    originalError: error,
    isRetryable: false,
    url,
  } as EnhancedHttpError
}

// ============================================================================
// Retry Logic with Exponential Backoff
// ============================================================================

interface RetryConfig {
  maxRetries?: number
  initialDelay?: number
  maxDelay?: number
  backoffMultiplier?: number
  retryableStatuses?: number[]
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const { initialDelay = INITIAL_RETRY_DELAY, maxDelay = 30000, backoffMultiplier = 2 } = config
  const exponentialDelay = initialDelay * Math.pow(backoffMultiplier, attempt)
  const delay = Math.min(exponentialDelay, maxDelay)
  // Add jitter (±25%)
  const jitter = delay * 0.25 * (Math.random() * 2 - 1)
  return Math.floor(delay + jitter)
}

/**
 * Execute request with automatic retry
 */
async function executeWithRetry<T>(
  requestFn: () => Promise<T>,
  url: string,
  config: RetryConfig = {},
): Promise<T> {
  const { maxRetries = MAX_RETRIES } = config
  let lastError: EnhancedHttpError

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await requestFn()
    } catch (error: any) {
      lastError = classifyError(error, url)

      // Don't retry if error is not retryable
      if (!lastError.isRetryable) {
        throw lastError
      }

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        throw lastError
      }

      const delay = calculateDelay(attempt, config)
      console.warn(
        `[HTTP Retry] Attempt ${attempt + 1}/${maxRetries} failed for ${url}. ` +
          `Retrying in ${delay}ms... Error: ${lastError.message}`,
      )

      await sleep(delay)
    }
  }

  throw lastError!
}

// ============================================================================
// Enhanced Axios Client
// ============================================================================

function getProxyAgent(): HttpsProxyAgent<string> | undefined {
  const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy
  const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy

  const proxyUrl = httpsProxy || httpProxy
  if (proxyUrl) {
    try {
      return new HttpsProxyAgent(proxyUrl, {
        rejectUnauthorized: !DISABLE_SSL_VERIFY,
      })
    } catch (error) {
      console.warn(`Failed to create proxy agent for ${proxyUrl}:`, error)
    }
  }
  return undefined
}

function getHttpsAgentOptions(): AgentOptions {
  const options: AgentOptions = {
    keepAlive: true,
    keepAliveMsecs: 30000,
    maxSockets: 100,
    maxFreeSockets: 10,
    timeout: DEFAULT_TIMEOUT,
    rejectUnauthorized: !DISABLE_SSL_VERIFY,
    minVersion: 'TLSv1.2', // Use TLS 1.2+ for security
  }

  if (DISABLE_SSL_VERIFY) {
    console.warn('⚠️  SSL verification is DISABLED. Not recommended for production!')
  }

  return options
}

const proxyAgent = getProxyAgent()
const httpsAgent = new https.Agent(getHttpsAgentOptions())

/**
 * Create enhanced axios instance with error handling
 */
export function createEnhancedAxiosInstance(): AxiosInstance {
  const instance = axios.create({
    timeout: DEFAULT_TIMEOUT,
    headers: {
      'User-Agent': DEFAULT_USER_AGENT,
      Accept: 'application/json, */*',
      Connection: 'keep-alive',
    },
    httpAgent: proxyAgent,
    httpsAgent: proxyAgent || httpsAgent,
    maxRedirects: 5,
    // Don't throw on non-2xx status (handle manually)
    validateStatus: () => true,
  })

  // Request interceptor
  instance.interceptors.request.use(
    (config) => {
      if (process.env.DEBUG_HTTP === 'true') {
        console.log(`[HTTP] → ${config.method?.toUpperCase()} ${config.url}`)
      }
      return config
    },
    (error) => {
      console.error('[HTTP Request Error]', error)
      return Promise.reject(error)
    },
  )

  // Response interceptor
  instance.interceptors.response.use(
    (response) => {
      if (process.env.DEBUG_HTTP === 'true') {
        console.log(`[HTTP] ← ${response.status} ${response.config.url}`)
      }

      // Throw error for non-2xx status codes
      if (response.status < 200 || response.status >= 300) {
        const error: any = new Error(`HTTP ${response.status}: ${response.statusText}`)
        error.response = response
        error.config = response.config
        throw error
      }

      return response
    },
    (error) => {
      if (process.env.DEBUG_HTTP === 'true') {
        console.error(`[HTTP Error] ${error.message}`)
      }
      return Promise.reject(error)
    },
  )

  return instance
}

export const axiosInstance = createEnhancedAxiosInstance()

// ============================================================================
// Public API with Retry Support
// ============================================================================

export interface RequestOptions extends AxiosRequestConfig {
  retry?: RetryConfig
}

/**
 * GET request with automatic retry
 */
export async function get<T = any>(url: string, options: RequestOptions = {}): Promise<T> {
  const { retry, ...axiosConfig } = options

  return executeWithRetry(
    async () => {
      const response = await axiosInstance.get<T>(url, axiosConfig)
      return response.data
    },
    url,
    retry,
  )
}

/**
 * POST request with automatic retry
 */
export async function post<T = any>(
  url: string,
  data?: any,
  options: RequestOptions = {},
): Promise<T> {
  const { retry, ...axiosConfig } = options

  return executeWithRetry(
    async () => {
      const response = await axiosInstance.post<T>(url, data, axiosConfig)
      return response.data
    },
    url,
    retry,
  )
}

/**
 * Generic request with automatic retry
 */
export async function request<T = any>(config: RequestOptions): Promise<T> {
  const { retry, ...axiosConfig } = config
  const url = axiosConfig.url || 'unknown'

  return executeWithRetry(
    async () => {
      const response = await axiosInstance.request<T>(axiosConfig)
      return response.data
    },
    url,
    retry,
  )
}

// ============================================================================
// Usage Examples
// ============================================================================

/**
 * Example 1: Simple GET request with default retry
 */
export async function exampleSimpleGet() {
  try {
    const data = await get('https://api.example.com/data')
    console.log('Success:', data)
  } catch (error: any) {
    const httpError = error as EnhancedHttpError
    console.error(`Failed after retries: ${httpError.message}`)
    console.error(`Error type: ${httpError.type}`)
    console.error(`Is retryable: ${httpError.isRetryable}`)
  }
}

/**
 * Example 2: POST with custom retry configuration
 */
export async function examplePostWithCustomRetry() {
  try {
    const result = await post(
      'https://api.example.com/submit',
      { key: 'value' },
      {
        retry: {
          maxRetries: 5,
          initialDelay: 2000,
          maxDelay: 60000,
        },
        timeout: 15000,
      },
    )
    console.log('Success:', result)
  } catch (error: any) {
    console.error('Failed:', error.message)
  }
}

/**
 * Example 3: Handle specific error types
 */
export async function exampleErrorHandling() {
  try {
    const data = await get('https://api.example.com/data')
    return data
  } catch (error: any) {
    const httpError = error as EnhancedHttpError

    switch (httpError.type) {
      case HttpErrorType.SSL_TLS:
        console.error('SSL Certificate error. Try: DISABLE_SSL_VERIFY=true')
        break
      case HttpErrorType.TIMEOUT:
        console.error('Request timeout. Server is slow or overloaded.')
        break
      case HttpErrorType.DNS:
        console.error('DNS lookup failed. Check hostname.')
        break
      case HttpErrorType.CONNECTION_REFUSED:
        console.error('Connection refused. Check if server is running.')
        break
      case HttpErrorType.SERVER_ERROR:
        console.error(`Server error ${httpError.statusCode}`)
        break
      default:
        console.error('Unknown error:', httpError.message)
    }

    throw httpError
  }
}

/**
 * Example 4: Circuit Breaker Pattern (Advanced)
 */
class CircuitBreaker {
  private failures = 0
  private successThreshold = 2
  private failureThreshold = 5
  private timeout = 60000
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED'
  private nextAttempt = Date.now()

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN')
      }
      this.state = 'HALF_OPEN'
    }

    try {
      const result = await fn()
      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess() {
    this.failures = 0
    if (this.state === 'HALF_OPEN') {
      this.state = 'CLOSED'
    }
  }

  private onFailure() {
    this.failures++
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN'
      this.nextAttempt = Date.now() + this.timeout
      console.warn(`Circuit breaker opened. Will retry after ${this.timeout}ms`)
    }
  }
}

export const circuitBreaker = new CircuitBreaker()

// ============================================================================
// Native fetch API wrapper with enhanced configuration
// ============================================================================

/**
 * fetchWithConfig - Enhanced fetch with automatic configuration
 * Uses native fetch API with our HTTP client configuration
 *
 * @param url - The URL to fetch
 * @param options - Fetch options (supports AbortSignal, headers, etc.)
 * @returns Promise<Response> - Standard fetch Response object
 */
export async function fetchWithConfig(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController()

  // Merge signal if provided
  let signal = options.signal
  if (options.signal) {
    // If the user provided a signal, use it
    signal = options.signal
  } else {
    // Otherwise use our timeout controller
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT)
    signal = controller.signal

    // Clear timeout on completion
    const originalSignal = signal
    signal = {
      ...originalSignal,
      addEventListener: (
        type: string,
        listener: EventListenerOrEventListenerObject,
      ) => {
        if (type === 'abort') {
          const wrappedListener = () => {
            clearTimeout(timeoutId)
            if (typeof listener === 'function') {
              listener.call(null, new Event('abort'))
            } else {
              listener.handleEvent(new Event('abort'))
            }
          }
          return originalSignal.addEventListener?.(type, wrappedListener)
        }
        return originalSignal.addEventListener?.(type, listener)
      },
    } as any
  }

  // Prepare headers with user agent
  const headers: HeadersInit = {
    'User-Agent': DEFAULT_USER_AGENT,
    ...(options.headers || {}),
  }

  // Use native fetch with our configuration
  try {
    const response = await fetch(url, {
      ...options,
      signal,
      headers,
    })

    // Log response if debug mode is enabled
    if (process.env.DEBUG_HTTP === 'true') {
      console.log(`[Fetch] ← ${response.status} ${url}`)
    }

    return response
  } catch (error: any) {
    // Log error if debug mode is enabled
    if (process.env.DEBUG_HTTP === 'true') {
      console.error(`[Fetch Error] ${url}:`, error.message)
    }

    // Re-throw with enhanced error context
    throw error
  }
}

// ============================================================================
// Export
// ============================================================================

export default {
  get,
  post,
  request,
  fetchWithConfig,
  axiosInstance,
  HttpErrorType,
}
