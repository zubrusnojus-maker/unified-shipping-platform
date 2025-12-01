import { Queue, Worker, Job } from 'bullmq';
import { createClient } from 'redis';
import { Octokit } from '@octokit/rest';
import * as dotenv from 'dotenv';
import type { AgentTaskData, AgentTaskResult } from '@unified/types';
import { agentEnv, githubEnv } from '@unified/env';

dotenv.config();

// Configuration
const REDIS_URL = agentEnv.redisUrl;
const QUEUE_NAME = agentEnv.queueName;
const GITHUB_TOKEN = githubEnv.token;
const GITHUB_OWNER = githubEnv.owner;
const GITHUB_REPO = githubEnv.repo;

function getRedisConfig(url: string) {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port || '6379'),
    password: parsed.password || undefined,
  };
}

async function createRedisClient() {
  const client = createClient({ url: REDIS_URL });

  client.on('error', (err) => {
    console.error('Redis Client Error:', err);
  });

  await client.connect();
  console.log('Connected to Redis');
  return client;
}

function createGitHubClient(): Octokit | null {
  if (!GITHUB_TOKEN) {
    console.warn('GITHUB_TOKEN not set - PR creation will be disabled');
    return null;
  }
  return new Octokit({ auth: GITHUB_TOKEN });
}

async function createBranchAndPR(
  octokit: Octokit,
  branchName: string,
  files: Record<string, string>,
  prTitle: string,
  prBody: string,
): Promise<string> {
  if (!GITHUB_OWNER || !GITHUB_REPO) {
    throw new Error('GITHUB_OWNER and GITHUB_REPO must be set');
  }

  // Get the default branch ref
  const { data: repo } = await octokit.repos.get({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
  });

  const defaultBranch = repo.default_branch || 'main';

  // Get the latest commit SHA
  const { data: ref } = await octokit.git.getRef({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    ref: `heads/${defaultBranch}`,
  });

  const latestCommitSha = ref.object.sha;

  // Create a new branch
  try {
    await octokit.git.createRef({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      ref: `refs/heads/${branchName}`,
      sha: latestCommitSha,
    });
  } catch (error: any) {
    if (error.status === 422) {
      console.log(`Branch ${branchName} already exists, will update it`);
    } else {
      throw error;
    }
  }

  // Get the base tree
  const { data: baseCommit } = await octokit.git.getCommit({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    commit_sha: latestCommitSha,
  });

  // Create blobs for each file
  const blobs = await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      const { data: blob } = await octokit.git.createBlob({
        owner: GITHUB_OWNER!,
        repo: GITHUB_REPO!,
        content: Buffer.from(content).toString('base64'),
        encoding: 'base64',
      });
      return { path, sha: blob.sha, mode: '100644' as const, type: 'blob' as const };
    }),
  );

  // Create a new tree
  const { data: tree } = await octokit.git.createTree({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    base_tree: baseCommit.tree.sha,
    tree: blobs,
  });

  // Create a new commit
  const { data: commit } = await octokit.git.createCommit({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    message: prTitle,
    tree: tree.sha,
    parents: [latestCommitSha],
  });

  // Update the branch reference
  await octokit.git.updateRef({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    ref: `heads/${branchName}`,
    sha: commit.sha,
  });

  // Create a pull request
  const { data: pr } = await octokit.pulls.create({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    title: prTitle,
    body: prBody,
    head: branchName,
    base: defaultBranch,
  });

  return pr.html_url;
}

/**
 * Process task with LangChain (placeholder)
 * TODO: Implement actual LLM integration
 */
async function processWithLangChain(data: AgentTaskData): Promise<Record<string, string>> {
  console.log('Processing task with LangChain:', data.taskDescription);

  // Placeholder - generate stub files
  const files: Record<string, string> = {};

  if (data.targetFiles && data.targetFiles.length > 0) {
    data.targetFiles.forEach((file) => {
      files[file] = `// Generated code for: ${data.taskDescription}\n// TODO: Implement\n`;
    });
  } else {
    files['generated.ts'] = `// Generated code for: ${data.taskDescription}\n// TODO: Implement\n`;
  }

  return files;
}

async function startManager() {
  const redisClient = await createRedisClient();
  const octokit = createGitHubClient();
  const redisConfig = getRedisConfig(REDIS_URL);

  const taskQueue = new Queue(QUEUE_NAME, { connection: redisConfig });

  console.log('Agent Manager started');
  console.log(`Queue: ${QUEUE_NAME}`);
  console.log(`Redis: ${REDIS_URL}`);

  const managerWorker = new Worker(
    QUEUE_NAME,
    async (job: Job<AgentTaskData>) => {
      console.log(`Processing job ${job.id}:`, job.data.taskDescription);

      try {
        const lane = job.data.lane || 'p1';
        const caps = job.data.caps || {};

        // Phase: build (codegen)
        const generatedFiles = await processWithLangChain(job.data);
        await job.updateProgress(40);

        // Phase: validate (tests)
        const workerJob = await taskQueue.add(
          'testrunner',
          { ...job.data, generatedFiles, caps },
          { priority: lane === 'p0' ? 1 : 5 },
        );

        console.log(`Submitted to test runner: ${workerJob.id}`);
        const workerResult = await workerJob.waitUntilFinished(
          new (await import('bullmq')).QueueEvents(QUEUE_NAME, { connection: redisConfig }),
        );
        await job.updateProgress(75);

        const testsPassed = Boolean(workerResult?.success);

        // Compliance gate
        const needsCompliance = lane === 'p0' || caps.security === true;
        if (needsCompliance && !testsPassed) {
          throw new Error('Compliance gate requires passing tests');
        }

        // Phase: release (PR)
        let prUrl: string | undefined;
        const canRelease = testsPassed || caps.override === true;

        if (octokit && canRelease) {
          const branchName = job.data.branchName || `agent-task-${Date.now()}`;
          const prTitle = job.data.prTitle || `Agent Task: ${job.data.taskDescription}`;
          const prBody =
            job.data.prBody ||
            `
## Task Description
${job.data.taskDescription}

## Generated Files
${Object.keys(generatedFiles).join(', ')}

## Test Results
${testsPassed ? 'Tests passed' : 'Override: proceeding despite failures'}

---
Generated by Agent Manager
          `.trim();

          prUrl = await createBranchAndPR(octokit, branchName, generatedFiles, prTitle, prBody);
          console.log(`PR created: ${prUrl}`);
        }

        await job.updateProgress(100);

        return {
          success: true,
          message: 'Task completed successfully',
          artifacts: {
            files: generatedFiles,
            testResults: workerResult?.artifacts?.testResults,
            prUrl,
          },
        } as AgentTaskResult;
      } catch (error: any) {
        console.error(`Job ${job.id} failed:`, error);
        return {
          success: false,
          message: 'Task failed',
          error: error.message,
        } as AgentTaskResult;
      }
    },
    {
      connection: redisConfig,
      concurrency: agentEnv.managerConcurrency,
    },
  );

  managerWorker.on('completed', (job) => {
    console.log(`Job ${job.id} completed successfully`);
  });

  managerWorker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  // Graceful shutdown
  const shutdown = async () => {
    console.log('Shutting down manager...');
    await managerWorker.close();
    await taskQueue.close();
    await redisClient.quit();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startManager().catch((error) => {
  console.error('Failed to start manager:', error);
  process.exit(1);
});
