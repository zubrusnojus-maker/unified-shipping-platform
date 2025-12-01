import type { LLMResponse } from '@unified/types';

export interface LLMProvider {
  readonly name: string;
  generate(prompt: string, options?: GenerateOptions): Promise<LLMResponse>;
}

export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  stopSequences?: string[];
}

export { HuggingFaceProvider } from './huggingface.js';
