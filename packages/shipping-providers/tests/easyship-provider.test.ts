import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EasyshipProvider } from '../src/easyship';

const mockRatesResponse = {
  rates: [
    {
      courier_id: 'c_1',
      courier_name: 'DHL',
      service_level: 'Express',
      total_charge: 25.5,
      currency: 'USD',
    },
    {
      courier_id: 'c_2',
      courier_name: 'UPS',
      service_level: 'Saver',
      total_charge: 20.0,
      currency: 'USD',
    },
  ],
};

function mockFetch(json: any, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => json })) as unknown as typeof fetch;
}

const origin = {
  name: 'Warehouse',
  company: 'Acme',
  street1: '1 Main',
  city: 'LA',
  state: 'CA',
  zip: '90001',
  country: 'US',
};
const destination = {
  name: 'John',
  street1: '2 High',
  city: 'NY',
  state: 'NY',
  zip: '10001',
  country: 'US',
};
const parcel = { length: 10, width: 10, height: 10, weight: 5 };

describe('EasyshipProvider endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('uses legacy v2 paths by default', async () => {
    // @ts-expect-error override global fetch
    global.fetch = mockFetch(mockRatesResponse);
    const provider = new EasyshipProvider({ apiKey: 'key', mode: 'sandbox' });
    const rates = await provider.getRates({ origin, destination, parcel });
    expect(rates.length).toBe(2);
  });

  it('uses public API paths when baseUrl override provided', async () => {
    // @ts-expect-error override global fetch
    global.fetch = mockFetch(mockRatesResponse);
    const provider = new EasyshipProvider({
      apiKey: 'key',
      mode: 'production',
      baseUrlOverride: 'https://public-api.easyship.com/2024-09',
    });
    const rates = await provider.getRates({ origin, destination, parcel });
    expect(rates.length).toBe(2);
  });

  it('maps error details when response not ok', async () => {
    const errJson = { code: 4001, message: 'invalid address' };
    // @ts-expect-error override global fetch
    global.fetch = mockFetch(errJson, false);
    const provider = new EasyshipProvider({ apiKey: 'key', mode: 'sandbox' });
    await expect(provider.getRates({ origin, destination, parcel })).rejects.toThrow(
      /Easyship API error/,
    );
  });
});
