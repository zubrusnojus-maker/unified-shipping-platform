/**
 * Shipping Types
 * Unified types for shipping operations across all providers
 */

export interface Address {
  name: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface ShipFromAddress extends Address {
  id: string;
  userId?: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Parcel {
  length: number;
  width: number;
  height: number;
  weight: number;
  unit?: 'in' | 'cm';
  weightUnit?: 'lb' | 'kg';
}

export interface CustomsItem {
  description: string;
  quantity: number;
  value: number;
  weight: number;
  hsCode: string;
  originCountry: string;
}

export interface CustomsInfo {
  contentsType: 'merchandise' | 'gift' | 'sample' | 'documents' | 'returned_goods';
  contentsExplanation?: string;
  customsCertify: boolean;
  customsSigner: string;
  nonDeliveryOption: 'return' | 'abandon';
  restriction: 'none' | 'quarantine' | 'sanitary_phytosanitary_inspection' | 'other';
  items: CustomsItem[];
  eelPfc?: string;
}

export interface Rate {
  id?: string;
  provider: string;
  carrier: string;
  service: string;
  serviceName?: string;
  cost: number;
  currency: string;
  deliveryDays?: number;
  deliveryDate?: string;
  guaranteed?: boolean;
}

export interface Label {
  id: string;
  provider: string;
  trackingNumber: string;
  labelUrl: string;
  labelFormat: 'PDF' | 'PNG' | 'ZPL';
  rate: Rate;
  createdAt: Date;
}

export interface TrackingEvent {
  status: TrackingStatus;
  message: string;
  datetime: Date;
  location?: {
    city?: string;
    state?: string;
    country?: string;
  };
  signedBy?: string;
}

export enum TrackingStatus {
  LABEL_CREATED = 'label_created',
  PRE_TRANSIT = 'pre_transit',
  IN_TRANSIT = 'in_transit',
  OUT_FOR_DELIVERY = 'out_for_delivery',
  DELIVERED = 'delivered',
  RETURNED = 'returned',
  EXCEPTION = 'exception',
  CANCELLED = 'cancelled',
}

export interface TrackingInfo {
  trackingNumber: string;
  carrier: string;
  status: TrackingStatus;
  events: TrackingEvent[];
  estimatedDelivery?: Date;
  signedBy?: string;
}

export interface RateRequest {
  origin?: Address;
  originId?: string; // Reference to ShipFromAddress
  destination: Address;
  parcel: Parcel;
  customs?: CustomsInfo;
}

export interface LabelRequest extends RateRequest {
  rate?: Rate;
  service?: string;
  carrier?: string;
}

export interface AddressValidationResult {
  valid: boolean;
  original: Address;
  suggested?: Address;
  errors?: string[];
}

// Shipment record for database storage
export interface Shipment {
  id: string;
  userId?: string;
  shipFromAddressId?: string;
  createdAt: Date;
  updatedAt: Date;

  // Customer info
  customerName?: string;
  email?: string;
  phone?: string;

  // Address
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  stateRegion?: string;
  postcode?: string;
  country?: string;

  // Package details
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  contentsDescription?: string;
  declaredValue?: number;
  currency?: string;

  // Preferences
  speedPreference?: string;
  insuranceRequired?: boolean;

  // Quotes
  quotesJson?: Rate[];
  chosenAggregator?: string;
  chosenService?: string;
  chosenPrice?: number;
  chosenCurrency?: string;

  // Tracking
  trackingNumber?: string;
  labelUrl?: string;
  providerCarrier?: string;
  status: ShipmentStatus;
}

export type ShipmentStatus =
  | 'pending'
  | 'quoted'
  | 'booked'
  | 'label_created'
  | 'in_transit'
  | 'delivered'
  | 'cancelled'
  | 'exception';
