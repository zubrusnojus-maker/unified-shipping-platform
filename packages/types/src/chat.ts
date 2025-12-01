/**
 * Chat Types
 * Types for the chatbot and memory system
 */

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface Conversation {
  id: string;
  userId: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Memory {
  id?: string;
  userId: string;
  content: string;
  type: MemoryType;
  keywords?: string[];
  timestamp: string;
}

export type MemoryType =
  | 'preference'
  | 'provider_preference'
  | 'destination_country'
  | 'shipping_scope'
  | 'carrier_preference'
  | 'incoterm_preference'
  | 'general';

export interface MemorySearchResult {
  memory: Memory;
  score: number;
}

export interface ChatRequest {
  message: string;
  userId: string;
  conversationId?: string;
}

export interface ChatResponse {
  message: string;
  conversationId: string;
  timestamp: string;
  memoryEnabled: boolean;
  relevantMemories?: Memory[];
}

export interface MemoryExtractionPattern {
  pattern: RegExp;
  type: MemoryType;
}

// LLM Provider configuration
export interface LLMConfig {
  provider: 'huggingface' | 'openai' | 'anthropic';
  apiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
