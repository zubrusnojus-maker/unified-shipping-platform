import process from 'node:process';
import fs from 'node:fs';
import path from 'node:path';
import { createProvidersFromEnv } from '@unified/shipping-providers';

function toAddress(name, street1, street2, city, state, zip, country, phone, email, company) {
  return { name, company, street1, street2, city, state, zip, country, phone, email };
}

function parseWeightLbsOz(text) {
  // e.g., "3lb 3oz" or "4lb 4oz"
  const m = /(?:(\d+)\s*lb[s]?)?\s*(?:(\d+)\s*oz)?/i.exec(text || '');
  const lbs = m && m[1] ? Number(m[1]) : 0;
  const oz = m && m[2] ? Number(m[2]) : 0;
  return { pounds: lbs + oz / 16, ounces: lbs * 16 + oz };
}

function parseDims(text) {
  // e.g., "13x13x7"
  const m = /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/i.exec(text || '');
  if (!m) throw new Error('Invalid dimensions');
  return { length: Number(m[1]), width: Number(m[2]), height: Number(m[3]) };
}

function loadCustomsConfig(routeKey) {
  try {
    const cfgPath = path.resolve(
      process.cwd(),
      'scripts/smoke/two-shipments.customs.json'
    );
    if (!fs.existsSync(cfgPath)) return undefined;
    const raw = fs.readFileSync(cfgPath, 'utf8');
    const data = JSON.parse(raw);
    const entry = data?.[routeKey];
    if (!entry || !Array.isArray(entry.items) || entry.items.length === 0) return undefined;
    return entry;
  } catch {
    return undefined;
  }
}

async function getRatesForShipment(origin, destination, dimsText, weightText) {
  const dims = parseDims(dimsText);
  const w = parseWeightLbsOz(weightText);
  const providers = createProvidersFromEnv();

  const requests = [];
  for (const [name, provider] of providers.entries()) {
    const isEasyPost = provider.name.toLowerCase() === 'easypost';
    // EasyPost expects ounces, Easyship expects pounds
    const parcel = isEasyPost
      ? { ...dims, weight: w.ounces, unit: 'in', weightUnit: 'lb' }
      : { ...dims, weight: w.pounds, unit: 'in', weightUnit: 'lb' };
    // Build customs for international shipments.
    const isInternational = (origin.country || '').toUpperCase() !== (destination.country || '').toUpperCase();
    let customs;
    if (isInternational) {
      const routeKey = `${(origin.country || '').toUpperCase()}-${(destination.country || '').toUpperCase()}`;
      const cfg = loadCustomsConfig(routeKey);
      const cfgItems = Array.isArray(cfg?.items) ? cfg.items : [];
      const mappedItems = cfgItems.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        value: i.value,
        weight: isEasyPost ? w.ounces : w.pounds,
        hsCode: i.hsCode,
        originCountry: (origin.country || '').toUpperCase(),
      }));
      const hasValidHsCodes = mappedItems.every((i) => typeof i.hsCode === 'string' && /\d{4,}/.test(i.hsCode));

      // EasyPost: allow customs even with empty HS code
      // Easyship: require valid HS codes, otherwise omit customs to avoid validation errors
      if (isEasyPost || hasValidHsCodes) {
        customs = {
          contentsType: 'merchandise',
          contentsExplanation: undefined,
          customsCertify: true,
          customsSigner: origin.name || origin.company || 'Sender',
          nonDeliveryOption: 'return',
          restriction: 'none',
          eelPfc: cfg?.eelPfc,
          items: mappedItems.length
            ? mappedItems
            : [
                {
                  description: 'Merchandise',
                  quantity: 1,
                  value: 0,
                  weight: isEasyPost ? w.ounces : w.pounds,
                  hsCode: isEasyPost ? '' : undefined,
                  originCountry: (origin.country || '').toUpperCase(),
                },
              ],
        };
      }
    }

    const request = isEasyPost
      ? { origin, destination, parcel, customs }
      : { origin, destination, parcel };

    requests.push(
      provider
        .getRates(request)
        .then((rates) => rates.map((r) => ({ ...r, provider: provider.name })))
        .catch((err) => ({ error: err?.message || String(err), provider: provider.name }))
    );
  }

  const results = await Promise.all(requests);
  const rates = results.flat().filter((r) => !('error' in r));
  const errors = results.flat().filter((r) => 'error' in r);
  return { rates: rates.sort((a, b) => a.cost - b.cost), errors };
}

async function main() {
  // Shipment 1: Mens Collection (US) -> Sarah Khalili (Belgium)
  const origin1 = toAddress(
    'Matteo Caruso',
    '5103 New Utrecht Ave',
    undefined,
    'Brooklyn',
    'NY',
    '11219',
    'US',
    '7189724920',
    'matteo@menscollection.com',
    'Mens Collection'
  );
  const dest1 = toAddress(
    'Sarah Khalili',
    'Rue de Mérode 191',
    undefined,
    'Saint Gilles',
    undefined,
    '1060',
    'BE',
    undefined,
    undefined,
    undefined
  );

  // Shipment 2: Epic Glam Clothes (US) -> Max Eberhart (Switzerland)
  const origin2 = toAddress(
    'Michael Porter',
    '136-35 Springfield Blvd',
    'STORE B',
    'Springfield Gardens',
    'NY',
    '11413',
    'US',
    '3472338517',
    'michael@epicglam.com',
    'Epic Glam Clothes'
  );
  const dest2 = toAddress(
    'Max Eberhart',
    'Thunstrasse 2',
    undefined,
    'Konolfingen',
    undefined,
    '3510',
    'CH',
    '+41768832978',
    'Max.eberhart66@gmail.com',
    undefined
  );

  const s1 = await getRatesForShipment(origin1, dest1, '13x13x7', '3lb 3oz');
  const s2 = await getRatesForShipment(origin2, dest2, '13x13x7', '4lb 4oz');

  function print(name, result) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📦 ${name}`);
    if (result.errors.length) {
      console.log('Errors:');
      result.errors.forEach((e) => console.log(`  - ${e.provider}: ${e.error}`));
    }
    if (!result.rates.length) {
      console.log('No rates returned');
      return;
    }
    result.rates.slice(0, 10).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.provider} — ${r.carrier} ${r.service} | ${r.currency} ${r.cost}${r.deliveryDays ? ` | ${r.deliveryDays} days` : ''}`);
    });
  }

  print('US → BE (Mens Collection → Sarah Khalili)', s1);
  print('US → CH (Epic Glam → Max Eberhart)', s2);
}

main().catch((e) => {
  console.error('Fatal error:', e?.message || String(e));
  process.exit(1);
});
