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

export interface EasyPostConfig {
  apiKey: string;
  mode: 'test' | 'production';
}

export class EasyPostProvider extends BaseShippingProvider {
  readonly name = 'EasyPost';
  private baseUrl = 'https://api.easypost.com/v2';

  constructor(private config: EasyPostConfig) {
    super();
  }

  async getRates(request: RateRequest): Promise<Rate[]> {
    const shipment = await this.createShipment(request);
    return shipment.rates.map((r: any) => this.normalizeRate(r));
  }

  async createLabel(request: LabelRequest): Promise<Label> {
    const shipment = await this.createShipment(request);
    const rate = request.rate || this.selectBestRate(shipment.rates, request);

    const purchased = await this.buyShipment(shipment.id, rate.id!);

    return {
      id: purchased.id,
      provider: this.name,
      trackingNumber: purchased.tracking_code,
      labelUrl: purchased.postage_label.label_url,
      labelFormat: 'PDF',
      rate,
      createdAt: new Date(purchased.created_at),
    };
  }

  async validateAddress(address: Address): Promise<AddressValidationResult> {
    const response = await this.request('/addresses', {
      method: 'POST',
      body: JSON.stringify({ address: this.transformAddress(address), verify: ['delivery'] }),
    });

    const data: any = await response.json();

    return {
      valid: !data.verifications?.delivery?.errors?.length,
      original: address,
      suggested: data.verifications?.delivery?.success ? this.reverseTransformAddress(data) : undefined,
      errors: data.verifications?.delivery?.errors?.map((e: any) => e.message),
    };
  }

  async trackShipment(trackingNumber: string): Promise<TrackingInfo> {
    const response = await this.request(`/trackers/${trackingNumber}`);
    const data: any = await response.json();

    return {
      trackingNumber: data.tracking_code,
      carrier: data.carrier,
      status: this.mapStatus(data.status),
      events: data.tracking_details.map((e: any) => ({
        status: this.mapStatus(e.status),
        message: e.message,
        datetime: new Date(e.datetime),
        location: e.tracking_location,
      })),
      estimatedDelivery: data.est_delivery_date ? new Date(data.est_delivery_date) : undefined,
    };
  }

  async cancelShipment(shipmentId: string): Promise<void> {
    await this.request(`/shipments/${shipmentId}/refund`, { method: 'POST' });
  }

  private async createShipment(request: RateRequest): Promise<any> {
    const response = await this.request('/shipments', {
      method: 'POST',
      body: JSON.stringify({
        shipment: {
          from_address: this.transformAddress(request.origin),
          to_address: this.transformAddress(request.destination),
          parcel: this.transformParcel(request.parcel),
          customs_info: request.customs ? this.transformCustoms(request.customs) : undefined,
        },
      }),
    });

    return response.json() as Promise<any>;
  }

  private async buyShipment(shipmentId: string, rateId: string): Promise<any> {
    const response = await this.request(`/shipments/${shipmentId}/buy`, {
      method: 'POST',
      body: JSON.stringify({ rate: { id: rateId } }),
    });

    return response.json() as Promise<any>;
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
      const error: any = await response.json();
      throw new Error(`EasyPost API error: ${error.error?.message || response.statusText}`);
    }

    return response;
  }

  private transformAddress(addr: Address) {
    return {
      name: addr.name,
      company: addr.company,
      street1: addr.street1,
      street2: addr.street2,
      city: addr.city,
      state: addr.state,
      zip: addr.zip,
      country: addr.country,
      phone: addr.phone,
      email: addr.email,
    };
  }

  private reverseTransformAddress(data: any): Address {
    return {
      name: data.name,
      company: data.company,
      street1: data.street1,
      street2: data.street2,
      city: data.city,
      state: data.state,
      zip: data.zip,
      country: data.country,
      phone: data.phone,
      email: data.email,
    };
  }

  private transformParcel(parcel: any) {
    return {
      length: parcel.length,
      width: parcel.width,
      height: parcel.height,
      weight: parcel.weight,
    };
  }

  private transformCustoms(customs: any) {
    return {
      contents_type: customs.contentsType,
      contents_explanation: customs.contentsExplanation,
      customs_certify: customs.customsCertify,
      customs_signer: customs.customsSigner,
      non_delivery_option: customs.nonDeliveryOption,
      restriction_type: customs.restriction,
      eel_pfc: customs.eelPfc,
      customs_items: customs.items.map((item: any) => ({
        description: item.description,
        quantity: item.quantity,
        value: item.value,
        weight: item.weight,
        hs_tariff_number: item.hsCode,
        origin_country: item.originCountry,
      })),
    };
  }

  private normalizeRate(rate: any): Rate {
    return {
      id: rate.id,
      provider: this.name,
      carrier: rate.carrier,
      service: rate.service,
      serviceName: rate.service,
      cost: parseFloat(rate.rate),
      currency: rate.currency,
      deliveryDays: rate.delivery_days,
      deliveryDate: rate.delivery_date,
      guaranteed: rate.delivery_date_guaranteed,
    };
  }

  private selectBestRate(rates: any[], request: LabelRequest): any {
    if (request.carrier && request.service) {
      return rates.find(r =>
        r.carrier.toLowerCase() === request.carrier!.toLowerCase() &&
        r.service.toLowerCase() === request.service!.toLowerCase()
      );
    }
    return rates.sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate))[0];
  }

  private mapStatus(status: string): TrackingStatus {
    const map: Record<string, TrackingStatus> = {
      'unknown': 'label_created' as TrackingStatus,
      'pre_transit': 'pre_transit' as TrackingStatus,
      'in_transit': 'in_transit' as TrackingStatus,
      'out_for_delivery': 'out_for_delivery' as TrackingStatus,
      'delivered': 'delivered' as TrackingStatus,
      'returned': 'returned' as TrackingStatus,
      'failure': 'exception' as TrackingStatus,
      'cancelled': 'cancelled' as TrackingStatus,
    };
    return map[status.toLowerCase()] || ('exception' as TrackingStatus);
  }
}
