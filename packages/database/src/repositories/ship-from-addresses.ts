import { query } from '../client.js';
import type { ShipFromAddress, Address } from '@unified/types';

export class ShipFromAddressRepository {
  async create(
    userId: string,
    address: Omit<Address, 'id'> & { isDefault?: boolean },
  ): Promise<ShipFromAddress> {
    // If this is marked as default, unset any existing defaults for this user
    if (address.isDefault) {
      await this.unsetAllDefaults(userId);
    }

    const result = await query<any>(
      `INSERT INTO ship_from_addresses (
        user_id, name, company, street1, street2, city, state, zip, country, phone, email, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        userId,
        address.name,
        address.company,
        address.street1,
        address.street2,
        address.city,
        address.state,
        address.zip,
        address.country,
        address.phone,
        address.email,
        address.isDefault ?? false,
      ],
    );

    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<ShipFromAddress | null> {
    const result = await query<any>('SELECT * FROM ship_from_addresses WHERE id = $1', [id]);

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findByUserId(userId: string): Promise<ShipFromAddress[]> {
    const result = await query<any>(
      'SELECT * FROM ship_from_addresses WHERE user_id = $1 ORDER BY is_default DESC, created_at DESC',
      [userId],
    );

    return result.rows.map((row) => this.mapRow(row));
  }

  async findDefault(userId: string): Promise<ShipFromAddress | null> {
    const result = await query<any>(
      'SELECT * FROM ship_from_addresses WHERE user_id = $1 AND is_default = true LIMIT 1',
      [userId],
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async update(
    id: string,
    address: Partial<Omit<Address, 'id'> & { isDefault?: boolean }>,
  ): Promise<ShipFromAddress | null> {
    // If this is being set as default, unset other defaults
    if (address.isDefault) {
      const existing = await this.findById(id);
      if (existing?.userId) {
        await this.unsetAllDefaults(existing.userId);
      }
    }

    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (address.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(address.name);
    }
    if (address.company !== undefined) {
      fields.push(`company = $${paramIndex++}`);
      values.push(address.company);
    }
    if (address.street1 !== undefined) {
      fields.push(`street1 = $${paramIndex++}`);
      values.push(address.street1);
    }
    if (address.street2 !== undefined) {
      fields.push(`street2 = $${paramIndex++}`);
      values.push(address.street2);
    }
    if (address.city !== undefined) {
      fields.push(`city = $${paramIndex++}`);
      values.push(address.city);
    }
    if (address.state !== undefined) {
      fields.push(`state = $${paramIndex++}`);
      values.push(address.state);
    }
    if (address.zip !== undefined) {
      fields.push(`zip = $${paramIndex++}`);
      values.push(address.zip);
    }
    if (address.country !== undefined) {
      fields.push(`country = $${paramIndex++}`);
      values.push(address.country);
    }
    if (address.phone !== undefined) {
      fields.push(`phone = $${paramIndex++}`);
      values.push(address.phone);
    }
    if (address.email !== undefined) {
      fields.push(`email = $${paramIndex++}`);
      values.push(address.email);
    }
    if (address.isDefault !== undefined) {
      fields.push(`is_default = $${paramIndex++}`);
      values.push(address.isDefault);
    }

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push(`updated_at = now()`);
    values.push(id);

    const result = await query<any>(
      `UPDATE ship_from_addresses SET ${fields.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values,
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async delete(id: string): Promise<boolean> {
    const result = await query<any>('DELETE FROM ship_from_addresses WHERE id = $1', [id]);

    return (result.rowCount ?? 0) > 0;
  }

  async setDefault(id: string): Promise<ShipFromAddress | null> {
    const address = await this.findById(id);
    if (!address || !address.userId) return null;

    await this.unsetAllDefaults(address.userId);

    const result = await query<any>(
      `UPDATE ship_from_addresses SET is_default = true, updated_at = now() WHERE id = $1 RETURNING *`,
      [id],
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  private async unsetAllDefaults(userId: string): Promise<void> {
    await query(
      'UPDATE ship_from_addresses SET is_default = false WHERE user_id = $1 AND is_default = true',
      [userId],
    );
  }

  private mapRow(row: any): ShipFromAddress {
    return {
      id: row.id,
      userId: row.user_id,
      name: row.name,
      company: row.company,
      street1: row.street1,
      street2: row.street2,
      city: row.city,
      state: row.state,
      zip: row.zip,
      country: row.country,
      phone: row.phone,
      email: row.email,
      isDefault: row.is_default,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
