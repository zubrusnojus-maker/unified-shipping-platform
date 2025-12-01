/**
 * Agent Types
 * Types for the AI agent infrastructure
 */

export type AgentType =
  | 'orchestrator'
  | 'codegen'
  | 'testrunner'
  | 'release'
  | 'compliance';

export type AgentLane = 'p0' | 'p1';

export interface AgentCapabilities {
  lint?: boolean;
  coverage?: boolean;
  security?: boolean;
  override?: boolean;
}

export interface AgentTaskData {
  taskDescription: string;
  targetFiles?: string[];
  testRequirements?: string;
  branchName?: string;
  prTitle?: string;
  prBody?: string;
  agentType?: AgentType;
  lane?: AgentLane;
  caps?: AgentCapabilities;
}

export interface AgentTaskResult {
  success: boolean;
  message: string;
  artifacts?: AgentArtifacts;
  error?: string;
}

export interface AgentArtifacts {
  files?: Record<string, string>;
  testResults?: TestResults;
  prUrl?: string;
  coverageReport?: string;
  logs?: string[];
}

export interface TestResults {
  passed: number;
  failed: number;
  total: number;
  duration: number;
  failures: TestFailure[];
}

export interface TestFailure {
  test: string;
  error: string;
}

export interface WorkerTaskData extends AgentTaskData {
  generatedFiles?: Record<string, string>;
}

export interface WorkerTaskResult {
  success: boolean;
  message: string;
  artifacts?: {
    testResults?: TestResults;
    coverageReport?: string;
    logs?: string[];
  };
  error?: string;
}

// Job queue types
export interface EnqueueJobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
}

export interface JobStatus {
  status: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed' | 'not_found';
  progress: number;
  result?: AgentTaskResult;
  error?: string;
}

export interface QueueStats {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}
