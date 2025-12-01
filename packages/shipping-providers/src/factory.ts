import { ShippingProvider } from './base.js';
import { EasyPostProvider, EasyPostConfig } from './easypost.js';
import { EasyshipProvider, EasyshipConfig } from './easyship.js';
import { N8nProvider, N8nConfig } from './n8n.js';

export type ProviderConfig =
  | { type: 'easypost'; config: EasyPostConfig }
  | { type: 'easyship'; config: EasyshipConfig }
  | { type: 'n8n'; config: N8nConfig };

/**
 * Factory function to create shipping providers
 */
export function createShippingProvider(providerConfig: ProviderConfig): ShippingProvider {
  switch (providerConfig.type) {
    case 'easypost':
      return new EasyPostProvider(providerConfig.config);
    case 'easyship':
      return new EasyshipProvider(providerConfig.config);
    case 'n8n':
      return new N8nProvider(providerConfig.config);
    default:
      throw new Error(`Unknown provider type: ${(providerConfig as any).type}`);
  }
}

/**
 * Create providers from environment variables
 */
export function createProvidersFromEnv(): Map<string, ShippingProvider> {
  const providers = new Map<string, ShippingProvider>();
  const shipperDefaults = getShipperDefaultsFromEnv();
  const withShipperDefaults = (p: ShippingProvider): ShippingProvider =>
    shipperDefaults ? new ShipperDefaultsDecorator(p, shipperDefaults) : p;

  // EasyPost
  if (process.env.EASYPOST_API_KEY) {
    providers.set(
      'easypost',
      withShipperDefaults(
        new EasyPostProvider({
          apiKey: process.env.EASYPOST_API_KEY,
          mode: process.env.EASYPOST_MODE === 'production' ? 'production' : 'test',
          labelFormat: (process.env.EASYPOST_LABEL_FORMAT as any) || undefined,
        }),
      ),
    );
  }

  // Easyship
  if (process.env.EASYSHIP_API_KEY) {
    // Prefer new names; fall back to legacy names for compatibility
    const weightUnitEnv = (
      process.env.EASYSHIP_WEIGHT_UNIT ||
      process.env.EASYSHIP_UNITS_WEIGHT ||
      'lb'
    ).toLowerCase();
    const dimUnitEnv = (
      process.env.EASYSHIP_DIMENSION_UNIT ||
      process.env.EASYSHIP_UNITS_DIMENSIONS ||
      'in'
    ).toLowerCase();
    const incotermDefaultEnv = (process.env.EASYSHIP_INCOTERM_DEFAULT || 'DDP').toUpperCase();
    const incotermDefault = incotermDefaultEnv === 'DDU' ? 'DDU' : 'DDP';
    const ddpRestricted = (process.env.EASYSHIP_DDP_RESTRICTED || 'MX,BR,AR')
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter(Boolean);

    providers.set(
      'easyship',
      withShipperDefaults(
        new EasyshipProvider({
          apiKey: process.env.EASYSHIP_API_KEY,
          mode: process.env.EASYSHIP_MODE === 'production' ? 'production' : 'sandbox',
          currency: process.env.EASYSHIP_CURRENCY || process.env.SHIPPING_DEFAULT_CURRENCY || 'USD',
          weightUnit: weightUnitEnv === 'kg' ? 'kg' : 'lb',
          dimUnit: dimUnitEnv === 'cm' ? 'cm' : 'in',
          incotermDefault,
          ddpRestricted,
          baseUrlOverride: process.env.EASYSHIP_BASE_URL,
          labelFormat: (process.env.EASYSHIP_LABEL_FORMAT as any) || undefined,
        }),
      ),
    );
  }

  // n8n
  if (process.env.N8N_WEBHOOK_BASE_URL) {
    providers.set(
      'n8n',
      new N8nProvider({
        baseUrl: process.env.N8N_WEBHOOK_BASE_URL,
        intakePath: process.env.N8N_WEBHOOK_INTAKE_PATH,
        ratesPath: process.env.N8N_WEBHOOK_RATES_PATH,
        bookPath: process.env.N8N_WEBHOOK_BOOK_PATH,
        trackingPath: process.env.N8N_WEBHOOK_TRACKING_PATH,
      }),
    );
  }

  return providers;
}

type ShipperDefaults = {
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

class ShipperDefaultsDecorator implements ShippingProvider {
  readonly name: string;
  constructor(
    private inner: ShippingProvider,
    private defaults: ShipperDefaults,
  ) {
    this.name = inner.name;
  }
  private apply<T extends { origin: any }>(req: T): T {
    const origin = { ...(req.origin || {}) };
    const merged = { ...this.defaults, ...origin };
    return { ...req, origin: merged } as T;
  }
  getRates(request: any) {
    return this.inner.getRates(this.apply(request));
  }
  createLabel(request: any) {
    return this.inner.createLabel(this.apply(request));
  }
  validateAddress(address: any) {
    return this.inner.validateAddress(address);
  }
  trackShipment(trackingNumber: string) {
    return this.inner.trackShipment(trackingNumber);
  }
  cancelShipment(shipmentId: string) {
    return this.inner.cancelShipment(shipmentId);
  }
}

function getShipperDefaultsFromEnv(): ShipperDefaults | null {
  const hasAny =
    process.env.SHIPPER_NAME ||
    process.env.SHIPPER_COMPANY ||
    process.env.SHIPPER_STREET1 ||
    process.env.SHIPPER_CITY ||
    process.env.SHIPPER_STATE ||
    process.env.SHIPPER_ZIP ||
    process.env.SHIPPER_COUNTRY ||
    process.env.SHIPPER_PHONE ||
    process.env.SHIPPER_EMAIL;
  if (!hasAny) return null;
  return {
    name: process.env.SHIPPER_NAME,
    company: process.env.SHIPPER_COMPANY,
    street1: process.env.SHIPPER_STREET1,
    street2: process.env.SHIPPER_STREET2,
    city: process.env.SHIPPER_CITY,
    state: process.env.SHIPPER_STATE,
    zip: process.env.SHIPPER_ZIP,
    country: process.env.SHIPPER_COUNTRY,
    phone: process.env.SHIPPER_PHONE,
    email: process.env.SHIPPER_EMAIL,
  };
}
