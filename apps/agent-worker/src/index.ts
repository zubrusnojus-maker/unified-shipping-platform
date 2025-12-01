import { Worker, Job } from 'bullmq';
import { createClient } from 'redis';
import * as dotenv from 'dotenv';
import { agentEnv } from '@unified/env';
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import type { WorkerTaskData, WorkerTaskResult, TestResults } from '@unified/types';

dotenv.config();

// Configuration
const REDIS_URL = agentEnv.redisUrl;
const QUEUE_NAME = agentEnv.queueName;
const SANDBOX_DIR = agentEnv.sandboxDir;

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

async function createSandbox(jobId: string): Promise<string> {
  const sandboxPath = path.join(SANDBOX_DIR, jobId);

  try {
    await fs.rm(sandboxPath, { recursive: true, force: true });
  } catch {
    // Ignore if doesn't exist
  }

  await fs.mkdir(sandboxPath, { recursive: true });
  console.log(`Created sandbox at: ${sandboxPath}`);
  return sandboxPath;
}

async function writeFilesToSandbox(
  sandboxPath: string,
  files: Record<string, string>,
): Promise<void> {
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(sandboxPath, filePath);
    const dir = path.dirname(fullPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    console.log(`Wrote file: ${filePath}`);
  }
}

async function setupTestEnvironment(sandboxPath: string): Promise<void> {
  const packageJson = {
    name: 'agent-test-sandbox',
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: {
      test: 'vitest run',
      'test:e2e': 'playwright test',
    },
    devDependencies: {
      vitest: '^4.0.14',
      '@playwright/test': '^1.57.0',
      typescript: '^5.9.3',
      '@types/node': '^20.5.0',
    },
  };

  await fs.writeFile(path.join(sandboxPath, 'package.json'), JSON.stringify(packageJson, null, 2));

  const vitestConfig = `
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
});
`;

  await fs.writeFile(path.join(sandboxPath, 'vitest.config.ts'), vitestConfig);

  const playwrightConfig = `
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  use: { headless: true },
});
`;

  await fs.writeFile(path.join(sandboxPath, 'playwright.config.ts'), playwrightConfig);
  console.log('Test environment configured');
}

async function installDependencies(sandboxPath: string): Promise<void> {
  console.log('Installing dependencies...');

  try {
    execSync('npm install --no-save', {
      cwd: sandboxPath,
      stdio: 'inherit',
      timeout: 300000,
    });
    console.log('Dependencies installed successfully');
  } catch (error: any) {
    console.error('Failed to install dependencies:', error.message);
    throw new Error(`Dependency installation failed: ${error.message}`);
  }
}

async function runVitests(sandboxPath: string): Promise<TestResults> {
  console.log('Running Vitest tests...');

  try {
    const output = execSync('npm test -- --reporter=json', {
      cwd: sandboxPath,
      encoding: 'utf-8',
      timeout: 120000,
    });

    const results = JSON.parse(output);

    return {
      passed: results.numPassedTests || 0,
      failed: results.numFailedTests || 0,
      total: results.numTotalTests || 0,
      duration: results.testResults?.[0]?.perfStats?.runtime || 0,
      failures:
        results.testResults
          ?.filter((t: any) => t.status === 'failed')
          .map((t: any) => ({
            test: t.name,
            error: t.message || 'Unknown error',
          })) || [],
    };
  } catch (error: any) {
    console.log('Vitest output:', error.stdout || error.message);

    return {
      passed: 0,
      failed: 1,
      total: 1,
      duration: 0,
      failures: [{ test: 'vitest execution', error: error.message }],
    };
  }
}

async function runPlaywrightTests(sandboxPath: string): Promise<TestResults> {
  console.log('Running Playwright tests...');

  try {
    const output = execSync('npm run test:e2e -- --reporter=json', {
      cwd: sandboxPath,
      encoding: 'utf-8',
      timeout: 180000,
    });

    const results = JSON.parse(output);

    return {
      passed: results.stats?.expected || 0,
      failed: results.stats?.unexpected || 0,
      total: results.stats?.total || 0,
      duration: results.stats?.duration || 0,
      failures:
        results.suites
          ?.flatMap((s: any) => s.specs)
          .filter((s: any) => s.ok === false)
          .map((s: any) => ({
            test: s.title,
            error: s.tests?.[0]?.results?.[0]?.error?.message || 'Unknown error',
          })) || [],
    };
  } catch (error: any) {
    console.log('Playwright output:', error.stdout || error.message);

    return {
      passed: 0,
      failed: 1,
      total: 1,
      duration: 0,
      failures: [{ test: 'playwright execution', error: error.message }],
    };
  }
}

