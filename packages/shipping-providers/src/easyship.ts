import { BaseShippingProvider } from './base.js';
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

export interface EasyshipConfig {
  apiKey: string;
  mode: 'sandbox' | 'production';
  currency?: string;
  weightUnit?: 'kg' | 'lb';
  dimUnit?: 'cm' | 'in';
  incotermDefault?: 'DDP' | 'DDU';
  ddpRestricted?: string[];
  baseUrlOverride?: string;
  labelFormat?: 'PDF' | 'PNG' | 'ZPL';
}

// Validation error class for detailed error reporting
export class EasyshipValidationError extends Error {
  constructor(
    message: string,
    public field: string,
    public code: string,
  ) {
    super(message);
    this.name = 'EasyshipValidationError';
  }
}

// Countries where DDP is restricted or not recommended
const DEFAULT_DDP_RESTRICTED = ['MX', 'BR', 'AR', 'RU', 'IN', 'ID', 'EG', 'NG'];

// Countries requiring specific documentation
const COUNTRIES_REQUIRING_TAX_ID = ['BR', 'MX', 'AR', 'CL', 'CO', 'PE'];

// Max dimensions by carrier (in inches for consistency)
const MAX_DIMENSIONS = {
  default: { length: 108, width: 108, height: 108, weight: 150 },
  express: { length: 48, width: 48, height: 48, weight: 70 },
};

// ISO 3166-1 alpha-2 country codes (subset for validation)
const VALID_COUNTRY_CODES = new Set([
  'US',
  'CA',
  'GB',
  'DE',
  'FR',
  'IT',
  'ES',
  'NL',
  'BE',
  'AT',
  'CH',
  'SE',
  'NO',
  'DK',
  'FI',
  'IE',
  'PT',
  'GR',
  'PL',
  'CZ',
  'HU',
  'RO',
  'BG',
  'HR',
  'SK',
  'SI',
  'LT',
  'LV',
  'EE',
  'AU',
  'NZ',
  'JP',
  'KR',
  'CN',
  'HK',
  'TW',
  'SG',
  'MY',
  'TH',
  'VN',
  'PH',
  'ID',
  'IN',
  'MX',
  'BR',
  'AR',
  'CL',
  'CO',
  'PE',
  'ZA',
  'AE',
  'SA',
  'IL',
  'TR',
  'RU',
  'UA',
]);

export class EasyshipProvider extends BaseShippingProvider {
  readonly name = 'Easyship';
  private baseUrl: string;
  private usePublicApi: boolean;
  private currency: string;
  private weightUnit: 'kg' | 'lb';
  private dimUnit: 'cm' | 'in';
  private incotermDefault?: 'DDP' | 'DDU';
  private ddpRestricted?: string[];
  private labelFormat?: 'PDF' | 'PNG' | 'ZPL';

  constructor(private config: EasyshipConfig) {
    super();
    this.baseUrl =
      config.baseUrlOverride ||
      (config.mode === 'sandbox' ? 'https://api.easyship.com/sandbox' : 'https://api.easyship.com');
    // If user passes a versioned public API base URL like https://public-api.easyship.com/2024-09
    // prefer the new Public API paths (no "/v2" prefix)
    this.usePublicApi = /public-api\.easyship\.com\/(\d{4}-\d{2})/i.test(this.baseUrl);
    this.currency = config.currency || 'USD';
    this.weightUnit = config.weightUnit || 'lb';
    this.dimUnit = config.dimUnit || 'in';
    this.incotermDefault = config.incotermDefault;
    this.ddpRestricted = config.ddpRestricted?.map((c) => c.toUpperCase());
    this.labelFormat = config.labelFormat;
  }

