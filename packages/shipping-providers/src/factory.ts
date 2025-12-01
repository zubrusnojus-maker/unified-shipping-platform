import { ShippingProvider } from './base.js';
import { EasyPostProvider, EasyPostConfig } from './easypost.js';
import { EasyshipProvider, EasyshipConfig } from './easyship.js';
import { N8nProvider, N8nConfig } from './n8n.js';
import { shippingEnv } from '@unified/env';

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
      throw new Error(`Unknown provider type: ${(providerConfig as { type: string }).type}`);
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
  if (shippingEnv.easypost.apiKey) {
    providers.set(
      'easypost',
      withShipperDefaults(
        new EasyPostProvider({
          apiKey: shippingEnv.easypost.apiKey,
          mode: shippingEnv.easypost.mode,
          labelFormat:
            (shippingEnv.easypost.labelFormat as EasyPostConfig['labelFormat']) || undefined,
          requireEndShipper:
            (shippingEnv.easypost.requireEndShipper as EasyPostConfig['requireEndShipper']) ||
            'auto',
          endShipperId: shippingEnv.easypost.endShipperId || undefined,
        }),
      ),
    );
  }

  // Easyship
  if (shippingEnv.easyship.apiKey) {
    // Prefer new names; fall back to legacy names for compatibility
    const weightUnitEnv = (shippingEnv.easyship.weightUnit || 'lb').toLowerCase();
    const dimUnitEnv = (shippingEnv.easyship.dimensionUnit || 'in').toLowerCase();
    const incotermDefaultEnv = shippingEnv.easyship.incotermDefault || 'DDP';
    const incotermDefault = incotermDefaultEnv === 'DDU' ? 'DDU' : 'DDP';
    const ddpRestricted = (shippingEnv.easyship.ddpRestricted || []).map((c) => c.toUpperCase());

    providers.set(
      'easyship',
      withShipperDefaults(
        new EasyshipProvider({
          apiKey: shippingEnv.easyship.apiKey,
          mode: shippingEnv.easyship.mode,
          currency: shippingEnv.easyship.currency,
          weightUnit: weightUnitEnv === 'kg' ? 'kg' : 'lb',
          dimUnit: dimUnitEnv === 'cm' ? 'cm' : 'in',
          incotermDefault,
          ddpRestricted,
          baseUrlOverride: shippingEnv.easyship.baseUrlOverride,
          labelFormat:
            (shippingEnv.easyship.labelFormat as EasyshipConfig['labelFormat']) || undefined,
        }),
      ),
    );
  }

  // n8n
  if (shippingEnv.n8n.baseUrl) {
    providers.set(
      'n8n',
      new N8nProvider({
        baseUrl: shippingEnv.n8n.baseUrl,
        intakePath: shippingEnv.n8n.intakePath,
        ratesPath: shippingEnv.n8n.ratesPath,
        bookPath: shippingEnv.n8n.bookPath,
        trackingPath: shippingEnv.n8n.trackingPath,
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
  private apply<T extends { origin?: import('@unified/types').Address }>(req: T): T {
    const origin = { ...(req.origin || ({} as import('@unified/types').Address)) };
    const merged = { ...this.defaults, ...origin };
    return { ...req, origin: merged } as T;
  }
  getRates(request: import('@unified/types').RateRequest) {
    return this.inner.getRates(this.apply(request));
  }
  createLabel(request: import('@unified/types').LabelRequest) {
    return this.inner.createLabel(this.apply(request));
  }
  validateAddress(address: import('@unified/types').Address) {
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
  const s = shippingEnv.shipperDefaults;
  const hasAny = !!(
    s.name ||
    s.company ||
    s.street1 ||
    s.city ||
    s.state ||
    s.zip ||
    s.country ||
    s.phone ||
    s.email
  );
  if (!hasAny) return null;
  return {
    name: s.name,
    company: s.company,
    street1: s.street1,
    street2: s.street2,
    city: s.city,
    state: s.state,
    zip: s.zip,
    country: s.country,
    phone: s.phone,
    email: s.email,
  };
}