async function detectTestFramework(
  sandboxPath: string,
): Promise<'vitest' | 'playwright' | 'both' | 'none'> {
  try {
    const files = await fs.readdir(sandboxPath, { recursive: true });
    const fileNames = files.filter((f) => typeof f === 'string') as string[];

    const hasVitestTests = fileNames.some((f) => f.endsWith('.test.ts') || f.endsWith('.spec.ts'));

    const hasPlaywrightTests = fileNames.some(
      (f) => f.includes('/tests/') && (f.endsWith('.test.ts') || f.endsWith('.spec.ts')),
    );

    if (hasVitestTests && hasPlaywrightTests) return 'both';
    if (hasVitestTests) return 'vitest';
    if (hasPlaywrightTests) return 'playwright';
    return 'none';
  } catch {
    return 'none';
  }
}

async function cleanupSandbox(sandboxPath: string): Promise<void> {
  try {
    await fs.rm(sandboxPath, { recursive: true, force: true });
    console.log(`Cleaned up sandbox: ${sandboxPath}`);
  } catch (error) {
    console.error(`Failed to clean up sandbox: ${error}`);
  }
}

async function processWorkerTask(job: Job<WorkerTaskData>): Promise<WorkerTaskResult> {
  const jobId = job.id || Date.now().toString();
  let sandboxPath = '';

  try {
    console.log(`Processing worker task ${jobId}`);

    sandboxPath = await createSandbox(jobId);
    await job.updateProgress(10);

    if (job.data.generatedFiles) {
      await writeFilesToSandbox(sandboxPath, job.data.generatedFiles);
    }
    await job.updateProgress(20);

    await setupTestEnvironment(sandboxPath);
    await job.updateProgress(30);

    await installDependencies(sandboxPath);
    await job.updateProgress(50);

    const testFramework = await detectTestFramework(sandboxPath);
    let testResults: TestResults | undefined;

    if (testFramework === 'vitest' || testFramework === 'both') {
      testResults = await runVitests(sandboxPath);
      await job.updateProgress(70);
    }

    if (testFramework === 'playwright' || testFramework === 'both') {
      const playwrightResults = await runPlaywrightTests(sandboxPath);
      await job.updateProgress(90);

      if (testResults) {
        testResults.passed += playwrightResults.passed;
        testResults.failed += playwrightResults.failed;
        testResults.total += playwrightResults.total;
        testResults.failures.push(...playwrightResults.failures);
      } else {
        testResults = playwrightResults;
      }
    }

    await job.updateProgress(95);
    await cleanupSandbox(sandboxPath);
    await job.updateProgress(100);

    const success = testResults ? testResults.failed === 0 : true;

    return {
      success,
      message: success ? 'Tests passed' : 'Tests failed',
      artifacts: {
        testResults,
        logs: [`Tests ${testFramework}: ${success ? 'PASSED' : 'FAILED'}`],
      },
    };
  } catch (error: any) {
    console.error(`Worker task ${jobId} failed:`, error);

    if (sandboxPath) {
      await cleanupSandbox(sandboxPath);
    }

    return {
      success: false,
      message: 'Worker task failed',
      error: error.message,
    };
  }
}

async function startWorker() {
  const redisClient = await createRedisClient();
  const redisConfig = getRedisConfig(REDIS_URL);

  await fs.mkdir(SANDBOX_DIR, { recursive: true });

  console.log('Agent Worker started');
  console.log(`Queue: ${QUEUE_NAME}`);
  console.log(`Redis: ${REDIS_URL}`);
  console.log(`Sandbox: ${SANDBOX_DIR}`);

  const worker = new Worker(
    QUEUE_NAME,
    async (job: Job<WorkerTaskData>) => {
      // Only process testrunner jobs
      if (job.name !== 'testrunner') return null;
      return await processWorkerTask(job);
    },
    {
      connection: redisConfig,
      concurrency: agentEnv.workerConcurrency,
    },
  );

  worker.on('completed', (job) => {
    console.log(`Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);
  });

  const shutdown = async () => {
    console.log('Shutting down worker...');
    await worker.close();
    await redisClient.quit();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

startWorker().catch((error) => {
  console.error('Failed to start worker:', error);
  process.exit(1);
});