  private endpoint(pathKey: 'rates' | 'shipments' | 'labels' | 'tracking', id?: string): string {
    if (this.usePublicApi) {
      switch (pathKey) {
        case 'rates':
          return '/rates';
        case 'shipments':
          return '/shipments';
        case 'labels':
          if (!id) throw new Error('labels endpoint requires shipment id');
          return `/labels/${id}`;
        case 'tracking':
          return '/tracking';
      }
    }
    // legacy v2 API paths
    switch (pathKey) {
      case 'rates':
        return '/v2/rates';
      case 'shipments':
        return '/v2/shipments';
      case 'labels':
        if (!id) throw new Error('labels endpoint requires shipment id');
        return `/v2/labels/${id}`;
      case 'tracking':
        return '/v2/tracking';
    }
  }

  async getRates(request: RateRequest): Promise<Rate[]> {
    // Validate all inputs before making API call
    this.validateRequest(request);

    const response = await this.request(this.endpoint('rates'), {
      method: 'POST',
      body: JSON.stringify({
        origin_address: this.transformAddress(request.origin),
        destination_address: this.transformAddress(request.destination),
        incoterms: this.determineIncoterm(request.destination.country),
        parcels: [this.transformParcel(request.parcel)],
        shipping_settings: {
          units: { weight: this.weightUnit, dimensions: this.dimUnit },
          output_currency: this.currency,
        },
        ...(request.customs && { customs: this.transformCustoms(request.customs) }),
      }),
    });

    const data = (await response.json()) as unknown as EasyshipRatesResponse;
    return data.rates.map((r) => this.normalizeRate(r));
  }

