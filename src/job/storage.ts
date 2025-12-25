/**
 * In-memory storage for ComfyUI job metadata
 * Uses a Map for efficient lookups by job ID
 */
import { type JobMetadata, type JobFilters, JobStatus } from './types.js'

export class JobStorage {
  private jobs: Map<string, JobMetadata>

  constructor() {
    this.jobs = new Map()
  }

  /**
   * Get a job by ID
   */
  get(jobId: string): JobMetadata | undefined {
    return this.jobs.get(jobId)
  }

  /**
   * Store or update a job
   */
  set(jobId: string, job: JobMetadata): void {
    this.jobs.set(jobId, job)
  }

  /**
   * Delete a job by ID
   */
  delete(jobId: string): boolean {
    return this.jobs.delete(jobId)
  }

  /**
   * Check if a job exists
   */
  has(jobId: string): boolean {
    return this.jobs.has(jobId)
  }

  /**
   * List all jobs with optional filters
   * Results are sorted by creation time (newest first)
   */
  list(filters?: JobFilters): JobMetadata[] {
    let jobs = Array.from(this.jobs.values())

    // Apply filters
    if (filters?.service) {
      jobs = jobs.filter((j) => j.service === filters.service)
    }
    if (filters?.status) {
      jobs = jobs.filter((j) => j.status === filters.status)
    }

    // Sort by creation time (newest first)
    jobs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    // Apply pagination
    if (filters?.offset) {
      jobs = jobs.slice(filters.offset)
    }
    if (filters?.limit) {
      jobs = jobs.slice(0, filters.limit)
    }

    return jobs
  }

  /**
   * Delete jobs older than the specified cutoff date
   * Returns the number of jobs deleted
   */
  cleanupOldJobs(cutoff: Date): number {
    let count = 0
    for (const [jobId, job] of this.jobs.entries()) {
      if (job.createdAt < cutoff) {
        this.jobs.delete(jobId)
        count++
      }
    }
    return count
  }

  /**
   * Clear all jobs from storage
   */
  clear(): void {
    this.jobs.clear()
  }

  /**
   * Get the total number of jobs
   */
  get size(): number {
    return this.jobs.size
  }

  /**
   * Get count of jobs by status
   */
  getCountByStatus(status: JobStatus): number {
    let count = 0
    for (const job of this.jobs.values()) {
      if (job.status === status) count++
    }
    return count
  }
}
