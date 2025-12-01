import { query } from '../client.js';
import type { User } from '@unified/types';

export class UserRepository {
  async create(user: Partial<User>): Promise<User> {
    const result = await query<User>(
      `INSERT INTO users (email, name) VALUES ($1, $2) RETURNING *`,
      [user.email, user.name]
    );

    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<User | null> {
    const result = await query<any>(
      'SELECT * FROM users WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findByEmail(email: string): Promise<User | null> {
    const result = await query<any>(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findOrCreate(email: string, name?: string): Promise<User> {
    const existing = await this.findByEmail(email);
    if (existing) return existing;

    return this.create({ email, name });
  }

  async update(id: string, data: Partial<User>): Promise<User | null> {
    const result = await query<any>(
      `UPDATE users SET name = COALESCE($1, name), updated_at = now() WHERE id = $2 RETURNING *`,
      [data.name, id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: any): User {
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