  async createLabel(request: LabelRequest): Promise<Label> {
    const shipmentResponse = await this.request(this.endpoint('shipments'), {
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

    const shipment = (await shipmentResponse.json()) as unknown as EasyshipShipment;

    const labelResponse = await this.request(
      this.endpoint('labels', shipment.easyship_shipment_id),
      {
        method: 'POST',
      },
    );

    const label = (await labelResponse.json()) as unknown as EasyshipLabel;

    return {
      id: shipment.easyship_shipment_id,
      provider: this.name,
      trackingNumber: label.tracking_number,
      labelUrl: label.label_url,
      labelFormat: (label.label_format as Label['labelFormat']) || this.labelFormat || 'PDF',
      rate: request.rate!,
      createdAt: new Date(shipment.created_at),
    };
  }

  async validateAddress(address: Address): Promise<AddressValidationResult> {
    // Easyship doesn't have dedicated address validation
    return { valid: true, original: address };
  }

  async trackShipment(trackingNumber: string): Promise<TrackingInfo> {
    const trackingPath = this.usePublicApi
      ? `${this.endpoint('tracking')}?tracking_number=${encodeURIComponent(trackingNumber)}`
      : `${this.endpoint('tracking')}?tracking_number=${encodeURIComponent(trackingNumber)}`;
    const response = await this.request(trackingPath);
    const data = (await response.json()) as unknown as EasyshipTrackingResponse;

    return {
      trackingNumber: data.tracking_number,
      carrier: data.courier_name,
      status: this.mapStatus(data.status),
      events:
        data.checkpoints?.map((cp) => ({
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
    // Public API cancellation path assumed to match legacy; adjust if needed
    const path = this.usePublicApi
      ? `${this.endpoint('shipments')}/${shipmentId}`
      : `/v2/shipments/${shipmentId}`;
    await this.request(path, { method: 'DELETE' });
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
      let details: any = null;
      try {
        details = await response.json();
      } catch (_) {
        // ignore JSON parse errors
      }
      const message = details?.message || details?.error || response.statusText;
      const code = details?.code || details?.error_code || response.status;
      throw new Error(`Easyship API error (${code}): ${message}`);
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

  private transformParcel(parcel: LabelRequest['parcel']) {
    return {
      total_actual_weight: parcel.weight,
      box: {
        length: parcel.length,
        width: parcel.width,
        height: parcel.height,
      },
    };
  }

  private normalizeRate(rate: EasyshipRate): Rate {
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
    const country = (destinationCountry || '').toUpperCase();
    const ddpRestricted = this.ddpRestricted || DEFAULT_DDP_RESTRICTED;
    const defaultIncoterm = this.incotermDefault || 'DDP';
    return ddpRestricted.includes(country) ? 'DDU' : defaultIncoterm;
  }

  /**
   * Comprehensive input validation for rate/label requests
   */
  private validateRequest(request: RateRequest): void {
    const errors: string[] = [];

    // Validate origin address
    errors.push(...this.validateAddressFields(request.origin, 'origin'));

    // Validate destination address
    errors.push(...this.validateAddressFields(request.destination, 'destination'));

    // Validate parcel dimensions and weight
    errors.push(...this.validateParcel(request.parcel));

    // Validate customs info for international shipments
    if (request.origin.country !== request.destination.country) {
      if (request.customs) {
        errors.push(...this.validateCustomsInfo(request.customs, request.destination.country));
      }
    }

    // Check for DDP restrictions and warn
    if (COUNTRIES_REQUIRING_TAX_ID.includes(request.destination.country.toUpperCase())) {
      // Tax ID may be required - this is a soft warning, not an error
      // Could log or emit a warning here
    }

    if (errors.length > 0) {
      throw new EasyshipValidationError(
        `Validation failed: ${errors.join('; ')}`,
        'request',
        'VALIDATION_ERROR',
      );
    }
  }

  /**
   * Validate address fields (internal helper)
   */
  private validateAddressFields(addr: Address, prefix: string): string[] {
    const errors: string[] = [];

    if (!addr.name?.trim()) {
      errors.push(`${prefix}.name is required`);
    }

    if (!addr.street1?.trim()) {
      errors.push(`${prefix}.street1 is required`);
    }

    if (!addr.city?.trim()) {
      errors.push(`${prefix}.city is required`);
    }

    if (!addr.country?.trim()) {
      errors.push(`${prefix}.country is required`);
    } else {
      const countryCode = addr.country.toUpperCase();
      if (!VALID_COUNTRY_CODES.has(countryCode)) {
        errors.push(`${prefix}.country "${countryCode}" is not a valid ISO 3166-1 alpha-2 code`);
      }
    }

    // Postal code required for most countries
    const countriesWithoutPostalCode = ['HK', 'AE', 'SA'];
    if (!addr.zip?.trim() && !countriesWithoutPostalCode.includes(addr.country?.toUpperCase())) {
      errors.push(`${prefix}.zip (postal code) is required for ${addr.country}`);
    }

    // Phone validation (basic - digits and common chars)
    if (addr.phone && !/^[+\d\s\-().]{7,20}$/.test(addr.phone)) {
      errors.push(`${prefix}.phone format is invalid`);
    }

    // Email validation (basic)
    if (addr.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(addr.email)) {
      errors.push(`${prefix}.email format is invalid`);
    }

    return errors;
  }

  /**
   * Validate parcel dimensions and weight
   */
  private validateParcel(parcel: RateRequest['parcel']): string[] {
    const errors: string[] = [];
    const limits = MAX_DIMENSIONS.default;

    if (!parcel.weight || parcel.weight <= 0) {
      errors.push('parcel.weight must be greater than 0');
    } else if (parcel.weight > limits.weight) {
      errors.push(`parcel.weight ${parcel.weight} exceeds maximum ${limits.weight} lbs`);
    }

    if (!parcel.length || parcel.length <= 0) {
      errors.push('parcel.length must be greater than 0');
    } else if (parcel.length > limits.length) {
      errors.push(`parcel.length ${parcel.length} exceeds maximum ${limits.length} inches`);
    }

    if (!parcel.width || parcel.width <= 0) {
      errors.push('parcel.width must be greater than 0');
    } else if (parcel.width > limits.width) {
      errors.push(`parcel.width ${parcel.width} exceeds maximum ${limits.width} inches`);
    }

    if (!parcel.height || parcel.height <= 0) {
      errors.push('parcel.height must be greater than 0');
    } else if (parcel.height > limits.height) {
      errors.push(`parcel.height ${parcel.height} exceeds maximum ${limits.height} inches`);
    }

    return errors;
  }

  /**
   * Validate customs information for international shipments
   */
  private validateCustomsInfo(
    customs: NonNullable<RateRequest['customs']>,
    destCountry: string,
  ): string[] {
    const errors: string[] = [];

    if (!customs.items || customs.items.length === 0) {
      errors.push('customs.items is required for international shipments');
      return errors;
    }

    for (let i = 0; i < customs.items.length; i++) {
      const item = customs.items[i];
      const prefix = `customs.items[${i}]`;

      if (!item.description?.trim()) {
        errors.push(`${prefix}.description is required`);
      } else if (item.description.length > 256) {
        errors.push(`${prefix}.description exceeds 256 characters`);
      }

      if (!item.quantity || item.quantity <= 0) {
        errors.push(`${prefix}.quantity must be greater than 0`);
      }

      if (item.value === undefined || item.value < 0) {
        errors.push(`${prefix}.value must be 0 or greater`);
      }

      if (!item.hsCode?.trim()) {
        errors.push(`${prefix}.hsCode is required for international shipments`);
      } else if (!/^\d{4,10}(\.\d+)?$/.test(item.hsCode.replace(/\./g, ''))) {
        errors.push(
          `${prefix}.hsCode "${item.hsCode}" format is invalid (expected 4-10 digit HS code)`,
        );
      }

      if (!item.originCountry?.trim()) {
        errors.push(`${prefix}.originCountry is required`);
      }
    }

    // Check if DDP is appropriate
    const destUpper = destCountry.toUpperCase();
    if (COUNTRIES_REQUIRING_TAX_ID.includes(destUpper)) {
      // Could add a warning about tax ID requirements
    }

    return errors;
  }

  /**
   * Transform customs info to Easyship format
   */
  private transformCustoms(customs: NonNullable<RateRequest['customs']>) {
    return {
      contents_type: customs.contentsType || 'merchandise',
      contents_explanation: customs.contentsExplanation,
      non_delivery_option: customs.nonDeliveryOption || 'return',
      items: customs.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        declared_value: item.value,
        declared_currency: 'USD',
        weight: item.weight,
        hs_code: item.hsCode,
        origin_country_alpha2: item.originCountry,
      })),
    };
  }

  private mapStatus(status: string): TrackingStatus {
    const map: Record<string, TrackingStatus> = {
      InfoReceived: TrackingStatus.LABEL_CREATED,
      InTransit: TrackingStatus.IN_TRANSIT,
      OutForDelivery: TrackingStatus.OUT_FOR_DELIVERY,
      Delivered: TrackingStatus.DELIVERED,
      AvailableForPickup: TrackingStatus.OUT_FOR_DELIVERY,
      FailedAttempt: TrackingStatus.EXCEPTION,
      Exception: TrackingStatus.EXCEPTION,
    };
    return map[status] ?? TrackingStatus.EXCEPTION;
  }
}

// Minimal Easyship API shapes used
type EasyshipRate = {
  courier_id: string;
  courier_name: string;
  service_level: string;
  total_charge: number;
  currency: string;
  min_delivery_time?: number;
  delivery_date?: string;
};

type EasyshipRatesResponse = { rates: EasyshipRate[] };

type EasyshipShipment = { easyship_shipment_id: string; created_at: string };

type EasyshipLabel = {
  tracking_number: string;
  label_url: string;
  label_format?: 'PDF' | 'PNG' | 'ZPL';
};

type EasyshipTrackingCheckpoint = {
  checkpoint_status: string;
  message: string;
  created_at: string;
  location?: { city?: string; state?: string; country?: string };
};

type EasyshipTrackingResponse = {
  tracking_number: string;
  courier_name: string;
  status: string;
  checkpoints?: EasyshipTrackingCheckpoint[];
  estimated_delivery_date?: string;
};
