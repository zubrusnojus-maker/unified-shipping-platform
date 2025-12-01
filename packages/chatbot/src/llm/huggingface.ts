import { HfInference } from '@huggingface/inference';
import type { LLMResponse } from '@unified/types';
import type { LLMProvider, GenerateOptions } from './index.js';

export interface HuggingFaceConfig {
  apiKey: string;
  model?: string;
}

export class HuggingFaceProvider implements LLMProvider {
  readonly name = 'HuggingFace';
  private hf: HfInference;
  private model: string;

  constructor(config: HuggingFaceConfig) {
    this.hf = new HfInference(config.apiKey);
    this.model = config.model || 'mistralai/Mistral-7B-Instruct-v0.2';
  }

  async generate(prompt: string, options: GenerateOptions = {}): Promise<LLMResponse> {
    const response = await this.hf.textGeneration({
      model: this.model,
      inputs: prompt,
      parameters: {
        max_new_tokens: options.maxTokens || 512,
        temperature: options.temperature || 0.7,
        top_p: options.topP || 0.95,
        return_full_text: false,
        stop_sequences: options.stopSequences,
      },
    });

    return {
      text: response.generated_text.trim(),
    };
  }
}
