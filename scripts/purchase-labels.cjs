const https = require('https');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ═══════════════════════════════════════════════════════════════════════════════
// FAIL-SAFE CONFIGURATION
// ═══════════════════════════════════════════════════════════════════════════════

const FAIL_SAFE_CONFIG = {
  // Maximum total spend allowed in one run
  maxTotalSpend: 500.00,

  // Maximum per-shipment cost
  maxPerShipment: 150.00,

  // Require interactive confirmation
  requireConfirmation: true,

  // Dry run mode (set to true to test without purchasing)
  dryRun: process.env.DRY_RUN === 'true',

  // Stop on first failure
  stopOnFailure: false,

  // Maximum retries per shipment
  maxRetries: 2,

  // Delay between purchases (ms)
  purchaseDelay: 2000,

  // Timeout per request (ms)
  requestTimeout: 60000,

  // Rate expiration window (ms) - EasyPost rates expire after ~15 mins
  rateMaxAgeMs: 10 * 60 * 1000,

  // Download labels locally
  downloadLabels: true,

  // Labels output directory
  labelsDir: path.join(__dirname, '..', 'labels')
};

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-PURCHASE HOOKS
// ═══════════════════════════════════════════════════════════════════════════════

const hooks = {
  // Called before any purchases start
  beforeAll: async (shipments, totalCost) => {
    console.log('\n🔒 RUNNING PRE-PURCHASE VALIDATION HOOKS...\n');

    // Hook 1: Total spend limit
    if (totalCost > FAIL_SAFE_CONFIG.maxTotalSpend) {
      throw new Error(`BLOCKED: Total cost $${totalCost.toFixed(2)} exceeds limit $${FAIL_SAFE_CONFIG.maxTotalSpend.toFixed(2)}`);
    }
    console.log(`   ✓ Total spend check: $${totalCost.toFixed(2)} <= $${FAIL_SAFE_CONFIG.maxTotalSpend.toFixed(2)}`);

    // Hook 2: Per-shipment limit
    for (const s of shipments) {
      if (s.rate > FAIL_SAFE_CONFIG.maxPerShipment) {
        throw new Error(`BLOCKED: Shipment to ${s.recipient} costs $${s.rate.toFixed(2)}, exceeds limit $${FAIL_SAFE_CONFIG.maxPerShipment.toFixed(2)}`);
      }
    }
    console.log(`   ✓ Per-shipment limit check: All <= $${FAIL_SAFE_CONFIG.maxPerShipment.toFixed(2)}`);

    // Hook 3: Verify shipment IDs exist
    for (const s of shipments) {
      if (!s.shipmentId || !s.shipmentId.startsWith('shp_')) {
        throw new Error(`BLOCKED: Invalid shipment ID for ${s.recipient}: ${s.shipmentId}`);
      }
      if (!s.rateId || !s.rateId.startsWith('rate_')) {
        throw new Error(`BLOCKED: Invalid rate ID for ${s.recipient}: ${s.rateId}`);
      }
    }
    console.log(`   ✓ Shipment/Rate ID format check: All valid`);

    // Hook 4: Rate freshness check
    if (ratesGeneratedAt) {
      const ageMs = Date.now() - ratesGeneratedAt.getTime();
      const ageMinutes = Math.round(ageMs / 60000);
      if (ageMs > FAIL_SAFE_CONFIG.rateMaxAgeMs) {
        throw new Error(`BLOCKED: Rates are ${ageMinutes} minutes old (max ${FAIL_SAFE_CONFIG.rateMaxAgeMs / 60000} min). Re-run get-shipping-rates.cjs first.`);
      }
      console.log(`   ✓ Rate freshness check: ${ageMinutes} min old (max ${FAIL_SAFE_CONFIG.rateMaxAgeMs / 60000} min)`);
    } else {
      console.log(`   ⚠️  Rate freshness check: Could not verify (shipping_rates_result.json not found)`);
    }

    // Hook 5: Dry run check
    if (FAIL_SAFE_CONFIG.dryRun) {
      console.log(`   ⚠️  DRY RUN MODE: No actual purchases will be made`);
    }

    console.log('\n   ✅ All pre-purchase hooks passed\n');
    return true;
  },

  // Called before each individual purchase
  beforePurchase: async (shipment, index, total) => {
    console.log(`\n   🔍 Pre-purchase check for ${shipment.recipient}...`);

    // Verify rate hasn't changed dramatically (would need API call to verify)
    // For now, just log
    console.log(`      Rate: $${shipment.rate.toFixed(2)} (${shipment.carrier} ${shipment.service})`);

    return true;
  },

  // Called after each successful purchase
  afterPurchase: async (shipment, result) => {
    console.log(`   📝 Post-purchase hook: Logging tracking ${result.trackingCode}`);

    // Download label locally
    if (FAIL_SAFE_CONFIG.downloadLabels && result.labelUrl) {
      try {
        const ext = result.labelFormat === 'PDF' ? 'pdf' : 'png';
        const filename = `${shipment.destination}_${shipment.recipient.replace(/\s+/g, '_')}_${result.trackingCode}.${ext}`;
        const localPath = await downloadLabel(result.labelUrl, filename);
        console.log(`   📥 Label downloaded: ${localPath}`);
        result.localLabelPath = localPath;
      } catch (err) {
        console.log(`   ⚠️  Label download failed: ${err.message}`);
      }
    }

    return true;
  },

  // Called after a failed purchase
  onFailure: async (shipment, error, retryCount) => {
    console.log(`   ⚠️  Failure hook: Attempt ${retryCount + 1} failed for ${shipment.recipient}`);

    // Return true to retry, false to skip
    return retryCount < FAIL_SAFE_CONFIG.maxRetries;
  },

  // Called after all purchases complete
  afterAll: async (results) => {
    console.log('\n🔒 RUNNING POST-PURCHASE HOOKS...\n');

    // Summary hook
    console.log(`   📊 Purchased: ${results.successful.length}/${results.successful.length + results.failed.length}`);
    console.log(`   💰 Total charged: $${results.totalCost.toFixed(2)}`);

    if (results.failed.length > 0) {
      console.log(`   ⚠️  ${results.failed.length} shipments failed - review required`);
    }

    return true;
  }
};

