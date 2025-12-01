/**
 * Common Types
 * Shared types used across the platform
 */

export interface User {
  id: string;
  email: string;
  name?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// Health check response
export interface HealthCheckResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  version: string;
  timestamp: string;
  services: {
    database: boolean;
    redis: boolean;
    llm: boolean;
  };
}

// Environment configuration
export interface AppConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  database: DatabaseConfig;
  redis: RedisConfig;
  llm: LLMProviderConfig;
  github?: GitHubConfig;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface RedisConfig {
  url: string;
}

export interface LLMProviderConfig {
  provider: 'huggingface' | 'openai' | 'anthropic';
  apiKey: string;
  model?: string;
}

export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
}
