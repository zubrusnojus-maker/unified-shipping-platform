import process from 'node:process';
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

    requests.push(
      provider
        .getRates({ origin, destination, parcel })
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