// ═══════════════════════════════════════════════════════════════════════════════
// INTERACTIVE SHIPMENT SELECTION
// ═══════════════════════════════════════════════════════════════════════════════

async function selectShipments(availableShipments) {
  // In non-interactive mode, check for SELECTED_SHIPMENTS env var
  if (!process.stdin.isTTY) {
    const selectedEnv = process.env.SELECTED_SHIPMENTS;
    if (selectedEnv) {
      // Parse comma-separated list of indices (1-based) or "all"
      if (selectedEnv.toLowerCase() === 'all') {
        console.log('\n✅ Non-interactive mode: SELECTED_SHIPMENTS=all, using all shipments\n');
        return availableShipments;
      }
      const indices = selectedEnv.split(',').map(s => parseInt(s.trim(), 10) - 1);
      const selected = indices
        .filter(i => i >= 0 && i < availableShipments.length)
        .map(i => availableShipments[i]);
      if (selected.length > 0) {
        console.log(`\n✅ Non-interactive mode: SELECTED_SHIPMENTS=${selectedEnv}, using ${selected.length} shipments\n`);
        return selected;
      }
    }
    console.log('\n⚠️  Non-interactive mode: Set SELECTED_SHIPMENTS=1,2,3 or SELECTED_SHIPMENTS=all\n');
    return [];
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise((resolve) => {
    rl.question(prompt, resolve);
  });

  console.log('\n' + '═'.repeat(80));
  console.log('📋 SHIPMENT SELECTION');
  console.log('═'.repeat(80));
  console.log('\nAvailable shipments:\n');

  availableShipments.forEach((s, i) => {
    console.log(`  ${i + 1}. ${s.recipient.padEnd(25)} → ${s.destination}   $${s.rate.toFixed(2).padStart(7)}  (${s.carrier} ${s.service})`);
  });

  const totalAll = availableShipments.reduce((sum, s) => sum + s.rate, 0);
  console.log(`\n  Total (all ${availableShipments.length}): $${totalAll.toFixed(2)}`);
  console.log('\n' + '─'.repeat(80));
  console.log('Enter shipment numbers to purchase (comma-separated), or "all" for all:');
  console.log('Example: 1,2,5 or all');
  console.log('─'.repeat(80));

  const answer = await question('\nSelection: ');
  rl.close();

  const trimmed = answer.trim().toLowerCase();

  if (!trimmed || trimmed === 'none' || trimmed === 'cancel' || trimmed === 'q') {
    console.log('\n❌ No shipments selected. Exiting.\n');
    return [];
  }

  if (trimmed === 'all') {
    console.log(`\n✅ Selected all ${availableShipments.length} shipments\n`);
    return availableShipments;
  }

  const indices = answer.split(',').map(s => parseInt(s.trim(), 10) - 1);
  const selected = indices
    .filter(i => i >= 0 && i < availableShipments.length)
    .map(i => availableShipments[i]);

  if (selected.length === 0) {
    console.log('\n❌ Invalid selection. No valid shipment numbers found.\n');
    return [];
  }

  const selectedTotal = selected.reduce((sum, s) => sum + s.rate, 0);
  console.log(`\n✅ Selected ${selected.length} shipments (Total: $${selectedTotal.toFixed(2)}):`);
  selected.forEach((s, i) => {
    console.log(`   ${i + 1}. ${s.recipient} (${s.destination}) - $${s.rate.toFixed(2)}`);
  });
  console.log();

  return selected;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERACTIVE CONFIRMATION
// ═══════════════════════════════════════════════════════════════════════════════

async function confirmPurchase(shipments, totalCost) {
  if (!FAIL_SAFE_CONFIG.requireConfirmation) {
    return true;
  }

  // In non-interactive mode (piped input), proceed if CONFIRM_PURCHASE env is set
  if (!process.stdin.isTTY) {
    if (process.env.CONFIRM_PURCHASE === 'true') {
      console.log('\n✅ Non-interactive mode: CONFIRM_PURCHASE=true, proceeding...\n');
      return true;
    }
    console.log('\n⚠️  Non-interactive mode detected. Use DRY_RUN=true to test safely.\n');
    console.log('To proceed, run with: CONFIRM_PURCHASE=true node scripts/purchase-labels.cjs');
    return false;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    console.log('\n' + '⚠️'.repeat(30));
    console.log('\n🚨 PURCHASE CONFIRMATION REQUIRED 🚨\n');
    console.log(`   You are about to purchase ${shipments.length} shipping labels`);
    console.log(`   Total cost: $${totalCost.toFixed(2)}`);
    console.log(`   This will charge your EasyPost account.\n`);
    console.log('⚠️'.repeat(30) + '\n');

    rl.question('Type "CONFIRM" to proceed (or anything else to cancel): ', (answer) => {
      rl.close();
      if (answer.trim().toUpperCase() === 'CONFIRM') {
        console.log('\n✅ Confirmation received. Proceeding with purchase...\n');
        resolve(true);
      } else {
        console.log('\n❌ Purchase cancelled by user.\n');
        resolve(false);
      }
    });
  });
}

// API Key (required)
const EASYPOST_KEY = process.env.EASYPOST_API_KEY;

if (!EASYPOST_KEY) {
  console.error('❌ EASYPOST_API_KEY environment variable is required');
  process.exit(1);
}

// Load rates result to check freshness
const ratesResultPath = path.join(__dirname, '..', 'shipping_rates_result.json');
let ratesGeneratedAt = null;
try {
  const ratesResult = JSON.parse(fs.readFileSync(ratesResultPath, 'utf8'));
  ratesGeneratedAt = new Date(ratesResult.generatedAt);
} catch (e) {
  // Will be validated in hooks
}

// Available rates for selection - PRODUCTION MODE (EndShipper disabled by default)
// Fresh rates from shipping_rates_result.json (generated 2025-12-01)
// 5 shipments with user-selected carriers (skipping MY and GR)
const availableRates = [
  {
    shipmentId: "shp_dd5d05aa3bce4b66a209f2ff41557912",
    rateId: "rate_42c068fa6b754df8b368bf5412db4e1e",
    recipient: "Sean Murphy",
    destination: "IE",
    carrier: "FedExDefault",
    service: "FEDEX_INTERNATIONAL_PRIORITY",
    rate: 42.10
  },
  {
    shipmentId: "shp_3bc61adba3914e4db63696958dd8fda4",
    rateId: "rate_20f8a4cc5e764f799c6837d06b891a04",
    recipient: "David Thomas",
    destination: "GB",
    carrier: "USPS",
    service: "FirstClassPackageInternationalService",
    rate: 53.43
  },
  {
    shipmentId: "shp_263027013f86479db4efeb0829cfe28f",
    rateId: "rate_66a9d314d1d14423bf48a8f7c9f90fd2",
    recipient: "Keith Clark",
    destination: "NL",
    carrier: "FedExDefault",
    service: "FEDEX_INTERNATIONAL_PRIORITY",
    rate: 55.43
  },
  {
    shipmentId: "shp_fa93cd9bac214849b5132d7a2ad5386b",
    rateId: "rate_70a923b9c3aa4ae9be6b1ec13e7c7691",
    recipient: "Pedro Gonsalves Silva",
    destination: "BR",
    carrier: "UPSDAP",
    service: "UPSSaver",
    rate: 111.42
  },
  {
    shipmentId: "shp_d1fc2e99a2104f6ab937851e855f4343",
    rateId: "rate_0cb36c41b1d84ecebd9104f28b262269",
    recipient: "Vishal Kamboj",
    destination: "PT",
    carrier: "USPS",
    service: "ExpressMailInternational",
    rate: 122.41
  }
];

// Results object - initialized dynamically in main()
let results = {
  purchasedAt: null,
  totalShipments: 0,
  successful: [],
  failed: [],
  totalCost: 0
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
    req.setTimeout(FAIL_SAFE_CONFIG.requestTimeout, () => {
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

async function downloadLabel(labelUrl, filename) {
  return new Promise((resolve, reject) => {
    // Ensure labels directory exists
    if (!fs.existsSync(FAIL_SAFE_CONFIG.labelsDir)) {
      fs.mkdirSync(FAIL_SAFE_CONFIG.labelsDir, { recursive: true });
    }

    const filePath = path.join(FAIL_SAFE_CONFIG.labelsDir, filename);
    const file = fs.createWriteStream(filePath);

    https.get(labelUrl, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        https.get(response.headers.location, (redirectRes) => {
          redirectRes.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve(filePath);
          });
        }).on('error', reject);
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve(filePath);
        });
      }
    }).on('error', (err) => {
      fs.unlink(filePath, () => {}); // Delete partial file
      reject(err);
    });
  });
}

