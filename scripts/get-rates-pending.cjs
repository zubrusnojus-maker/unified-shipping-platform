const https = require("https");

const API_KEY = process.env.EASYPOST_API_KEY;
if (!API_KEY) {
  console.error("EASYPOST_API_KEY required");
  process.exit(1);
}

const auth = Buffer.from(API_KEY + ":").toString("base64");

const shipments = [
  {
    name: "Shawn Irwan",
    country: "MY",
    from: {
      company: "BushFlex Denim Co.",
      name: "Warehouse Operations",
      street1: "2100 E 7th Pl",
      city: "Los Angeles",
      state: "CA",
      zip: "90021",
      country: "US",
      phone: "2135550142"
    },
    to: {
      name: "Shawn Irwan",
      company: "Universiti Malaya",
      street1: "KK12 Kolej Kediaman 12",
      street2: "Lingkaran Wawasan",
      city: "Kuala Lumpur",
      state: "WP",
      zip: "50603",
      country: "MY",
      phone: "60164398827",
      email: "shawn.irwan.order@example.com"
    },
    parcel: { weight: 5.8 * 16, length: 16, width: 12, height: 4 },
    customs: {
      description: "Denim hiking pants 34x32",
      value: 104.00,
      hsCode: "6203.42.4011",
      quantity: 4
    }
  },
  {
    name: "Lefteris Panagopoulos",
    country: "GR",
    from: {
      company: "ConnectorPro Supply",
      name: "Shipping Department",
      street1: "1850 Gateway Blvd",
      city: "Fremont",
      state: "CA",
      zip: "94538",
      country: "US",
      phone: "5105550198"
    },
    to: {
      name: "Lefteris Panagopoulos",
      street1: "Vatatzi 42",
      street2: "Sikies",
      city: "Thessaloniki",
      zip: "56625",
      country: "GR",
      phone: "306955606515",
      email: "lefteris.panag.order@example.com"
    },
    parcel: { weight: 3.7 * 16, length: 12, width: 12, height: 4 },
    customs: {
      description: "Wire connectors 15PCS",
      value: 114.99,
      hsCode: "8536.69.4040",
      quantity: 1
    }
  }
];

async function getRates(shipment) {
  return new Promise((resolve, reject) => {
    const payload = {
      shipment: {
        from_address: shipment.from,
        to_address: shipment.to,
        parcel: shipment.parcel,
        customs_info: {
          contents_type: "merchandise",
          contents_explanation: "Retail goods",
          customs_certify: true,
          customs_signer: shipment.from.name,
          eel_pfc: "NOEEI 30.37(a)",
          non_delivery_option: "return",
          restriction_type: "none",
          customs_items: [{
            description: shipment.customs.description,
            quantity: shipment.customs.quantity,
            weight: shipment.parcel.weight,
            value: shipment.customs.value,
            hs_tariff_number: shipment.customs.hsCode,
            origin_country: "US"
          }]
        },
        options: { label_format: "PNG" }
      }
    };

    const body = JSON.stringify(payload);
    const options = {
      hostname: "api.easypost.com",
      path: "/v2/shipments",
      method: "POST",
      headers: {
        "Authorization": "Basic " + auth,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const result = JSON.parse(data);
          resolve({ shipment, result, statusCode: res.statusCode });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  console.log("Getting rates for 2 unpurchased shipments (MY, GR)...\n");

  for (const shipment of shipments) {
    console.log("======================================================================");
    console.log("  " + shipment.name + " (" + shipment.country + ")");
    console.log("======================================================================");

    try {
      const { result, statusCode } = await getRates(shipment);

      if (statusCode !== 200 && statusCode !== 201) {
        console.log("  Error: " + (result.error?.message || JSON.stringify(result)));
        continue;
      }

      console.log("  Shipment ID: " + result.id);
      console.log("\n  Available Rates:");

      const rates = result.rates.sort((a, b) => parseFloat(a.rate) - parseFloat(b.rate));
      rates.forEach((rate, i) => {
        const days = rate.delivery_days ? rate.delivery_days + " days" : "N/A";
        console.log("    " + (i+1) + ". " + rate.carrier + " " + rate.service);
        console.log("       $" + rate.rate + " | " + days + " | " + rate.id);
      });

      if (rates.length === 0) {
        console.log("  No rates available for this destination");
      }
    } catch (err) {
      console.log("  Error: " + err.message);
    }
    console.log("");
  }
}

main();
