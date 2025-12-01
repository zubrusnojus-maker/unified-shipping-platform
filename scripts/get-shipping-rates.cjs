const https = require('https');
const fs = require('fs');
const path = require('path');

// Configuration
const CONFIG = {
  requestTimeout: 30000,  // 30 seconds per request
  delayBetweenShipments: 1500  // 1.5 seconds between API calls
};

// Load environment variables (required)
// EZTK = Test key, EZAK = Production key
const EASYPOST_KEY = process.env.EASYPOST_API_KEY;
const EASYSHIP_KEY = process.env.EASYSHIP_API_KEY;

if (!EASYPOST_KEY) {
  console.error('❌ EASYPOST_API_KEY environment variable is required');
  process.exit(1);
}

// EndShipper configuration: 'auto' | 'true' | 'false'
// - 'auto': Use EndShipper only when required by carrier (USAExportPBA/Passport consolidators)
// - 'true': Always include EndShipper ID
// - 'false': Never include EndShipper ID (default - avoids address mismatch errors)
const REQUIRE_END_SHIPPER = (process.env.EASYPOST_REQUIRE_END_SHIPPER || 'false').toLowerCase();
const END_SHIPPER_ID = process.env.EASYPOST_END_SHIPPER_ID || process.env.END_SHIPPER_ID || '';

// Load shipment data
const dataPath = path.join(__dirname, '..', 'batch_shipments_formatted.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const { warehouses, shipments } = data;

// Results storage
const results = {
  generatedAt: new Date().toISOString(),
  apiMode: 'PRODUCTION',
  action: 'RATES_ONLY',
  totalShipments: shipments.length,
  shipments: [],
  summary: null
};

function makeRequest(options, postData) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        } else {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(CONFIG.requestTimeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    if (postData) {
      const body = JSON.stringify(postData);
      req.setHeader('Content-Length', Buffer.byteLength(body));
      req.write(body);
    }
    req.end();
  });
}

// Returns EndShipper ID based on REQUIRE_END_SHIPPER config
// Returns null if EndShipper is disabled
function getEndShipperId() {
  if (REQUIRE_END_SHIPPER === 'false') {
    return null;
  }
  // 'true' or 'auto' - return the configured EndShipper ID
  return END_SHIPPER_ID;
}

async function createEasyPostShipment(shipment, warehouse) {
  const auth = Buffer.from(EASYPOST_KEY + ':').toString('base64');

  // Get EndShipper ID based on config (null if disabled)
  const endShipperId = getEndShipperId();

  const payload = {
    shipment: {
      from_address: {
        company: warehouse.company,
        name: warehouse.name,
        street1: warehouse.street1,
        city: warehouse.city,
        state: warehouse.state,
        zip: warehouse.zip,
        country: warehouse.country,
        phone: warehouse.phone,
        email: warehouse.email
      },
      to_address: {
        name: shipment.name,
        company: shipment.company || undefined,
        street1: shipment.street1,
        street2: shipment.street2 || undefined,
        city: shipment.city,
        state: shipment.state || undefined,
        zip: shipment.zip,
        country: shipment.country,
        phone: shipment.phone,
        email: shipment.email
      },
      parcel: {
        length: shipment.length,
        width: shipment.width,
        height: shipment.height,
        weight: shipment.weight * 16 // Convert lbs to oz for EasyPost
      },
      customs_info: {
        eel_pfc: 'NOEEI 30.37(a)',
        contents_type: 'merchandise',
        contents_explanation: shipment.description,
        customs_certify: true,
        customs_signer: warehouse.name,
        non_delivery_option: 'return',
        restriction_type: 'none',
        customs_items: [{
          description: shipment.description,
          quantity: shipment.quantity,
          value: shipment.value,
          weight: shipment.weight * 16, // oz
          hs_tariff_number: shipment.hsCode,
          origin_country: shipment.originCountry,
          currency: shipment.currency
        }]
      },
      // End shipper required for production mode with consolidators (USAExportPBA/Passport)
      options: endShipperId ? { end_shipper_id: endShipperId } : {}
    }
  };

  // Clean undefined values
  Object.keys(payload.shipment.to_address).forEach(key => {
    if (payload.shipment.to_address[key] === undefined) {
      delete payload.shipment.to_address[key];
    }
  });

  const options = {
    hostname: 'api.easypost.com',
    path: '/v2/shipments',
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await makeRequest(options, payload);
    return {
      success: true,
      provider: 'EasyPost',
      shipmentId: response.id,
      status: response.status,
      rates: (response.rates || []).map(r => ({
        rateId: r.id,
        carrier: r.carrier,
        service: r.service,
        rate: parseFloat(r.rate),
        currency: r.currency || 'USD',
        deliveryDays: r.delivery_days,
        deliveryDate: r.delivery_date,
        listRate: parseFloat(r.list_rate || r.rate),
        retailRate: parseFloat(r.retail_rate || r.rate)
      })).sort((a, b) => a.rate - b.rate)
    };
  } catch (error) {
    return {
      success: false,
      provider: 'EasyPost',
      error: error.message
    };
  }
}