// EndShipper configuration: 'auto' | 'true' | 'false'
// - 'auto': Use EndShipper only when required by carrier (USAExportPBA/Passport consolidators)
// - 'true': Always include EndShipper ID
// - 'false': Never include EndShipper ID (default - avoids address mismatch errors)
const REQUIRE_END_SHIPPER = (process.env.EASYPOST_REQUIRE_END_SHIPPER || 'false').toLowerCase();
const END_SHIPPER_ID = process.env.EASYPOST_END_SHIPPER_ID || process.env.END_SHIPPER_ID || '';

function getEndShipperId() {
  if (REQUIRE_END_SHIPPER === 'false') {
    return null;
  }
  return END_SHIPPER_ID;
}

async function purchaseLabel(shipment) {
  const auth = Buffer.from(EASYPOST_KEY + ':').toString('base64');

  const endShipperId = getEndShipperId();
  const payload = {
    rate: {
      id: shipment.rateId
    }
  };

  // Only include end_shipper_id if configured
  if (endShipperId) {
    payload.end_shipper_id = endShipperId;
  }

  const options = {
    hostname: 'api.easypost.com',
    path: `/v2/shipments/${shipment.shipmentId}/buy`,
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
      shipmentId: response.id,
      trackingCode: response.tracking_code,
      carrier: response.selected_rate?.carrier,
      service: response.selected_rate?.service,
      rate: parseFloat(response.selected_rate?.rate || 0),
      labelUrl: response.postage_label?.label_url,
      labelFormat: response.postage_label?.label_file_type,
      publicUrl: response.tracker?.public_url
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function main() {
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`💳 SHIPPING LABEL PURCHASE`);
  console.log(`${'═'.repeat(80)}`);

  if (FAIL_SAFE_CONFIG.dryRun) {
    console.log(`\n🧪 DRY RUN MODE - No actual purchases will be made`);
  } else {
    console.log(`\n⚠️  THIS WILL CHARGE YOUR EASYPOST ACCOUNT`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: INTERACTIVE SHIPMENT SELECTION (REQUIRED)
  // ═══════════════════════════════════════════════════════════════════════════
  const selectedRates = await selectShipments(availableRates);

  if (selectedRates.length === 0) {
    console.log('No shipments selected. Exiting.\n');
    process.exit(0);
  }

  // Initialize results object
  results = {
    purchasedAt: new Date().toISOString(),
    totalShipments: selectedRates.length,
    successful: [],
    failed: [],
    totalCost: 0
  };

  const expectedTotal = selectedRates.reduce((sum, r) => sum + r.rate, 0);

  console.log(`\n📋 Shipments to purchase: ${selectedRates.length}`);
  console.log(`💰 Expected total: $${expectedTotal.toFixed(2)}`);
  console.log(`\n${'─'.repeat(80)}`);

  selectedRates.forEach((s, i) => {
    console.log(`${i+1}. ${s.recipient} (${s.destination}) - ${s.carrier} ${s.service} - $${s.rate.toFixed(2)}`);
  });

  console.log(`${'─'.repeat(80)}`);

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: RUN PRE-PURCHASE HOOKS
  // ═══════════════════════════════════════════════════════════════════════════
  try {
    await hooks.beforeAll(selectedRates, expectedTotal);
  } catch (error) {
    console.log(`\n❌ PRE-PURCHASE HOOK FAILED: ${error.message}`);
    console.log('Purchase aborted.\n');
    process.exit(1);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: INTERACTIVE CONFIRMATION
  // ═══════════════════════════════════════════════════════════════════════════
  if (!FAIL_SAFE_CONFIG.dryRun) {
    const confirmed = await confirmPurchase(selectedRates, expectedTotal);
    if (!confirmed) {
      process.exit(0);
    }
  }

  console.log(`\n🚀 Starting purchase...\n`);

  for (let i = 0; i < selectedRates.length; i++) {
    const shipment = selectedRates[i];

    console.log(`${'─'.repeat(80)}`);
    console.log(`📦 PURCHASING ${i + 1}/${selectedRates.length}: ${shipment.recipient} → ${shipment.destination}`);
    console.log(`   Shipment: ${shipment.shipmentId}`);
    console.log(`   Rate: ${shipment.rateId}`);
    console.log(`   Carrier: ${shipment.carrier} - ${shipment.service}`);
    console.log(`   Price: $${shipment.rate.toFixed(2)}`);

    // Run before-purchase hook
    await hooks.beforePurchase(shipment, i, selectedRates.length);

    // DRY RUN - simulate purchase
    if (FAIL_SAFE_CONFIG.dryRun) {
      console.log(`\n   🧪 DRY RUN: Would purchase label here`);
      console.log(`   📦 Simulated tracking: TEST${Date.now()}`);

      results.successful.push({
        ...shipment,
        trackingCode: `TEST${Date.now()}`,
        labelUrl: 'https://example.com/dry-run-label.pdf',
        publicUrl: 'https://example.com/track',
        actualRate: shipment.rate,
        dryRun: true
      });
      results.totalCost += shipment.rate;

      if (i < selectedRates.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      continue;
    }

    // ACTUAL PURCHASE with retry logic
    let retryCount = 0;
    let purchaseResult = null;

    while (retryCount <= FAIL_SAFE_CONFIG.maxRetries) {
      console.log(`\n   ⏳ Purchasing label${retryCount > 0 ? ` (retry ${retryCount})` : ''}...`);

      purchaseResult = await purchaseLabel(shipment);

      if (purchaseResult.success) {
        break;
      }

      // Run failure hook to determine if we should retry
      const shouldRetry = await hooks.onFailure(shipment, purchaseResult.error, retryCount);
      if (!shouldRetry) {
        break;
      }

      retryCount++;
      if (retryCount <= FAIL_SAFE_CONFIG.maxRetries) {
        console.log(`   ⏳ Waiting 3s before retry...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    }

    if (purchaseResult.success) {
      console.log(`\n   ✅ PURCHASED SUCCESSFULLY`);
      console.log(`   📦 Tracking: ${purchaseResult.trackingCode}`);
      console.log(`   🏷️  Label: ${purchaseResult.labelUrl}`);
      console.log(`   💰 Charged: $${purchaseResult.rate.toFixed(2)}`);

      results.successful.push({
        ...shipment,
        trackingCode: purchaseResult.trackingCode,
        labelUrl: purchaseResult.labelUrl,
        publicUrl: purchaseResult.publicUrl,
        actualRate: purchaseResult.rate
      });
      results.totalCost += purchaseResult.rate;

      // Run after-purchase hook
      await hooks.afterPurchase(shipment, purchaseResult);
    } else {
      console.log(`\n   ❌ PURCHASE FAILED (after ${retryCount + 1} attempts)`);
      console.log(`   Error: ${purchaseResult.error}`);

      results.failed.push({
        ...shipment,
        error: purchaseResult.error,
        attempts: retryCount + 1
      });

      // Stop on failure if configured
      if (FAIL_SAFE_CONFIG.stopOnFailure) {
        console.log(`\n   🛑 Stopping due to stopOnFailure setting`);
        break;
      }
    }

    // Wait between purchases
    if (i < selectedRates.length - 1) {
      console.log(`\n   ⏳ Waiting ${FAIL_SAFE_CONFIG.purchaseDelay/1000}s before next purchase...`);
      await new Promise(resolve => setTimeout(resolve, FAIL_SAFE_CONFIG.purchaseDelay));
    }
  }

  // Run after-all hook
  await hooks.afterAll(results);

  // Summary
  console.log(`\n\n${'═'.repeat(80)}`);
  console.log(`📈 PURCHASE SUMMARY`);
  console.log(`${'═'.repeat(80)}`);
  console.log(`\n✅ Successful: ${results.successful.length}`);
  console.log(`❌ Failed: ${results.failed.length}`);
  console.log(`💰 Total charged: $${results.totalCost.toFixed(2)}`);

  if (results.successful.length > 0) {
    console.log(`\n📦 PURCHASED LABELS:`);
    console.log(`${'─'.repeat(80)}`);
    results.successful.forEach((s, i) => {
      console.log(`${i+1}. ${s.recipient} (${s.destination})`);
      console.log(`   Tracking: ${s.trackingCode}`);
      console.log(`   Label: ${s.labelUrl}`);
      console.log(`   Cost: $${s.actualRate.toFixed(2)}`);
      console.log();
    });
  }

  if (results.failed.length > 0) {
    console.log(`\n❌ FAILED PURCHASES:`);
    console.log(`${'─'.repeat(80)}`);
    results.failed.forEach((s, i) => {
      console.log(`${i+1}. ${s.recipient} (${s.destination}) - ${s.error}`);
    });
  }

  // Save results as JSON
  const outputPath = path.join(__dirname, '..', 'purchased_labels.json');
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

  // Save as CSV for spreadsheet import
  if (results.successful.length > 0) {
    const csvHeaders = ['Recipient', 'Destination', 'Carrier', 'Service', 'Tracking', 'Cost', 'Label URL', 'Local Label'];
    const csvRows = results.successful.map(s => [
      s.recipient,
      s.destination,
      s.carrier,
      s.service,
      s.trackingCode,
      s.actualRate.toFixed(2),
      s.labelUrl || '',
      s.localLabelPath || ''
    ].map(v => `"${v}"`).join(','));

    const csvContent = [csvHeaders.join(','), ...csvRows].join('\n');
    const csvPath = path.join(__dirname, '..', 'purchased_labels.csv');
    fs.writeFileSync(csvPath, csvContent);
    console.log(`📊 CSV exported: purchased_labels.csv`);
  }

  console.log(`\n${'═'.repeat(80)}`);
  console.log(`📄 Results saved to: purchased_labels.json`);
  if (FAIL_SAFE_CONFIG.downloadLabels && results.successful.length > 0) {
    console.log(`📁 Labels saved to: ${FAIL_SAFE_CONFIG.labelsDir}/`);
  }
  console.log(`${'═'.repeat(80)}\n`);
}

main().catch(error => {
  console.error('\n❌ Fatal Error:', error.message);
  process.exit(1);
});
