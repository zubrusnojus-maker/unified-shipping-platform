import { query } from '../client.js';
import type { AgentTaskData, AgentTaskResult, JobStatus } from '@unified/types';

interface AgentTaskRecord {
  id: string;
  userId?: string;
  taskData: AgentTaskData;
  status: JobStatus['status'];
  progress: number;
  result?: AgentTaskResult;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class AgentTaskRepository {
  async create(userId: string | null, taskData: AgentTaskData): Promise<AgentTaskRecord> {
    const result = await query<any>(
      `INSERT INTO agent_tasks (user_id, task_data, status, progress)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [userId, JSON.stringify(taskData), 'waiting', 0]
    );

    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<AgentTaskRecord | null> {
    const result = await query<any>(
      'SELECT * FROM agent_tasks WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findByUserId(userId: string): Promise<AgentTaskRecord[]> {
    const result = await query<any>(
      'SELECT * FROM agent_tasks WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  async findRecent(limit: number = 50): Promise<AgentTaskRecord[]> {
    const result = await query<any>(
      'SELECT * FROM agent_tasks ORDER BY created_at DESC LIMIT $1',
      [limit]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  async updateStatus(id: string, status: JobStatus['status'], progress?: number): Promise<AgentTaskRecord | null> {
    const result = await query<any>(
      `UPDATE agent_tasks SET
        status = $1,
        progress = COALESCE($2, progress),
        updated_at = now()
      WHERE id = $3 RETURNING *`,
      [status, progress, id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async updateProgress(id: string, progress: number): Promise<AgentTaskRecord | null> {
    const result = await query<any>(
      `UPDATE agent_tasks SET progress = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [progress, id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async complete(id: string, result: AgentTaskResult): Promise<AgentTaskRecord | null> {
    const dbResult = await query<any>(
      `UPDATE agent_tasks SET
        status = 'completed',
        progress = 100,
        result = $1,
        updated_at = now()
      WHERE id = $2 RETURNING *`,
      [JSON.stringify(result), id]
    );

    if (dbResult.rows.length === 0) return null;
    return this.mapRow(dbResult.rows[0]);
  }

  async fail(id: string, error: string): Promise<AgentTaskRecord | null> {
    const result = await query<any>(
      `UPDATE agent_tasks SET
        status = 'failed',
        error = $1,
        updated_at = now()
      WHERE id = $2 RETURNING *`,
      [error, id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const result = await query(
      'DELETE FROM agent_tasks WHERE id = $1',
      [id]
    );

    return (result.rowCount ?? 0) > 0;
  }

  async cleanupOld(daysOld: number = 7): Promise<number> {
    const result = await query(
      `DELETE FROM agent_tasks WHERE created_at < now() - interval '1 day' * $1`,
      [daysOld]
    );

    return result.rowCount ?? 0;
  }

  private mapRow(row: any): AgentTaskRecord {
    return {
      id: row.id,
      userId: row.user_id,
      taskData: row.task_data,
      status: row.status,
      progress: row.progress,
      result: row.result,
      error: row.error,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
