import { BaseShippingProvider } from './base.js';
import type {
  Address,
  Rate,
  Label,
  TrackingInfo,
  TrackingStatus,
  RateRequest,
  LabelRequest,
  AddressValidationResult,
} from '@unified/types';

export interface N8nConfig {
  baseUrl: string;
  intakePath?: string;
  ratesPath?: string;
  bookPath?: string;
  trackingPath?: string;
}

/**
 * N8n Provider
 *
 * Integrates with n8n workflows for shipping operations.
 * This allows using n8n's visual workflow builder to orchestrate
 * multiple carriers and custom business logic.
 */
export class N8nProvider extends BaseShippingProvider {
  readonly name = 'n8n';
  private baseUrl: string;
  private paths: {
    intake: string;
    rates: string;
    book: string;
    tracking: string;
  };

  constructor(config: N8nConfig) {
    super();
    this.baseUrl = config.baseUrl;
    this.paths = {
      intake: config.intakePath || 'typeform-intake',
      rates: config.ratesPath || 'rate-comparison',
      book: config.bookPath || 'book-shipment',
      tracking: config.trackingPath || 'tracking',
    };
  }

  async getRates(request: RateRequest): Promise<Rate[]> {
    const response = await this.webhookRequest(this.paths.rates, {
      origin: this.transformAddress(request.origin),
      destination: this.transformAddress(request.destination),
      parcel: request.parcel,
      customs: request.customs,
    });

    const data: N8nRatesResponse = (await response.json()) as N8nRatesResponse;
    // n8n can return rates from multiple aggregators
    return (data.rates || []).map((r) => this.normalizeRate(r));
  }

  async createLabel(request: LabelRequest): Promise<Label> {
    const response = await this.webhookRequest(this.paths.book, {
      origin: this.transformAddress(request.origin),
      destination: this.transformAddress(request.destination),
      parcel: request.parcel,
      selectedRate: request.rate,
      carrier: request.carrier,
      service: request.service,
    });

    const data: N8nLabelResponse = (await response.json()) as N8nLabelResponse;

    return {
      id: data.shipment_id || data.id,
      provider: this.name,
      trackingNumber: data.tracking_number,
      labelUrl: data.label_url,
      labelFormat: data.label_format || 'PDF',
      rate: request.rate!,
      createdAt: new Date(),
    };
  }

  async validateAddress(address: Address): Promise<AddressValidationResult> {
    // n8n workflows can implement address validation
    // For now, return as valid
    return { valid: true, original: address };
  }

  async trackShipment(trackingNumber: string): Promise<TrackingInfo> {
    const response = await this.webhookRequest(this.paths.tracking, {
      tracking_number: trackingNumber,
    });

    const data: N8nTrackingResponse = (await response.json()) as N8nTrackingResponse;

    return {
      trackingNumber: data.tracking_number || trackingNumber,
      carrier: data.carrier || 'unknown',
      status: this.mapStatus(data.status),
      events: (data.events || []).map((e) => ({
        status: this.mapStatus(e.status),
        message: e.message || e.description,
        datetime: new Date(e.datetime || e.timestamp),
        location: e.location,
      })),
      estimatedDelivery: data.estimated_delivery ? new Date(data.estimated_delivery) : undefined,
    };
  }

  async cancelShipment(shipmentId: string): Promise<void> {
    await this.webhookRequest('cancel-shipment', {
      shipment_id: shipmentId,
    });
  }

  /**
   * Submit a delivery request intake form
   * This is specific to the n8n workflow pattern
   */
  async submitIntake(data: {
    customerName: string;
    email: string;
    phone?: string;
    address: Address;
    parcel: {
      weight: number;
      length?: number;
      width?: number;
      height?: number;
    };
    contents?: string;
    value?: number;
    speedPreference?: string;
    insuranceRequired?: boolean;
  }): Promise<{ shipmentId: string }> {
    const addressData = this.transformAddress(data.address);
    const response = await this.webhookRequest(this.paths.intake, {
      customer_name: data.customerName,
      ...addressData,
      weight_kg: data.parcel.weight,
      length_cm: data.parcel.length,
      width_cm: data.parcel.width,
      height_cm: data.parcel.height,
      contents_description: data.contents,
      declared_value: data.value,
      speed_preference: data.speedPreference,
      insurance_required: data.insuranceRequired,
    });

    const result = (await response.json()) as { shipment_id?: string; id?: string };
    return { shipmentId: result.shipment_id || result.id || '' };
  }

  private async webhookRequest(path: string, data: unknown): Promise<Response> {
    const url = `${this.baseUrl}/${path}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`n8n webhook error: ${response.statusText}`);
    }

    return response;
  }

  private transformAddress(addr: Address) {
    return {
      name: addr.name,
      company: addr.company,
      address_line1: addr.street1,
      address_line2: addr.street2,
      city: addr.city,
      state_region: addr.state,
      postcode: addr.zip,
      country: addr.country,
      phone: addr.phone,
      email: addr.email,
    };
  }

  private normalizeRate(rate: N8nRate): Rate {
    return {
      id: rate.id || rate.rate_id,
      provider: rate.aggregator || rate.provider || this.name,
      carrier: rate.carrier,
      service: rate.service,
      serviceName: rate.service_name || rate.service,
      cost: parseFloat(rate.price || rate.cost || rate.rate),
      currency: rate.currency || 'USD',
      deliveryDays: rate.delivery_days || rate.transit_days,
      deliveryDate: rate.delivery_date,
      guaranteed: rate.guaranteed,
    };
  }

  private mapStatus(status: string): TrackingStatus {
    const normalized = (status || '').toLowerCase().replace(/[_-]/g, '');
    const map: Record<string, TrackingStatus> = {
      pending: 'label_created' as TrackingStatus,
      labelcreated: 'label_created' as TrackingStatus,
      pretransit: 'pre_transit' as TrackingStatus,
      intransit: 'in_transit' as TrackingStatus,
      outfordelivery: 'out_for_delivery' as TrackingStatus,
      delivered: 'delivered' as TrackingStatus,
      returned: 'returned' as TrackingStatus,
      exception: 'exception' as TrackingStatus,
      cancelled: 'cancelled' as TrackingStatus,
    };
    return map[normalized] || ('exception' as TrackingStatus);
  }
}

// Minimal n8n webhook response types
type N8nRate = {
  id?: string;
  rate_id?: string;
  aggregator?: string;
  provider?: string;
  carrier: string;
  service: string;
  service_name?: string;
  price?: string;
  cost?: string;
  rate?: string;
  currency?: string;
  delivery_days?: number;
  transit_days?: number;
  delivery_date?: string;
  guaranteed?: boolean;
};

type N8nRatesResponse = { rates?: N8nRate[] };

type N8nLabelResponse = {
  shipment_id?: string;
  id?: string;
  tracking_number: string;
  label_url: string;
  label_format?: 'PDF' | 'PNG' | 'ZPL';
};

type N8nTrackingEvent = {
  status: string;
  message?: string;
  description?: string;
  datetime?: string;
  timestamp?: string;
  location?: { city?: string; state?: string; country?: string };
};

type N8nTrackingResponse = {
  tracking_number?: string;
  carrier?: string;
  status: string;
  events?: N8nTrackingEvent[];
  estimated_delivery?: string;
};
