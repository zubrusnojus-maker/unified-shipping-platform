const https = require("https");

const API_KEY = process.env.EASYSHIP_API_KEY;
if (!API_KEY) {
  console.error("EASYSHIP_API_KEY required");
  process.exit(1);
}

// Warehouse addresses to create (matching EasyPost setup)
const warehouseAddresses = [
  {
    name: "BushFlex Denim Co. - LA Warehouse",
    company_name: "BushFlex Denim Co.",
    contact_name: "Warehouse Operations",
    line_1: "2100 E 7th Pl",
    city: "Los Angeles",
    state: "CA",
    postal_code: "90021",
    country_alpha2: "US",
    contact_phone: "2135550142",
    contact_email: "fulfillment@bushflex-warehouse.com"
  },
  {
    name: "ConnectorPro Supply - Fremont",
    company_name: "ConnectorPro Supply",
    contact_name: "Shipping Department",
    line_1: "1850 Gateway Blvd",
    city: "Fremont",
    state: "CA",
    postal_code: "94538",
    country_alpha2: "US",
    contact_phone: "5105550198",
    contact_email: "shipping@connectorpro-fulfillment.com"
  }
];

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

async function listAddresses() {
  console.log("======================================================================");
  console.log("  Listing Existing Easyship Addresses");
  console.log("======================================================================\n");

  const { result, statusCode } = await makeRequest("GET", "/addresses");

  if (statusCode !== 200) {
    console.log("  Error (" + statusCode + "): " + JSON.stringify(result, null, 2));
    return [];
  }

  const addresses = result.addresses || [];
  if (addresses.length === 0) {
    console.log("  No addresses found.\n");
    return [];
  }

  addresses.forEach((addr, i) => {
    console.log("  " + (i+1) + ". " + (addr.company_name || addr.contact_name || "Unknown"));
    console.log("     ID: " + addr.id);
    console.log("     " + addr.line_1 + (addr.line_2 ? ", " + addr.line_2 : ""));
    console.log("     " + addr.city + ", " + addr.state + " " + addr.postal_code + " " + addr.country_alpha2);
    console.log("     Phone: " + (addr.contact_phone || "N/A"));
    console.log("     Email: " + (addr.contact_email || "N/A"));
    console.log("");
  });

  return addresses;
}

async function createAddress(address) {
  console.log("  Creating: " + address.name + "...");

  // Easyship 2024-09 API expects fields directly, not nested
  const { result, statusCode } = await makeRequest("POST", "/addresses", address);

  if (statusCode === 200 || statusCode === 201) {
    const addr = result.address || result;
    console.log("    ✅ Created! ID: " + addr.id);
    return addr;
  } else {
    console.log("    ❌ Error (" + statusCode + "): " + JSON.stringify(result, null, 2));
    return null;
  }
}

async function updateAddress(id, updates) {
  console.log("  Updating address " + id + "...");

  const { result, statusCode } = await makeRequest("PATCH", "/addresses/" + id, { address: updates });

  if (statusCode === 200) {
    console.log("    ✅ Updated!");
    return result.address || result;
  } else {
    console.log("    ❌ Error (" + statusCode + "): " + JSON.stringify(result, null, 2));
    return null;
  }
}

async function deleteAddress(id) {
  console.log("  Deleting address " + id + "...");

  const { result, statusCode } = await makeRequest("DELETE", "/addresses/" + id);

  if (statusCode === 200 || statusCode === 204) {
    console.log("    ✅ Deleted!");
    return true;
  } else {
    console.log("    ❌ Error (" + statusCode + "): " + JSON.stringify(result, null, 2));
    return false;
  }
}

async function main() {
  const action = process.argv[2] || "list";

  switch (action) {
    case "list":
      await listAddresses();
      break;

    case "create":
      console.log("======================================================================");
      console.log("  Creating Warehouse Addresses");
      console.log("======================================================================\n");

      for (const addr of warehouseAddresses) {
        await createAddress(addr);
      }
      console.log("\n  Done!\n");
      break;

    case "create-all":
      // First list, then create any missing
      const existing = await listAddresses();
      const existingNames = existing.map(a => a.company_name?.toLowerCase() || "");

      console.log("======================================================================");
      console.log("  Creating Missing Warehouse Addresses");
      console.log("======================================================================\n");

      for (const addr of warehouseAddresses) {
        if (existingNames.includes(addr.company_name.toLowerCase())) {
          console.log("  ⏭️  Skipping " + addr.name + " (already exists)");
        } else {
          await createAddress(addr);
        }
      }
      console.log("\n  Done!\n");
      break;

    case "delete":
      const idToDelete = process.argv[3];
      if (!idToDelete) {
        console.log("Usage: node manage-easyship-addresses.cjs delete <address_id>");
        process.exit(1);
      }
      await deleteAddress(idToDelete);
      break;

    case "update":
      const idToUpdate = process.argv[3];
      if (!idToUpdate) {
        console.log("Usage: node manage-easyship-addresses.cjs update <address_id>");
        process.exit(1);
      }
      // Example update - customize as needed
      await updateAddress(idToUpdate, {
        contact_phone: "2135551234"
      });
      break;

    default:
      console.log("Usage: node manage-easyship-addresses.cjs [list|create|create-all|delete|update]");
      console.log("");
      console.log("Commands:");
      console.log("  list       - List all existing addresses");
      console.log("  create     - Create warehouse addresses");
      console.log("  create-all - Create missing warehouse addresses");
      console.log("  delete <id> - Delete an address by ID");
      console.log("  update <id> - Update an address by ID");
  }
}

main().catch(console.error);
