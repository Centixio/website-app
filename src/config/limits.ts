/** Operational limits. Centralized so they can be tuned without code changes elsewhere. */
export const LIMITS = {
  /** Max generation jobs a user can have queued or running at once, by plan. */
  concurrentJobs: { free: 1, starter: 2, pro: 3 } as Record<string, number>,
  /** Max chargeable jobs a user may enqueue per rolling hour. */
  jobsPerHour: 30,
  /** AI-enhanced recommendation calls per user per hour. */
  aiRecommendationsPerHour: 20,
  /** Max attempts a worker makes for one job (lease expiry or transient errors). */
  jobMaxAttempts: 3,
  /** Lease a worker holds on a job before another worker may reclaim it. */
  jobLeaseSeconds: 240,
  /** A job that has not finished within this window is failed and its credits released. */
  jobTimeoutSeconds: 900,
  /** Bounded repair attempts after validation fails, per job. */
  maxRepairAttempts: 2,
  /** Reservations not settled within this window are auto-released. */
  reservationTtlSeconds: 1800,
  upload: {
    imageMaxBytes: 8 * 1024 * 1024,
    modelMaxBytes: 25 * 1024 * 1024,
    referenceMaxBytes: 8 * 1024 * 1024,
    maxAssetsPerProject: 40,
  },
  prompt: { minChars: 12, maxChars: 4000 },
  chatMessageMaxChars: 2000,
  /** Inline assets into single-file exports only while the total stays under this size. */
  singleFileInlineMaxBytes: 12 * 1024 * 1024,
} as const;