async function getEasyShipRates(shipment, warehouse) {
  const payload = {
    origin_address: {
      company_name: warehouse.company,
      contact_name: warehouse.name,
      line_1: warehouse.street1,
      city: warehouse.city,
      state: warehouse.state,
      postal_code: warehouse.zip,
      country_alpha2: warehouse.country,
      contact_phone: warehouse.phone,
      contact_email: warehouse.email
    },
    destination_address: {
      contact_name: shipment.name,
      company_name: shipment.company || undefined,
      line_1: shipment.street1,
      line_2: shipment.street2 || undefined,
      city: shipment.city,
      state: shipment.state || undefined,
      postal_code: shipment.zip,
      country_alpha2: shipment.country,
      contact_phone: shipment.phone,
      contact_email: shipment.email
    },
    parcels: [{
      total_actual_weight: shipment.weight,
      box: {
        length: shipment.length,
        width: shipment.width,
        height: shipment.height
      },
      items: [{
        actual_weight: shipment.weight,
        category: shipment.category,
        declared_currency: shipment.currency,
        declared_customs_value: shipment.value,
        description: shipment.description,
        hs_code: shipment.hsCode,
        origin_country_alpha2: shipment.originCountry,
        quantity: shipment.quantity,
        sku: shipment.sku
      }]
    }],
    incoterms: 'DDU',
    insurance: { is_insured: false },
    courier_selection: {
      apply_shipping_rules: true,
      list_unavailable_couriers: false
    },
    shipping_settings: {
      units: {
        weight: 'lb',
        dimensions: 'in'
      }
    }
  };

  // Clean undefined values
  Object.keys(payload.destination_address).forEach(key => {
    if (payload.destination_address[key] === undefined) {
      delete payload.destination_address[key];
    }
  });

  const options = {
    hostname: 'public-api.easyship.com',
    path: '/2024-09/rates',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${EASYSHIP_KEY}`,
      'Content-Type': 'application/json'
    }
  };

  try {
    const response = await makeRequest(options, payload);
    return {
      success: true,
      provider: 'EasyShip',
      rates: (response.rates || []).map(r => ({
        rateId: r.courier_id,
        courierId: r.courier_id,
        courier: r.courier_name,
        service: r.courier_service_name || r.service_name,
        rate: parseFloat(r.total_charge || 0),
        currency: r.currency || 'USD',
        deliveryDays: `${r.min_delivery_time || '?'}-${r.max_delivery_time || '?'}`,
        available: r.available_handover_options ? true : false,
        shipmentChargeTotal: r.shipment_charge_total,
        insuranceFee: r.insurance_fee,
        fuelSurcharge: r.fuel_surcharge
      })).filter(r => r.rate > 0).sort((a, b) => a.rate - b.rate)
    };
  } catch (error) {
    return {
      success: false,
      provider: 'EasyShip',
      error: error.message
    };
  }
}

async function processShipment(shipment, index) {
  const warehouse = warehouses[shipment.productType];

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`📦 SHIPMENT ${index + 1}/${shipments.length}: ${shipment.id}`);
  console.log(`${'═'.repeat(80)}`);

  console.log(`\n📍 FROM: ${warehouse.company}`);
  console.log(`   ${warehouse.street1}`);
  console.log(`   ${warehouse.city}, ${warehouse.state} ${warehouse.zip}, ${warehouse.country}`);

  console.log(`\n📍 TO: ${shipment.name}${shipment.company ? ` (${shipment.company})` : ''}`);
  console.log(`   ${shipment.street1}`);
  if (shipment.street2) console.log(`   ${shipment.street2}`);
  console.log(`   ${shipment.city}${shipment.state ? ', ' + shipment.state : ''} ${shipment.zip}, ${shipment.country}`);

  console.log(`\n📦 PACKAGE:`);
  console.log(`   Weight: ${shipment.weight} lbs (${(shipment.weight * 16).toFixed(1)} oz)`);
  console.log(`   Dimensions: ${shipment.length}" × ${shipment.width}" × ${shipment.height}"`);
  console.log(`   Value: $${shipment.value.toFixed(2)} ${shipment.currency}`);
  console.log(`   Contents: ${shipment.description}`);
  console.log(`   HS Code: ${shipment.hsCode} | Qty: ${shipment.quantity}`);

  console.log(`\n⏳ Fetching rates from EasyPost and EasyShip...`);

  // Fetch rates from both providers in parallel
  const [easypostResult, easyshipResult] = await Promise.all([
    createEasyPostShipment(shipment, warehouse),
    getEasyShipRates(shipment, warehouse)
  ]);

  const shipmentData = {
    id: shipment.id,
    recipient: shipment.name,
    destination: shipment.country,
    warehouse: warehouse.company,
    warehouseCity: warehouse.city,
    weight: shipment.weight,
    value: shipment.value,
    easypost: easypostResult,
    easyship: easyshipResult,
    bestRate: null
  };

  // Display EasyPost results
  if (easypostResult.success) {
    console.log(`\n✅ EASYPOST: ${easypostResult.rates.length} rates found`);
    console.log(`   Shipment ID: ${easypostResult.shipmentId}`);
    if (easypostResult.rates.length > 0) {
      console.log(`\n   Top 5 rates:`);
      easypostResult.rates.slice(0, 5).forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.carrier} ${r.service}`);
        console.log(`      $${r.rate.toFixed(2)} | ${r.deliveryDays || 'N/A'} days | ID: ${r.rateId}`);
      });
    }
  } else {
    console.log(`\n❌ EASYPOST: ${easypostResult.error}`);
  }

  // Display EasyShip results
  if (easyshipResult.success) {
    console.log(`\n✅ EASYSHIP: ${easyshipResult.rates.length} rates found`);
    if (easyshipResult.rates.length > 0) {
      console.log(`\n   Top 5 rates:`);
      easyshipResult.rates.slice(0, 5).forEach((r, i) => {
        console.log(`   ${i + 1}. ${r.courier} - ${r.service}`);
        console.log(`      $${r.rate.toFixed(2)} | ${r.deliveryDays} days | ID: ${r.courierId}`);
      });
    }
  } else {
    console.log(`\n❌ EASYSHIP: ${easyshipResult.error}`);
  }

  // Find best overall rate
  const allRates = [
    ...(easypostResult.success ? easypostResult.rates.map(r => ({ ...r, provider: 'EasyPost' })) : []),
    ...(easyshipResult.success ? easyshipResult.rates.filter(r => r.available !== false).map(r => ({ ...r, provider: 'EasyShip' })) : [])
  ].sort((a, b) => a.rate - b.rate);

  if (allRates.length > 0) {
    shipmentData.bestRate = allRates[0];
    console.log(`\n🏆 BEST RATE:`);
    console.log(`   Provider: ${allRates[0].provider}`);
    console.log(`   ${allRates[0].carrier || allRates[0].courier} - ${allRates[0].service}`);
    console.log(`   💰 $${allRates[0].rate.toFixed(2)} ${allRates[0].currency}`);
    console.log(`   ⏱️  ${allRates[0].deliveryDays} days`);
  }

  results.shipments.push(shipmentData);

  // Rate limit: wait before next request
  if (index < shipments.length - 1) {
    console.log(`\n⏳ Waiting ${CONFIG.delayBetweenShipments / 1000}s before next shipment...`);
    await new Promise(resolve => setTimeout(resolve, CONFIG.delayBetweenShipments));
  }
}

async function main() {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`🚀 SHIPPING RATE COMPARISON`);
  console.log(`${'═'.repeat(80)}`);
  console.log(`\n⚠️  MODE: RATES ONLY - No labels will be purchased`);
  console.log(`📋 Shipments: ${shipments.length}`);
  console.log(`🏭 Warehouses: ${Object.keys(warehouses).length}`);
  console.log(`   - Clothing: ${warehouses.clothing.city}, ${warehouses.clothing.state}`);
  console.log(`   - Electronics: ${warehouses.electronics.city}, ${warehouses.electronics.state}`);
  console.log(`💰 Cost: $0.00 (rate retrieval is free)`);

  for (let i = 0; i < shipments.length; i++) {
    await processShipment(shipments[i], i);
  }

  // Calculate summary
  const shipmentsWithRates = results.shipments.filter(s => s.bestRate);
  const totalBestCost = shipmentsWithRates.reduce((sum, s) => sum + s.bestRate.rate, 0);
  const easypostWins = shipmentsWithRates.filter(s => s.bestRate.provider === 'EasyPost').length;
  const easyshipWins = shipmentsWithRates.filter(s => s.bestRate.provider === 'EasyShip').length;

  results.summary = {
    totalShipments: shipments.length,
    shipmentsWithRates: shipmentsWithRates.length,
    totalBestCost: totalBestCost,
    averageCost: shipmentsWithRates.length > 0 ? totalBestCost / shipmentsWithRates.length : 0,
    easypostWins,
    easyshipWins,
    labelsPurchased: 0
  };

  console.log(`\n\n${'═'.repeat(80)}`);
  console.log(`📈 SUMMARY`);
  console.log(`${'═'.repeat(80)}`);
  console.log(`\nShipments processed: ${results.summary.totalShipments}`);
  console.log(`Rates retrieved: ${results.summary.shipmentsWithRates}`);
  console.log(`\n💰 COST SUMMARY (Best Rates):`);
  console.log(`   Total: $${results.summary.totalBestCost.toFixed(2)}`);
  console.log(`   Average: $${results.summary.averageCost.toFixed(2)} per shipment`);
  console.log(`\n🏆 PROVIDER WINS:`);
  console.log(`   EasyPost: ${easypostWins}`);
  console.log(`   EasyShip: ${easyshipWins}`);

  console.log(`\n📋 SHIPMENT BREAKDOWN:`);
  console.log(`${'─'.repeat(80)}`);
  results.shipments.forEach(s => {
    if (s.bestRate) {
      console.log(`   ${s.id}: ${s.recipient} (${s.destination}) → $${s.bestRate.rate.toFixed(2)} via ${s.bestRate.provider}`);
    } else {
      console.log(`   ${s.id}: ${s.recipient} (${s.destination}) → NO RATES FOUND`);
    }
  });

  // Save results
  const outputPath = path.join(__dirname, '..', 'shipping_rates_result.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`✅ RATES RETRIEVED - AWAITING PURCHASE CONFIRMATION`);
  console.log(`${'═'.repeat(80)}`);
  console.log(`\n📄 Results saved to: shipping_rates_result.json`);
  console.log(`\n⚠️  NO LABELS PURCHASED - Run purchase script after review`);
  console.log(`💰 Charges incurred: $0.00\n`);
}

main().catch(error => {
  console.error('\n❌ Fatal Error:', error.message);
  process.exit(1);
});
