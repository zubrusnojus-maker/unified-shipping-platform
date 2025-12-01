import type { ChatMessage, ChatResponse, Memory } from '@unified/types';
import type { LLMProvider } from './llm/index.js';
import { MemoryManager, InMemoryStore, type MemoryStore } from './memory.js';
import { SHIPPING_SYSTEM_PROMPT, buildSystemPrompt, isShippingRelated } from './prompts.js';

export interface ChatbotConfig {
  llmProvider: LLMProvider;
  memoryStore?: MemoryStore;
  systemPrompt?: string;
  maxConversationHistory?: number;
}

export interface ChatbotInstance {
  chat(message: string, userId: string, conversationId?: string): Promise<ChatResponse>;
  getHistory(userId: string): Promise<Record<string, ChatMessage[]>>;
  getMemories(userId: string): Promise<Memory[]>;
  clearMemories(userId: string): Promise<void>;
}

interface ConversationHistory {
  [conversationId: string]: ChatMessage[];
}

export function createChatbot(config: ChatbotConfig): ChatbotInstance {
  const { llmProvider, systemPrompt = SHIPPING_SYSTEM_PROMPT, maxConversationHistory = 50 } = config;

  // Initialize stores
  const memoryStore = config.memoryStore || new InMemoryStore();
  const memoryManager = new MemoryManager(memoryStore);
  const conversations: Map<string, ConversationHistory> = new Map();

  // Store conversation message
  const storeConversation = (userId: string, conversationId: string, message: ChatMessage) => {
    if (!conversations.has(userId)) {
      conversations.set(userId, {});
    }

    const userConvs = conversations.get(userId)!;
    if (!userConvs[conversationId]) {
      userConvs[conversationId] = [];
    }

    userConvs[conversationId].push(message);

    // Keep only last N messages
    if (userConvs[conversationId].length > maxConversationHistory) {
      userConvs[conversationId] = userConvs[conversationId].slice(-maxConversationHistory);
    }
  };

  const chat = async (
    message: string,
    userId: string,
    conversationId: string = 'default'
  ): Promise<ChatResponse> => {
    const timestamp = new Date().toISOString();

    // Create user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: message,
      timestamp,
    };

    // Store user message
    storeConversation(userId, conversationId, userMessage);

    // Extract and store memories
    await memoryManager.processMessage(userId, userMessage);

    // Build context
    const memoryContext = await memoryManager.buildMemoryContext(userId, message);

    // Get recent conversation history
    const userConvs = conversations.get(userId)?.[conversationId] || [];
    const recentHistory = userConvs.slice(-10);
    const historyContext = recentHistory.length > 0
      ? recentHistory.map(m => `${m.role}: ${m.content}`).join('\n')
      : '';

    // Determine system prompt based on message content
    const basePrompt = isShippingRelated(message)
      ? systemPrompt
      : 'You are a helpful AI assistant with memory. You remember past conversations and can provide personalized responses.';

    // Build full prompt
    const fullSystemPrompt = buildSystemPrompt(basePrompt, memoryContext, historyContext);
    const fullPrompt = `${fullSystemPrompt}\n\nUser: ${message}\nAssistant:`;

    // Generate response
    const response = await llmProvider.generate(fullPrompt, {
      maxTokens: 512,
      temperature: 0.7,
    });

    // Create assistant message
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: response.text,
      timestamp: new Date().toISOString(),
    };

    // Store assistant message
    storeConversation(userId, conversationId, assistantMessage);

    // Get relevant memories for response
    const relevantMemories = await memoryManager.searchRelevant(userId, message, 3);

    return {
      message: assistantMessage.content,
      conversationId,
      timestamp: assistantMessage.timestamp,
      memoryEnabled: true,
      relevantMemories,
    };
  };

  const getHistory = async (userId: string): Promise<Record<string, ChatMessage[]>> => {
    return conversations.get(userId) || {};
  };

  const getMemories = async (userId: string): Promise<Memory[]> => {
    return memoryManager.getAll(userId);
  };

  const clearMemories = async (userId: string): Promise<void> => {
    conversations.delete(userId);
    await memoryManager.clear(userId);
  };

  return {
    chat,
    getHistory,
    getMemories,
    clearMemories,
  };
}
