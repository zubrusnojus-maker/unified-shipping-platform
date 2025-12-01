import { query } from '../client.js';
import type { Conversation, ChatMessage } from '@unified/types';

export class ConversationRepository {
  async create(userId: string): Promise<Conversation> {
    const result = await query<any>(
      `INSERT INTO conversations (user_id, messages) VALUES ($1, $2) RETURNING *`,
      [userId, JSON.stringify([])]
    );

    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<Conversation | null> {
    const result = await query<any>(
      'SELECT * FROM conversations WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findByUserId(userId: string): Promise<Conversation[]> {
    const result = await query<any>(
      'SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  async findOrCreate(userId: string, conversationId?: string): Promise<Conversation> {
    if (conversationId) {
      const existing = await this.findById(conversationId);
      if (existing && existing.userId === userId) return existing;
    }

    return this.create(userId);
  }

  async addMessage(id: string, message: ChatMessage): Promise<Conversation | null> {
    // Get current messages
    const conv = await this.findById(id);
    if (!conv) return null;

    // Add new message and keep last 50
    const messages = [...conv.messages, message].slice(-50);

    const result = await query<any>(
      `UPDATE conversations SET messages = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [JSON.stringify(messages), id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async getRecentMessages(id: string, limit: number = 10): Promise<ChatMessage[]> {
    const conv = await this.findById(id);
    if (!conv) return [];

    return conv.messages.slice(-limit);
  }

  async delete(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM conversations WHERE id = $1',
      [id]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const result = await query(
      'DELETE FROM conversations WHERE user_id = $1',
      [userId]
    );

    return result.rowCount ?? 0;
  }

  private mapRow(row: any): Conversation {
    return {
      id: row.id,
      userId: row.user_id,
      messages: row.messages || [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
