/**
 * Job Manager - Core class for managing ComfyUI workflow executions
 * Handles job lifecycle, status tracking, and queries
 */
import { randomUUID } from 'crypto'
import { JobStorage } from './storage.js'
import {
  type JobMetadata,
  JobStatus,
  type JobProgress,
  type JobResult,
  type JobFilters,
  type JobError,
} from './types.js'
import type { Config } from '../config/index.js'

export class JobManager {
  private storage: JobStorage
  private config: Config

  constructor(config: Config) {
    this.storage = new JobStorage()
    this.config = config
  }

  /**
   * Create a new job with PENDING status
   */
  createJob(
    service: string,
    parameters: Record<string, any>,
    workflow: Record<string, any>
  ): JobMetadata {
    const job: JobMetadata = {
      jobId: randomUUID(),
      service,
      createdAt: new Date(),
      status: JobStatus.PENDING,
      clientId: randomUUID(),
      workflow,
      parameters,
    }
    this.storage.set(job.jobId, job)
    console.log(`📝 Created job ${job.jobId} for service ${service}`)
    return job
  }

  /**
   * Get a job by ID
   */
  getJob(jobId: string): JobMetadata | undefined {
    return this.storage.get(jobId)
  }

  /**
   * Update job status with optional additional fields
   */
  updateJobStatus(jobId: string, status: JobStatus, updates?: Partial<JobMetadata>): void {
    const job = this.storage.get(jobId)
    if (!job) {
      console.warn(`⚠️ Attempted to update non-existent job ${jobId}`)
      return
    }

    job.status = status
    if (updates) {
      Object.assign(job, updates)
    }
    this.storage.set(jobId, job)

    if (status === JobStatus.RUNNING) {
      console.log(`▶️ Job ${jobId} started`)
    } else if (status === JobStatus.COMPLETED) {
      console.log(`✅ Job ${jobId} completed successfully`)
    } else if (status === JobStatus.FAILED) {
      console.log(`❌ Job ${jobId} failed`)
    }
  }

  /**
   * Update job progress information
   */
  updateJobProgress(jobId: string, progress: JobProgress): void {
    const job = this.storage.get(jobId)
    if (!job) return

    job.progress = progress
    this.storage.set(jobId, job)
  }

  /**
   * Set result for a completed job
   */
  setJobResult(jobId: string, result: JobResult): void {
    const job = this.storage.get(jobId)
    if (!job) return

    job.result = result
    job.promptId = result.promptId
    this.storage.set(jobId, job)
  }

  /**
   * Set error for a failed job
   */
  setJobError(jobId: string, error: Error | JobError): void {
    const job = this.storage.get(jobId)
    if (!job) return

    const errorObj: JobError =
      error instanceof Error ? { message: error.message, code: (error as any).code } : error

    job.error = errorObj
    this.storage.set(jobId, job)
  }

  /**
   * List jobs with optional filters
   */
  listJobs(filters?: JobFilters): JobMetadata[] {
    return this.storage.list(filters)
  }

  /**
   * Get jobs by service name
   */
  getJobsByService(service: string): JobMetadata[] {
    return this.storage.list({ service })
  }

  /**
   * Get jobs by status
   */
  getJobsByStatus(status: JobStatus): JobMetadata[] {
    return this.storage.list({ status })
  }

  /**
   * Delete jobs older than the specified date
   * Returns the number of jobs deleted
   */
  cleanupOldJobs(olderThan: Date): number {
    const count = this.storage.cleanupOldJobs(olderThan)
    if (count > 0) {
      console.log(`🧹 Cleaned up ${count} old jobs (older than ${olderThan.toISOString()})`)
    }
    return count
  }

  /**
   * Clear all jobs
   */
  clearAllJobs(): void {
    this.storage.clear()
    console.log(`🗑️ Cleared all jobs`)
  }

  /**
   * Get statistics about jobs by status
   */
  getStats(): Record<JobStatus, number> {
    return {
      [JobStatus.PENDING]: this.storage.getCountByStatus(JobStatus.PENDING),
      [JobStatus.RUNNING]: this.storage.getCountByStatus(JobStatus.RUNNING),
      [JobStatus.COMPLETED]: this.storage.getCountByStatus(JobStatus.COMPLETED),
      [JobStatus.FAILED]: this.storage.getCountByStatus(JobStatus.FAILED),
      [JobStatus.TIMEOUT]: this.storage.getCountByStatus(JobStatus.TIMEOUT),
      [JobStatus.CANCELLED]: this.storage.getCountByStatus(JobStatus.CANCELLED),
    }
  }

  /**
   * Get total number of jobs
   */
  getTotalJobCount(): number {
    return this.storage.size
  }
}
