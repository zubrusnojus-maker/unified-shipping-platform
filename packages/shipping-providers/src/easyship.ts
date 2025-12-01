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

export interface EasyshipConfig {
  apiKey: string;
  mode: 'sandbox' | 'production';
}

export class EasyshipProvider extends BaseShippingProvider {
  readonly name = 'Easyship';
  private baseUrl: string;

  constructor(private config: EasyshipConfig) {
    super();
    this.baseUrl = config.mode === 'sandbox'
      ? 'https://api.easyship.com/sandbox'
      : 'https://api.easyship.com';
  }

  async getRates(request: RateRequest): Promise<Rate[]> {
    const response = await this.request('/v2/rates', {
      method: 'POST',
      body: JSON.stringify({
        origin_address: this.transformAddress(request.origin),
        destination_address: this.transformAddress(request.destination),
        incoterms: this.determineIncoterm(request.destination.country),
        parcels: [this.transformParcel(request.parcel)],
        shipping_settings: {
          units: { weight: 'lb', dimensions: 'in' },
          output_currency: 'USD',
        },
      }),
    });

    const data = await response.json();
    return data.rates.map((r: any) => this.normalizeRate(r));
  }

  async createLabel(request: LabelRequest): Promise<Label> {
    const shipmentResponse = await this.request('/v2/shipments', {
      method: 'POST',
      body: JSON.stringify({
        origin_address: this.transformAddress(request.origin),
        destination_address: this.transformAddress(request.destination),
        parcels: [this.transformParcel(request.parcel)],
        incoterms: this.determineIncoterm(request.destination.country),
        courier_selection: {
          selected_courier_id: request.rate?.id,
        },
      }),
    });

    const shipment = await shipmentResponse.json();

    const labelResponse = await this.request(`/v2/labels/${shipment.easyship_shipment_id}`, {
      method: 'POST',
    });

    const label = await labelResponse.json();

    return {
      id: shipment.easyship_shipment_id,
      provider: this.name,
      trackingNumber: label.tracking_number,
      labelUrl: label.label_url,
      labelFormat: 'PDF',
      rate: request.rate!,
      createdAt: new Date(shipment.created_at),
    };
  }

  async validateAddress(address: Address): Promise<AddressValidationResult> {
    // Easyship doesn't have dedicated address validation
    return { valid: true, original: address };
  }

  async trackShipment(trackingNumber: string): Promise<TrackingInfo> {
    const response = await this.request(`/v2/tracking?tracking_number=${trackingNumber}`);
    const data = await response.json();

    return {
      trackingNumber: data.tracking_number,
      carrier: data.courier_name,
      status: this.mapStatus(data.status),
      events: data.checkpoints?.map((cp: any) => ({
        status: this.mapStatus(cp.checkpoint_status),
        message: cp.message,
        datetime: new Date(cp.created_at),
        location: cp.location,
      })) || [],
      estimatedDelivery: data.estimated_delivery_date
        ? new Date(data.estimated_delivery_date)
        : undefined,
    };
  }

  async cancelShipment(shipmentId: string): Promise<void> {
    await this.request(`/v2/shipments/${shipmentId}`, { method: 'DELETE' });
  }

  private async request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`Easyship API error: ${error.message || response.statusText}`);
    }

    return response;
  }

  private transformAddress(addr: Address) {
    return {
      line_1: addr.street1,
      line_2: addr.street2,
      city: addr.city,
      state: addr.state,
      postal_code: addr.zip,
      country_alpha2: addr.country,
      contact_name: addr.name,
      company_name: addr.company,
      contact_phone: addr.phone,
      contact_email: addr.email,
    };
  }

  private transformParcel(parcel: any) {
    return {
      total_actual_weight: parcel.weight,
      box: {
        length: parcel.length,
        width: parcel.width,
        height: parcel.height,
      },
    };
  }

  private normalizeRate(rate: any): Rate {
    return {
      id: rate.courier_id,
      provider: this.name,
      carrier: rate.courier_name,
      service: rate.service_level,
      serviceName: `${rate.courier_name} ${rate.service_level}`,
      cost: rate.total_charge,
      currency: rate.currency,
      deliveryDays: rate.min_delivery_time,
    };
  }

  private determineIncoterm(destinationCountry: string): 'DDP' | 'DDU' {
    // DDP restricted countries (Importer of Record restrictions)
    const DDP_RESTRICTED = ['MX', 'BR', 'AR'];
    return DDP_RESTRICTED.includes(destinationCountry) ? 'DDU' : 'DDP';
  }

  private mapStatus(status: string): TrackingStatus {
    const map: Record<string, TrackingStatus> = {
      'InfoReceived': 'label_created' as TrackingStatus,
      'InTransit': 'in_transit' as TrackingStatus,
      'OutForDelivery': 'out_for_delivery' as TrackingStatus,
      'Delivered': 'delivered' as TrackingStatus,
      'AvailableForPickup': 'out_for_delivery' as TrackingStatus,
      'FailedAttempt': 'exception' as TrackingStatus,
      'Exception': 'exception' as TrackingStatus,
    };
    return map[status] || ('exception' as TrackingStatus);
  }
}
