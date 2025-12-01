import type {
  Address,
  Parcel,
  Rate,
  Label,
  TrackingInfo,
  RateRequest,
  LabelRequest,
  AddressValidationResult,
} from '@unified/types';

export interface ShippingProvider {
  readonly name: string;
  getRates(request: RateRequest): Promise<Rate[]>;
  createLabel(request: LabelRequest): Promise<Label>;
  validateAddress(address: Address): Promise<AddressValidationResult>;
  trackShipment(trackingNumber: string): Promise<TrackingInfo>;
  cancelShipment(shipmentId: string): Promise<void>;
}

export abstract class BaseShippingProvider implements ShippingProvider {
  abstract readonly name: string;

  abstract getRates(request: RateRequest): Promise<Rate[]>;
  abstract createLabel(request: LabelRequest): Promise<Label>;
  abstract validateAddress(address: Address): Promise<AddressValidationResult>;
  abstract trackShipment(trackingNumber: string): Promise<TrackingInfo>;
  abstract cancelShipment(shipmentId: string): Promise<void>;

  protected calculateDimensionalWeight(
    parcel: Parcel,
    carrier: string
  ): { billableWeight: number; usedDim: boolean } {
    const DIM_FACTORS: Record<string, number> = {
      fedex: 139,
      ups: 139,
      usps: 166,
      dhl: 139,
    };

    const shouldRoundUp = ['fedex', 'ups'].includes(carrier.toLowerCase());
    const dims = shouldRoundUp
      ? { l: Math.ceil(parcel.length), w: Math.ceil(parcel.width), h: Math.ceil(parcel.height) }
      : { l: parcel.length, w: parcel.width, h: parcel.height };

    const volume = dims.l * dims.w * dims.h;
    const dimFactor = DIM_FACTORS[carrier.toLowerCase()] || 139;
    const dimWeight = Math.ceil(volume / dimFactor);

    return {
      billableWeight: Math.max(parcel.weight, dimWeight),
      usedDim: dimWeight > parcel.weight,
    };
  }

  protected async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxRetries - 1) {
          const delay = baseDelay * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError;
  }
}
