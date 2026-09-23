declare module 'meteor/jobs' {
  import { Mongo } from 'meteor/mongo';

  interface JobDefinition {
    name: string;
    schedule?: string;
    timezone?: string;
    missedRun?: 'run-once' | 'skip';
    offload?: boolean;
    timeout?: number;
    concurrency?: number;
    retries?: number;
    backoff?: 'fixed' | 'exponential' | ((attempt: number, error: Error) => number);
    backoffDelay?: number;
    backoffMaxDelay?: number;
    unique?: (data: any) => string;
    onDuplicate?: 'skip' | 'replace' | 'error';
    onFailure?: (error: Error, job: JobDocument) => void;
    onComplete?: (result: any, job: JobDocument) => void;
    run: (data: any, job: JobContext) => Promise<any> | any;
  }

  interface JobContext {
    id: string | null;
    name: string;
    attempts: number;
    runId: string;
    signal: AbortSignal;
  }

  interface JobDocument {
    _id: string;
    name: string;
    status: 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'cancelled';
    data: any;
    result: any;
    scheduledAt: Date;
    cronSchedule: string | null;
    timezone: string | null;
    offload: boolean;
    priority: number;
    timeout: number;
    attempts: number;
    maxAttempts: number;
    lastError: {
      message: string;
      stack: string | null;
      timestamp: Date;
      code: string | null;
      isTimeout: boolean;
    } | null;
    nextRetryAt: Date | null;
    dedupKey: string | null;
    onDuplicate: string | null;
    claimedBy: string | null;
    claimedAt: Date | null;
    heartbeatAt: Date | null;
    createdAt: Date;
    startedAt: Date | null;
    completedAt: Date | null;
    failedAt: Date | null;
    cancelledAt: Date | null;
    source: 'manual' | 'cron' | 'retry';
    runId: string | null;
  }

  interface JobsConfig {
    concurrency?: number;
    pollInterval?: number;
    stalledThreshold?: number;
    heartbeatInterval?: number;
    retentionPeriod?: string | number | null;
    leaderRenewalInterval?: number;
    leaderTimeout?: number;
    shutdownTimeout?: number;
    instanceId?: string;
    testMode?: 'inline' | 'manual' | null;
    authorize?: (userId: string | null, subscription: any) => boolean | Promise<boolean>;
  }

  type JobEventName =
    | 'enqueued'
    | 'started'
    | 'completed'
    | 'failed'
    | 'cancelled'
    | 'retrying'
    | 'stalled'
    | 'leader.acquired'
    | 'leader.lost';

  interface EventHandle {
    stop(): void;
  }

  class FatalError extends Error {
    constructor(message: string);
  }

  class DuplicateError extends Error {
    constructor(message: string);
  }

  const Jobs: {
    configure(options: JobsConfig): void;
    getConfig(): JobsConfig;
    register(definition: JobDefinition): void;
    has(name: string): boolean;
    run(
      name: string,
      data?: any,
      options?: { delay?: string | number; scheduledAt?: Date }
    ): Promise<string>;
    runAndWait(
      name: string,
      data?: any,
      options?: {
        delay?: string | number;
        scheduledAt?: Date;
        waitTimeout?: number;
      }
    ): Promise<any>;
    cancel(jobId: string): Promise<boolean>;
    cancelAll(name: string): Promise<number>;
    retry(jobId: string): Promise<string>;
    get(jobId: string): Promise<JobDocument | null>;
    on(event: JobEventName, callback: Function): EventHandle;
    executeNow(jobId: string): Promise<void>;
    collection: Mongo.Collection<JobDocument>;
    FatalError: typeof FatalError;
    DuplicateError: typeof DuplicateError;

    // Semi-public internal API (used by tests and advanced integrations)
    _getDefinition(name: string): JobDefinition | undefined;
    _startLeader(): Promise<void>;
    _stopLeader(): Promise<void>;
    _isLeader(): boolean;
    _startEngine(): void;
    _stopEngine(): Promise<void>;
    _runningJobCount(): number;
    _runningJobIds(): Set<string>;
    _startCron(): Promise<void>;
    _stopCron(): void;
    _collection: Mongo.Collection<JobDocument>;
    _locksCollection: Mongo.Collection<any>;
    _clearDedupKey(jobId: string): Promise<void>;
    _resetConfig(): void;
    _resetRegistry(): void;
    _abortLocalJob(jobId: string): boolean;
  };
}
