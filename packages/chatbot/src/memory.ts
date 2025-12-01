import type { Memory, MemoryType, MemorySearchResult, ChatMessage } from '@unified/types';
import { MEMORY_EXTRACTION_PATTERNS } from './prompts.js';

export interface MemoryStore {
  add(memory: Omit<Memory, 'id'>): Promise<Memory>;
  search(userId: string, query: string, limit?: number): Promise<MemorySearchResult[]>;
  getByUserId(userId: string, limit?: number): Promise<Memory[]>;
  delete(userId: string): Promise<void>;
  getCount(userId: string): Promise<number>;
}

/**
 * In-memory store for development/testing
 */
export class InMemoryStore implements MemoryStore {
  private memories: Map<string, Memory[]> = new Map();
  private idCounter = 0;

  async add(memory: Omit<Memory, 'id'>): Promise<Memory> {
    const id = `mem_${++this.idCounter}`;
    const fullMemory: Memory = { ...memory, id };

    if (!this.memories.has(memory.userId)) {
      this.memories.set(memory.userId, []);
    }

    const userMemories = this.memories.get(memory.userId)!;
    userMemories.push(fullMemory);

    // Keep only last 100 memories
    if (userMemories.length > 100) {
      this.memories.set(memory.userId, userMemories.slice(-100));
    }

    return fullMemory;
  }

  async search(userId: string, query: string, limit: number = 5): Promise<MemorySearchResult[]> {
    const memories = this.memories.get(userId) || [];
    const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    if (queryWords.length === 0) return [];

    const scored = memories.map(memory => {
      const contentLower = memory.content.toLowerCase();
      const matchCount = queryWords.filter(word => contentLower.includes(word)).length;
      const keywordMatches = memory.keywords?.filter(kw =>
        queryWords.some(word => kw.toLowerCase().includes(word))
      ).length ?? 0;

      return {
        memory,
        score: matchCount + keywordMatches * 2,
      };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async getByUserId(userId: string, limit: number = 100): Promise<Memory[]> {
    const memories = this.memories.get(userId) || [];
    return memories.slice(-limit);
  }

  async delete(userId: string): Promise<void> {
    this.memories.delete(userId);
  }

  async getCount(userId: string): Promise<number> {
    return (this.memories.get(userId) || []).length;
  }
}

/**
 * Memory manager for extracting and storing memories from conversations
 */
export class MemoryManager {
  constructor(private store: MemoryStore) {}

  /**
   * Extract memories from a user message
   */
  extractMemories(userId: string, message: ChatMessage): Array<Omit<Memory, 'id'>> {
    if (message.role !== 'user') return [];

    const memories: Array<Omit<Memory, 'id'>> = [];
    const content = message.content;
    const contentLower = content.toLowerCase();

    // Check for explicit preference patterns
    const preferencePatterns = [
      'i like',
      'i love',
      'i prefer',
      'my favorite',
      'i always use',
      'i usually',
    ];

    if (preferencePatterns.some(p => contentLower.includes(p))) {
      memories.push({
        userId,
        content,
        type: 'preference',
        keywords: this.extractKeywords(content),
        timestamp: message.timestamp,
      });
    }

    // Check for domain-specific patterns
    for (const { pattern, type } of MEMORY_EXTRACTION_PATTERNS) {
      if (pattern.test(content)) {
        const match = content.match(pattern);
        if (match) {
          memories.push({
            userId,
            content,
            type,
            keywords: [...this.extractKeywords(content), ...(match.slice(1).filter(Boolean))],
            timestamp: message.timestamp,
          });
        }
      }
    }

    return memories;
  }

  /**
   * Process a message and store any extracted memories
   */
  async processMessage(userId: string, message: ChatMessage): Promise<Memory[]> {
    const extracted = this.extractMemories(userId, message);
    const stored: Memory[] = [];

    for (const memory of extracted) {
      // Avoid duplicate memories
      const existing = await this.store.search(userId, memory.content, 1);
      if (existing.length === 0 || existing[0].score < 5) {
        const savedMemory = await this.store.add(memory);
        stored.push(savedMemory);
      }
    }

    return stored;
  }

  /**
   * Search for relevant memories
   */
  async searchRelevant(userId: string, query: string, limit: number = 5): Promise<Memory[]> {
    const results = await this.store.search(userId, query, limit);
    return results.map(r => r.memory);
  }

  /**
   * Get all memories for a user
   */
  async getAll(userId: string): Promise<Memory[]> {
    return this.store.getByUserId(userId);
  }

  /**
   * Clear all memories for a user
   */
  async clear(userId: string): Promise<void> {
    await this.store.delete(userId);
  }

  /**
   * Build memory context string for prompt injection
   */
  async buildMemoryContext(userId: string, query: string): Promise<string> {
    const relevant = await this.searchRelevant(userId, query);

    if (relevant.length === 0) return '';

    return relevant.map(m => `- ${m.content}`).join('\n');
  }

  private extractKeywords(text: string): string[] {
    // Simple keyword extraction - remove common words and punctuation
    const stopWords = new Set([
      'i', 'me', 'my', 'we', 'our', 'you', 'your', 'the', 'a', 'an',
      'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
      'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
      'can', 'may', 'might', 'must', 'shall', 'to', 'of', 'in', 'for',
      'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'under', 'again',
      'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why',
      'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
      'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very',
      'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'about',
    ]);

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 10);
  }
}
