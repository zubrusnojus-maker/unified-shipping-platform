import { BaseShippingProvider } from './base.js';
import EasyPost from '@easypost/api';
import {
  type Address,
  type Rate,
  type Label,
  type TrackingInfo,
  TrackingStatus,
  type RateRequest,
  type LabelRequest,
  type AddressValidationResult,
} from '@unified/types';

export interface EasyPostConfig {
  apiKey: string;
  mode: 'test' | 'production';
  labelFormat?: 'PDF' | 'PNG' | 'ZPL';
  requireEndShipper?: 'auto' | 'true' | 'false';
  endShipperId?: string;
}

export class EasyPostProvider extends BaseShippingProvider {
  readonly name = 'EasyPost';
  private baseUrl = 'https://api.easypost.com/v2';
  private api?: any;

  constructor(private config: EasyPostConfig) {
    super();
    try {
      // Initialize EasyPost SDK (Node client)
      this.api = new (EasyPost as any)(this.config.apiKey);
    } catch {
      this.api = undefined;
    }
  }

  async getRates(request: RateRequest): Promise<Rate[]> {
    const shipment = await this.createShipment(request);
    return shipment.rates.map((r) => this.normalizeRate(r));
  }

  async createLabel(request: LabelRequest): Promise<Label> {
    const shipment = await this.createShipment(request);
    const selectedEpRate = request.rate ? undefined : this.selectBestRate(shipment.rates, request);
    const normalizedRate = request.rate ?? this.normalizeRate(selectedEpRate!);

    const endShipperId = await this.maybeEnsureEndShipperId(request.origin, normalizedRate);
    const rateIdForBuy = request.rate?.id ?? selectedEpRate!.id;
    const purchased = await this.buyShipment(shipment.id, rateIdForBuy, endShipperId);

    return {
      id: purchased.id,
      provider: this.name,
      trackingNumber: purchased.tracking_code,
      labelUrl: purchased.postage_label.label_url,
      labelFormat: this.config.labelFormat || 'PDF',
      rate: normalizedRate,
      createdAt: new Date(purchased.created_at),
    };
  }

  async validateAddress(address: Address): Promise<AddressValidationResult> {
    // Prefer SDK for verification; fallback to REST if unavailable
    if (this.api?.Address) {
      try {
        const payload = { ...this.transformAddress(address) };
        // Most SDK versions accept a verify flag on create
        const created = await (this.api.Address.create?.({ ...payload, verify: ['delivery'] }) ??
          new this.api.Address({ ...payload, verify: ['delivery'] }).save());
        const verifications = (created?.verifications ||
          {}) as EasyPostAddressVerificationResponse['verifications'];
        const delivery = verifications?.delivery;
        return {
          valid: !delivery?.errors?.length,
          original: address,
          suggested: delivery?.success
            ? this.reverseTransformAddress(created as unknown as EasyPostAddress)
            : undefined,
          errors: delivery?.errors?.map((e: any) => e.message),
        };
      } catch {
        // fall through to REST
      }
    }

    const response = await this.request('/addresses', {
      method: 'POST',
      body: JSON.stringify({ address: this.transformAddress(address), verify: ['delivery'] }),
    });

    const data = (await response.json()) as unknown as EasyPostAddressVerificationResponse;

    return {
      valid: !data.verifications?.delivery?.errors?.length,
      original: address,
      suggested: data.verifications?.delivery?.success
        ? this.reverseTransformAddress(data as unknown as EasyPostAddress)
        : undefined,
      errors: data.verifications?.delivery?.errors?.map((e) => e.message),
    };
  }

