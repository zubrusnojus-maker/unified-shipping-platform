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

  // EasyPost
  if (process.env.EASYPOST_API_KEY) {
    providers.set('easypost', new EasyPostProvider({
      apiKey: process.env.EASYPOST_API_KEY,
      mode: process.env.EASYPOST_MODE === 'production' ? 'production' : 'test',
    }));
  }

  // Easyship
  if (process.env.EASYSHIP_API_KEY) {
    providers.set('easyship', new EasyshipProvider({
      apiKey: process.env.EASYSHIP_API_KEY,
      mode: process.env.EASYSHIP_MODE === 'production' ? 'production' : 'sandbox',
    }));
  }

  // n8n
  if (process.env.N8N_WEBHOOK_BASE_URL) {
    providers.set('n8n', new N8nProvider({
      baseUrl: process.env.N8N_WEBHOOK_BASE_URL,
      intakePath: process.env.N8N_WEBHOOK_INTAKE_PATH,
      ratesPath: process.env.N8N_WEBHOOK_RATES_PATH,
      bookPath: process.env.N8N_WEBHOOK_BOOK_PATH,
      trackingPath: process.env.N8N_WEBHOOK_TRACKING_PATH,
    }));
  }

  return providers;
}
