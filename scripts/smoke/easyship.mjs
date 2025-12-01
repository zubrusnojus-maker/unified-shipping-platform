import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createProvidersFromEnv } from '@unified/shipping-providers';
import { shippingEnv } from '@unified/env';

function loadSample(index = 0) {
  const dataPath = path.join(process.cwd(), 'batch_shipments_formatted.json');
  if (!fs.existsSync(dataPath)) {
    throw new Error('batch_shipments_formatted.json not found at repo root');
    }
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const { warehouses, shipments } = raw;
  if (!shipments?.length) throw new Error('No shipments found in batch file');
  const i = Math.min(Math.max(0, index), shipments.length - 1);
  return { warehouses, shipment: shipments[i], index: i, total: shipments.length };
}

function toAddressFromWarehouse(w) {
  return {
    name: w.name || w.company || 'Warehouse',
    company: w.company || undefined,
    street1: w.street1,
    city: w.city,
    state: w.state,
    zip: w.zip,
    country: w.country,
    phone: w.phone || undefined,
    email: w.email || undefined,
  };
}

function toAddressFromShipment(s) {
  return {
    name: s.name,
    company: s.company || undefined,
    street1: s.street1,
    street2: s.street2 || undefined,
    city: s.city,
    state: s.state || undefined,
    zip: s.zip,
    country: s.country,
    phone: s.phone || undefined,
    email: s.email || undefined,
  };
}

function toCustomsFromShipment(s, warehouse) {
  return {
    contentsType: 'merchandise',
    contentsExplanation: s.description,
    customsCertify: true,
    customsSigner: warehouse.name || warehouse.company || 'Warehouse',
    nonDeliveryOption: 'return',
    restriction: 'none',
    items: [
      {
        description: s.description,
        quantity: s.quantity || 1,
        value: Number(s.value || 0),
        weight: Number(s.weight || 0),
        hsCode: s.hsCode,
        originCountry: s.originCountry || warehouse.country,
      },
    ],
  };
}

async function main() {
  if (!shippingEnv.easyship.apiKey) {
    console.error('❌ EASYSHIP_API_KEY is required');
    process.exit(1);
  }

  const argIndex = process.argv.findIndex((a) => a === '--index');
  const index = argIndex >= 0 ? Number(process.argv[argIndex + 1] || '0') : 0;
  const { warehouses, shipment, index: i, total } = loadSample(index);
  const warehouse = warehouses[shipment.productType];
  if (!warehouse) throw new Error(`No warehouse for productType ${shipment.productType}`);

  const providers = createProvidersFromEnv();
  const easyship = providers.get('easyship');
  if (!easyship) {
    console.error('❌ Easyship provider not configured (missing EASYSHIP_API_KEY?)');
    process.exit(1);
  }

  const origin = toAddressFromWarehouse(warehouse);
  const destination = toAddressFromShipment(shipment);
  const parcel = { length: shipment.length, width: shipment.width, height: shipment.height, weight: shipment.weight, unit: 'in', weightUnit: 'lb' };
  const customs = destination.country !== origin.country ? toCustomsFromShipment(shipment, warehouse) : undefined;

  console.log(`\n${'═'.repeat(40)}`);
  console.log(`🚀 Easyship Smoke: shipment ${i + 1}/${total} (${shipment.id})`);
  console.log(`From ${origin.city}, ${origin.state} → ${destination.city}, ${destination.country}`);
  console.log(`Parcel ${parcel.length}x${parcel.width}x${parcel.height} in, ${parcel.weight} lb`);
  if (process.env.EASYSHIP_BASE_URL) {
    console.log(`Using base URL: ${process.env.EASYSHIP_BASE_URL}`);
  }

  try {
    const rates = await easyship.getRates({ origin, destination, parcel, customs });
    if (!rates.length) {
      console.log('No rates returned');
      process.exit(2);
    }
    const top = rates.sort((a, b) => a.cost - b.cost).slice(0, 5);
    console.log(`\n✅ ${rates.length} rates found. Top ${top.length}:`);
    top.forEach((r, idx) => {
      console.log(`  ${idx + 1}. ${r.carrier} ${r.service} — ${r.currency} ${r.cost}${r.deliveryDays ? ` | ${r.deliveryDays} days` : ''}`);
    });
  } catch (err) {
    console.error('❌ Easyship error:', err?.message || err);
    process.exit(3);
  }
}

main();