  async trackShipment(trackingNumber: string): Promise<TrackingInfo> {
    // Try SDK first (create/retrieve tracker), then REST fallback
    if (this.api?.Tracker) {
      try {
        const tracker = await (this.api.Tracker.retrieve?.(trackingNumber) ??
          this.api.Tracker.create?.({ tracking_code: trackingNumber }) ??
          new this.api.Tracker({ tracking_code: trackingNumber }).save());

        const data = tracker as EasyPostTracker;
        return {
          trackingNumber: data.tracking_code,
          carrier: (data as any).carrier,
          status: this.mapStatus((data as any).status),
          events:
            (data as any).tracking_details?.map((e: any) => ({
              status: this.mapStatus(e.status),
              message: e.message,
              datetime: new Date(e.datetime),
              location: e.tracking_location,
            })) || [],
          estimatedDelivery: (data as any).est_delivery_date
            ? new Date((data as any).est_delivery_date)
            : undefined,
        };
      } catch {
        // fall through to REST
      }
    }

    const response = await this.request(`/trackers/${trackingNumber}`);
    const data = (await response.json()) as unknown as EasyPostTracker;

    return {
      trackingNumber: data.tracking_code,
      carrier: data.carrier,
      status: this.mapStatus(data.status),
      events: data.tracking_details.map((e) => ({
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

  private async createShipment(request: RateRequest): Promise<EasyPostShipment> {
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

    return (await response.json()) as unknown as EasyPostShipment;
  }

  private async buyShipment(
    shipmentId: string,
    rateId: string,
    endShipperId?: string,
  ): Promise<EasyPostPurchased> {
    // Prefer SDK if available; fallback to REST
    if (this.api?.Shipment) {
      try {
        const shipment = await (this.api.Shipment.retrieve?.(shipmentId) ??
          new this.api.Shipment({ id: shipmentId }).save());
        const purchased = await (shipment.buy?.({
          rate: { id: rateId },
          ...(endShipperId ? { end_shipper_id: endShipperId } : {}),
        }) ??
          this.api.Shipment.buy?.(
            shipmentId,
            { id: rateId },
            endShipperId ? { end_shipper_id: endShipperId } : undefined,
          ));
        return purchased as EasyPostPurchased;
      } catch {
        // fall through to REST
      }
    }

    const response = await this.request(`/shipments/${shipmentId}/buy`, {
      method: 'POST',
      body: JSON.stringify({
        rate: { id: rateId },
        ...(endShipperId ? { end_shipper_id: endShipperId } : {}),
      }),
    });

    return (await response.json()) as unknown as EasyPostPurchased;
  }

  private endShipperCache?: string;

  private requiresEndShipper(carrier?: string, service?: string): boolean {
    const pref = (this.config.requireEndShipper || 'auto').toLowerCase();
    if (pref === 'true') return true;
    if (pref === 'false') return false;
    const s = (service || '').toLowerCase();
    const c = (carrier || '').toLowerCase();
    return s.includes('usaexport') || c.includes('pba');
  }

  private async maybeEnsureEndShipperId(origin: Address, rate: Rate): Promise<string | undefined> {
    if (!this.requiresEndShipper(rate.carrier, rate.service)) return undefined;
    if (this.config.endShipperId) return this.config.endShipperId;
    if (this.endShipperCache) return this.endShipperCache;

    const payload = {
      name: origin.name,
      company: origin.company,
      street1: origin.street1,
      street2: origin.street2,
      city: origin.city,
      state: origin.state,
      zip: origin.zip,
      country: origin.country,
      phone: origin.phone,
      email: origin.email,
    };

    // Basic guard: EasyPost requires name or company
    if (!payload.name && !payload.company) {
      throw new Error('EndShipper required but origin.name or origin.company is missing');
    }

    // Try SDK for EndShipper, fallback to REST
    if (this.api?.EndShipper) {
      try {
        const created = await (this.api.EndShipper.create?.(payload) ??
          new this.api.EndShipper(payload).save());
        const id = (created as any)?.id as string | undefined;
        if (id) {
          this.endShipperCache = id;
          return id;
        }
      } catch {
        // fall through to REST
      }
    }

    const res = await this.request('/end_shippers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as unknown as { id?: string };
    if (!data?.id) {
      throw new Error('Failed to create EasyPost EndShipper');
    }
    this.endShipperCache = data.id;
    return data.id;
  }

  private async request(path: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = (await response.json()) as unknown as { error?: { message?: string } };
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

  private reverseTransformAddress(data: EasyPostAddress): Address {
    return {
      name: data.name ?? '',
      company: data.company,
      street1: data.street1 ?? '',
      street2: data.street2,
      city: data.city ?? '',
      state: data.state ?? '',
      zip: data.zip ?? '',
      country: data.country ?? '',
      phone: data.phone,
      email: data.email,
    };
  }

  private transformParcel(parcel: LabelRequest['parcel']) {
    return {
      length: parcel.length,
      width: parcel.width,
      height: parcel.height,
      weight: parcel.weight,
    };
  }

  private transformCustoms(customs: NonNullable<RateRequest['customs']>) {
    return {
      contents_type: customs.contentsType,
      contents_explanation: customs.contentsExplanation,
      customs_certify: customs.customsCertify,
      customs_signer: customs.customsSigner,
      non_delivery_option: customs.nonDeliveryOption,
      restriction_type: customs.restriction,
      eel_pfc: customs.eelPfc,
      customs_items: customs.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        value: item.value,
        weight: item.weight,
        hs_tariff_number: item.hsCode,
        origin_country: item.originCountry,
      })),
    };
  }

  private normalizeRate(rate: EasyPostRate): Rate {
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

  private selectBestRate(rates: EasyPostRate[], request: LabelRequest): EasyPostRate {
    if (request.carrier && request.service) {
      const found = rates.find(
        (r) =>
          r.carrier.toLowerCase() === request.carrier!.toLowerCase() &&
          r.service.toLowerCase() === request.service!.toLowerCase(),
      );
      if (!found) {
        throw new Error(
          `No rate found for carrier "${request.carrier}" and service "${request.service}"`,
        );
      }
      return found;
    }
    const sorted = rates.sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate));
    if (!sorted.length) {
      throw new Error('No rates available for this shipment');
    }
    return sorted[0];
  }

  private mapStatus(status: string): TrackingStatus {
    const map: Record<string, TrackingStatus> = {
      unknown: TrackingStatus.LABEL_CREATED,
      pre_transit: TrackingStatus.PRE_TRANSIT,
      in_transit: TrackingStatus.IN_TRANSIT,
      out_for_delivery: TrackingStatus.OUT_FOR_DELIVERY,
      delivered: TrackingStatus.DELIVERED,
      returned: TrackingStatus.RETURNED,
      failure: TrackingStatus.EXCEPTION,
      cancelled: TrackingStatus.CANCELLED,
    };
    return map[status.toLowerCase()] ?? TrackingStatus.EXCEPTION;
  }
}

// Minimal EasyPost API shapes used by this provider
type EasyPostAddress = {
  name?: string;
  company?: string;
  street1?: string;
  street2?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  email?: string;
};

type EasyPostAddressVerificationResponse = {
  verifications?: {
    delivery?: {
      success?: boolean;
      errors?: Array<{ message: string }>;
    };
  };
} & EasyPostAddress;

type EasyPostRate = {
  id: string;
  carrier: string;
  service: string;
  rate: string;
  currency: string;
  delivery_days?: number;
  delivery_date?: string;
  delivery_date_guaranteed?: boolean;
};

type EasyPostShipment = {
  id: string;
  rates: EasyPostRate[];
};

type EasyPostPurchased = {
  id: string;
  tracking_code: string;
  created_at: string;
  postage_label: { label_url: string };
};

type EasyPostTracker = {
  tracking_code: string;
  carrier: string;
  status: string;
  tracking_details: Array<{
    status: string;
    message: string;
    datetime: string;
    tracking_location?: { city?: string; state?: string; country?: string };
  }>;
  est_delivery_date?: string;
};
