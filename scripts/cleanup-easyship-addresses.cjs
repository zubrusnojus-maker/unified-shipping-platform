const https = require("https");

const API_KEY = process.env.EASYSHIP_API_KEY;
if (!API_KEY) {
  console.error("EASYSHIP_API_KEY required");
  process.exit(1);
}

function makeRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: "public-api.easyship.com",
      path: "/2024-09" + path,
      method: method,
      headers: {
        "Authorization": "Bearer " + API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json"
      }
    };

    if (bodyStr) {
      options.headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const result = data ? JSON.parse(data) : {};
          resolve({ result, statusCode: res.statusCode });
        } catch (e) {
          resolve({ result: data, statusCode: res.statusCode });
        }
      });
    });
    req.on("error", reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// Addresses to delete (duplicates and old entries)
const addressesToDelete = [
  // Duplicates
  { id: "66679e7e-7c42-4359-aca1-fcdc044c9bd3", name: "Crossroads Trading BH (duplicate)" },
  { id: "36aaff20-1eca-41ff-9779-87904fe73776", name: "Perfectstitches (duplicate)" },
  { id: "67c8a1a6-d62e-4949-a59b-20612c8245d4", name: "REI Las Vegas (duplicate)" },
  { id: "89bef167-b08f-44e7-aa21-3d878a7d1f89", name: "Desert Tech Distribution (duplicate)" },
  // Old/test entries
  { id: "7164c5f2-0741-4b87-a730-71833ebaec6b", name: "x (test entry)" },
];

// New warehouse addresses to create
const newAddresses = [
  {
    company_name: "BushFlex Denim Co.",
    contact_name: "Warehouse Operations",
    line_1: "2100 E 7th Pl",
    city: "Los Angeles",
    state: "CA",
    postal_code: "90021",
    country_alpha2: "US",
    contact_phone: "+12135550142",
    contact_email: "fulfillment@bushflex-warehouse.com"
  },
  {
    company_name: "ConnectorPro Supply",
    contact_name: "Shipping Department",
    line_1: "1850 Gateway Blvd",
    city: "Fremont",
    state: "CA",
    postal_code: "94538",
    country_alpha2: "US",
    contact_phone: "+15105550198",
    contact_email: "shipping@connectorpro-fulfillment.com"
  },
  {
    company_name: "Vegas Distribution Center",
    contact_name: "Shipping Team",
    line_1: "4505 S Maryland Pkwy",
    city: "Las Vegas",
    state: "NV",
    postal_code: "89119",
    country_alpha2: "US",
    contact_phone: "+17025551234",
    contact_email: "shipping@vegasdistro.com"
  },
  {
    company_name: "LA Fashion Warehouse",
    contact_name: "Fulfillment Center",
    line_1: "800 E 12th St",
    city: "Los Angeles",
    state: "CA",
    postal_code: "90021",
    country_alpha2: "US",
    contact_phone: "+12135559876",
    contact_email: "orders@lafashionwh.com"
  }
];

async function deleteAddress(id, name) {
  console.log("  Deleting: " + name);
  const { result, statusCode } = await makeRequest("DELETE", "/addresses/" + id);

  if (statusCode === 200 || statusCode === 204 || statusCode === 404) {
    console.log("    ✅ Deleted (or already gone)");
    return true;
  } else {
    console.log("    ❌ Error (" + statusCode + "): " + JSON.stringify(result));
    return false;
  }
}

async function createAddress(address) {
  console.log("  Creating: " + address.company_name);
  const { result, statusCode } = await makeRequest("POST", "/addresses", address);

  if (statusCode === 200 || statusCode === 201) {
    const addr = result.address || result;
    console.log("    ✅ Created! ID: " + addr.id + " (status: " + addr.status + ")");
    return addr;
  } else {
    console.log("    ❌ Error (" + statusCode + "): " + JSON.stringify(result, null, 2));
    return null;
  }
}

async function listAddresses() {
  const { result, statusCode } = await makeRequest("GET", "/addresses?per_page=100");
  if (statusCode !== 200) {
    console.log("Error listing addresses");
    return [];
  }
  return result.addresses || [];
}

async function main() {
  const action = process.argv[2] || "preview";

  if (action === "preview") {
    console.log("═".repeat(60));
    console.log("  ADDRESS CLEANUP PREVIEW");
    console.log("═".repeat(60));

    console.log("\n  Will DELETE these addresses:");
    addressesToDelete.forEach((a, i) => {
      console.log("    " + (i+1) + ". " + a.name);
      console.log("       ID: " + a.id);
    });

    console.log("\n  Will CREATE these addresses:");
    newAddresses.forEach((a, i) => {
      console.log("    " + (i+1) + ". " + a.company_name);
      console.log("       " + a.line_1 + ", " + a.city + " " + a.state + " " + a.postal_code);
    });

    console.log("\n  Run with 'execute' to perform these changes:");
    console.log("  node cleanup-easyship-addresses.cjs execute");

  } else if (action === "execute") {
    console.log("═".repeat(60));
    console.log("  EXECUTING ADDRESS CLEANUP");
    console.log("═".repeat(60));

    // Delete old addresses
    console.log("\n  DELETING OLD ADDRESSES:");
    console.log("  " + "─".repeat(50));
    for (const addr of addressesToDelete) {
      await deleteAddress(addr.id, addr.name);
    }

    // Create new addresses
    console.log("\n  CREATING NEW ADDRESSES:");
    console.log("  " + "─".repeat(50));
    const created = [];
    for (const addr of newAddresses) {
      const result = await createAddress(addr);
      if (result) created.push(result);
    }

    // Show final list
    console.log("\n  FINAL ADDRESS LIST:");
    console.log("  " + "─".repeat(50));
    const addresses = await listAddresses();
    const usAddresses = addresses.filter(a => a.country_alpha2 === "US");
    console.log("  US Addresses (" + usAddresses.length + "):");
    usAddresses.forEach((a, i) => {
      console.log("    " + (i+1) + ". " + (a.company_name || a.contact_name));
      console.log("       " + a.city + ", " + a.state + " " + a.postal_code + " | Status: " + a.status);
    });

    console.log("\n  ⚠️  Note: New addresses are in 'draft' status.");
    console.log("  To activate them, go to: https://app.easyship.com → Settings → Addresses");

  } else if (action === "list") {
    const addresses = await listAddresses();
    console.log("Current addresses (" + addresses.length + "):\n");
    addresses.forEach((a, i) => {
      console.log((i+1) + ". " + (a.company_name || a.contact_name));
      console.log("   ID: " + a.id);
      console.log("   " + a.line_1 + ", " + a.city + " " + a.state + " " + a.postal_code + " " + a.country_alpha2);
      console.log("   Status: " + a.status);
      console.log("");
    });
  }
}

main().catch(console.error);
