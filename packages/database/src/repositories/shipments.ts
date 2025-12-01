import { query } from '../client.js';
import type { Shipment, ShipmentStatus, Rate } from '@unified/types';

export class ShipmentRepository {
  async create(shipment: Partial<Shipment>): Promise<Shipment> {
    const result = await query<Shipment>(
      `INSERT INTO shipments (
        user_id, customer_name, email, phone,
        address_line1, address_line2, city, state_region, postcode, country,
        weight_kg, length_cm, width_cm, height_cm,
        contents_description, declared_value, currency,
        speed_preference, insurance_required, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *`,
      [
        shipment.userId,
        shipment.customerName,
        shipment.email,
        shipment.phone,
        shipment.addressLine1,
        shipment.addressLine2,
        shipment.city,
        shipment.stateRegion,
        shipment.postcode,
        shipment.country,
        shipment.weightKg,
        shipment.lengthCm,
        shipment.widthCm,
        shipment.heightCm,
        shipment.contentsDescription,
        shipment.declaredValue,
        shipment.currency,
        shipment.speedPreference,
        shipment.insuranceRequired ?? false,
        shipment.status ?? 'pending',
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  async findById(id: string): Promise<Shipment | null> {
    const result = await query<any>(
      'SELECT * FROM shipments WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async findByUserId(userId: string): Promise<Shipment[]> {
    const result = await query<any>(
      'SELECT * FROM shipments WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  async findByTrackingNumber(trackingNumber: string): Promise<Shipment | null> {
    const result = await query<any>(
      'SELECT * FROM shipments WHERE tracking_number = $1',
      [trackingNumber]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async updateStatus(id: string, status: ShipmentStatus): Promise<Shipment | null> {
    const result = await query<any>(
      `UPDATE shipments SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async updateQuotes(id: string, quotes: Rate[]): Promise<Shipment | null> {
    const result = await query<any>(
      `UPDATE shipments SET quotes_json = $1, status = 'quoted', updated_at = now() WHERE id = $2 RETURNING *`,
      [JSON.stringify(quotes), id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  async updateBooking(
    id: string,
    data: {
      chosenAggregator: string;
      chosenService: string;
      chosenPrice: number;
      chosenCurrency: string;
      trackingNumber?: string;
      labelUrl?: string;
      providerCarrier?: string;
    }
  ): Promise<Shipment | null> {
    const result = await query<any>(
      `UPDATE shipments SET
        chosen_aggregator = $1,
        chosen_service = $2,
        chosen_price = $3,
        chosen_currency = $4,
        tracking_number = $5,
        label_url = $6,
        provider_carrier = $7,
        status = 'booked',
        updated_at = now()
      WHERE id = $8 RETURNING *`,
      [
        data.chosenAggregator,
        data.chosenService,
        data.chosenPrice,
        data.chosenCurrency,
        data.trackingNumber,
        data.labelUrl,
        data.providerCarrier,
        id,
      ]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  private mapRow(row: any): Shipment {
    return {
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      customerName: row.customer_name,
      email: row.email,
      phone: row.phone,
      addressLine1: row.address_line1,
      addressLine2: row.address_line2,
      city: row.city,
      stateRegion: row.state_region,
      postcode: row.postcode,
      country: row.country,
      weightKg: row.weight_kg ? parseFloat(row.weight_kg) : undefined,
      lengthCm: row.length_cm ? parseFloat(row.length_cm) : undefined,
      widthCm: row.width_cm ? parseFloat(row.width_cm) : undefined,
      heightCm: row.height_cm ? parseFloat(row.height_cm) : undefined,
      contentsDescription: row.contents_description,
      declaredValue: row.declared_value ? parseFloat(row.declared_value) : undefined,
      currency: row.currency,
      speedPreference: row.speed_preference,
      insuranceRequired: row.insurance_required,
      quotesJson: row.quotes_json,
      chosenAggregator: row.chosen_aggregator,
      chosenService: row.chosen_service,
      chosenPrice: row.chosen_price ? parseFloat(row.chosen_price) : undefined,
      chosenCurrency: row.chosen_currency,
      trackingNumber: row.tracking_number,
      labelUrl: row.label_url,
      providerCarrier: row.provider_carrier,
      status: row.status,
    };
  }
}
