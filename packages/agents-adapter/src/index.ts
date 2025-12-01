import { Queue, QueueEvents } from 'bullmq';
import { createClient, RedisClientType } from 'redis';
import { agentEnv } from '@unified/env';
import type {
  AgentTaskData,
  AgentTaskResult,
  JobStatus,
  QueueStats,
  EnqueueJobOptions,
} from '@unified/types';

const REDIS_URL = agentEnv.redisUrl;
const QUEUE_NAME = agentEnv.queueName;

let redisClient: RedisClientType | null = null;
let taskQueue: Queue | null = null;
let queueEvents: QueueEvents | null = null;

/**
 * Get Redis connection config from URL
 */
function getRedisConfig(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379'),
    password: parsed.password || undefined,
  };
}

/**
 * Initialize the BullMQ connection
 */
export async function initializeQueue(): Promise<Queue> {
  if (taskQueue) {
    return taskQueue;
  }

  const redisConfig = getRedisConfig(REDIS_URL);

  // Create Redis client
  redisClient = createClient({ url: REDIS_URL });

  redisClient.on('error', (err: Error) => {
    console.error('Redis Client Error in agents-adapter:', err);
  });

  await redisClient.connect();
  console.log('Agents adapter connected to Redis');

  // Create BullMQ queue
  taskQueue = new Queue(QUEUE_NAME, {
    connection: redisConfig,
  });

  // Create queue events for waiting
  queueEvents = new QueueEvents(QUEUE_NAME, {
    connection: redisConfig,
  });

  return taskQueue;
}

/**
 * Enqueue a code generation task
 */
export async function enqueueCodeGenerationTask(
  taskData: AgentTaskData,
  options: EnqueueJobOptions = {},
): Promise<string> {
  const queue = await initializeQueue();

  const job = await queue.add('generate-code', taskData, {
    priority: options.priority || 10,
    delay: options.delay || 0,
    attempts: options.attempts || 3,
    backoff: options.backoff || {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 86400, // 24 hours
      count: 100,
    },
    removeOnFail: {
      age: 604800, // 7 days
    },
  });

  console.log(`Enqueued code generation task: ${job.id}`);
  return job.id as string;
}

/**
 * Get the status of a job
 */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  const queue = await initializeQueue();
  const job = await queue.getJob(jobId);

  if (!job) {
    return {
      status: 'not_found',
      progress: 0,
    };
  }

  const state = await job.getState();
  const progress = (job.progress as number) || 0;

  let result: AgentTaskResult | undefined;
  let error: string | undefined;

  if (state === 'completed') {
    result = job.returnvalue as AgentTaskResult;
  } else if (state === 'failed') {
    error = job.failedReason;
  }

  return {
    status: state as JobStatus['status'],
    progress,
    result,
    error,
  };
}

/**
 * Wait for a job to complete
 */
export async function waitForJob(
  jobId: string,
  timeout: number = 300000,
): Promise<AgentTaskResult> {
  const queue = await initializeQueue();
  const job = await queue.getJob(jobId);

  if (!job) {
    throw new Error('Job not found');
  }

  if (!queueEvents) {
    throw new Error('Queue events not initialized');
  }

  const result = await job.waitUntilFinished(queueEvents, timeout);
  return result as AgentTaskResult;
}

/**
 * Cancel a job
 */
export async function cancelJob(jobId: string): Promise<void> {
  const queue = await initializeQueue();
  const job = await queue.getJob(jobId);

  if (!job) {
    throw new Error('Job not found');
  }

  await job.remove();
  console.log(`Cancelled job: ${jobId}`);
}

/**
 * Get queue statistics
 */
export async function getQueueStats(): Promise<QueueStats> {
  const queue = await initializeQueue();

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
  };
}

/**
 * Clean up resources
 */
export async function cleanup(): Promise<void> {
  if (queueEvents) {
    await queueEvents.close();
    queueEvents = null;
  }

  if (taskQueue) {
    await taskQueue.close();
    taskQueue = null;
  }

  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

// Handle process termination
process.on('SIGTERM', cleanup);
process.on('SIGINT', cleanup);
