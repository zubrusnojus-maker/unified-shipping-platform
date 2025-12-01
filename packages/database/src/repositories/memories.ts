import { query } from '../client.js';
import type { Memory, MemoryType, MemorySearchResult } from '@unified/types';

export class MemoryRepository {
  async create(memory: Omit<Memory, 'id'>): Promise<Memory> {
    const result = await query<any>(
      `INSERT INTO memories (user_id, content, type, keywords, timestamp)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        memory.userId,
        memory.content,
        memory.type,
        memory.keywords || [],
        memory.timestamp,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<Memory | null> {
    const result = await query<any>(
      'SELECT * FROM memories WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findByUserId(userId: string, limit: number = 100): Promise<Memory[]> {
    const result = await query<any>(
      'SELECT * FROM memories WHERE user_id = $1 ORDER BY timestamp DESC LIMIT $2',
      [userId, limit]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  async findByType(userId: string, type: MemoryType): Promise<Memory[]> {
    const result = await query<any>(
      'SELECT * FROM memories WHERE user_id = $1 AND type = $2 ORDER BY timestamp DESC',
      [userId, type]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  async search(userId: string, queryText: string, limit: number = 5): Promise<MemorySearchResult[]> {
    // Simple keyword-based search
    const words = queryText.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    if (words.length === 0) return [];

    const memories = await this.findByUserId(userId);

    const scored = memories.map(memory => {
      const contentLower = memory.content.toLowerCase();
      const matchCount = words.filter(word => contentLower.includes(word)).length;
      const keywordMatches = memory.keywords?.filter(kw =>
        words.some(word => kw.toLowerCase().includes(word))
      ).length ?? 0;

      return {
        memory,
        score: matchCount + keywordMatches * 2, // Keywords weighted higher
      };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  async delete(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM memories WHERE id = $1',
      [id]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const result = await query(
      'DELETE FROM memories WHERE user_id = $1',
      [userId]
    );

    return result.rowCount ?? 0;
  }

  async getCount(userId: string): Promise<number> {
    const result = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM memories WHERE user_id = $1',
      [userId]
    );

    return parseInt(result.rows[0].count, 10);
  }

  async pruneOldest(userId: string, keepCount: number = 100): Promise<number> {
    const result = await query(
      `DELETE FROM memories WHERE id IN (
        SELECT id FROM memories
        WHERE user_id = $1
        ORDER BY timestamp DESC
        OFFSET $2
      )`,
      [userId, keepCount]
    );

    return result.rowCount ?? 0;
  }

  private mapRow(row: any): Memory {
    return {
      id: row.id,
      userId: row.user_id,
      content: row.content,
      type: row.type,
      keywords: row.keywords || [],
      timestamp: row.timestamp,
    };
  }
}
