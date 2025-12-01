const https = require("https");

const API_KEY = process.env.EASYSHIP_API_KEY;
if (!API_KEY) {
  console.error("EASYSHIP_API_KEY required");
  process.exit(1);
}

const shipments = [
  {
    name: "Shawn Irwan",
    country: "MY",
    from: {
      line_1: "2100 E 7th Pl",
      city: "Los Angeles",
      state: "CA",
      postal_code: "90021",
      country_alpha2: "US",
      contact_name: "Warehouse Operations",
      company_name: "BushFlex Denim Co.",
      contact_phone: "2135550142",
      contact_email: "fulfillment@bushflex-warehouse.com"
    },
    to: {
      line_1: "KK12 Kolej Kediaman 12",
      line_2: "Lingkaran Wawasan",
      city: "Kuala Lumpur",
      state: "WP",
      postal_code: "50603",
      country_alpha2: "MY",
      contact_name: "Shawn Irwan",
      company_name: "Universiti Malaya",
      contact_phone: "60164398827",
      contact_email: "shawn.irwan.order@example.com"
    },
    parcel: { total_actual_weight: 5.8, box: { length: 16, width: 12, height: 4 } },
    customs: {
      description: "Denim hiking pants 34x32",
      value: 104.00,
      hsCode: "6203.42",
      quantity: 4
    }
  },
  {
    name: "Lefteris Panagopoulos",
    country: "GR",
    from: {
      line_1: "1850 Gateway Blvd",
      city: "Fremont",
      state: "CA",
      postal_code: "94538",
      country_alpha2: "US",
      contact_name: "Shipping Department",
      company_name: "ConnectorPro Supply",
      contact_phone: "5105550198",
      contact_email: "shipping@connectorpro-fulfillment.com"
    },
    to: {
      line_1: "Vatatzi 42",
      line_2: "Sikies",
      city: "Thessaloniki",
      postal_code: "56625",
      country_alpha2: "GR",
      contact_name: "Lefteris Panagopoulos",
      contact_phone: "306955606515",
      contact_email: "lefteris.panag.order@example.com"
    },
    parcel: { total_actual_weight: 3.7, box: { length: 12, width: 12, height: 4 } },
    customs: {
      description: "Wire connectors 15PCS",
      value: 114.99,
      hsCode: "8536.69",
      quantity: 1
    }
  }
];

async function createShipment(shipment) {
  return new Promise((resolve, reject) => {
    const payload = {
      origin_address: shipment.from,
      destination_address: shipment.to,
      incoterms: "DDU",
      insurance: { is_insured: false },
      shipping_settings: {
        units: { weight: "lb", dimensions: "in" },
        output_currency: "USD"
      },
      parcels: [{
        total_actual_weight: shipment.parcel.total_actual_weight,
        box: shipment.parcel.box,
        items: [{
          description: shipment.customs.description,
          quantity: shipment.customs.quantity,
          actual_weight: shipment.parcel.total_actual_weight / shipment.customs.quantity,
          declared_currency: "USD",
          declared_customs_value: shipment.customs.value,
          hs_code: shipment.customs.hsCode,
          origin_country_alpha2: "US"
        }]
      }]
    };

    const body = JSON.stringify(payload);
    const options = {
      hostname: "public-api.easyship.com",
      path: "/2024-09/shipments",
      method: "POST",
      headers: {
        "Authorization": "Bearer " + API_KEY,
        "Content-Type": "application/json",
        "Accept": "application/json",
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
  console.log("Creating Easyship shipments (without buying labels)...\n");

  const createdShipments = [];

  for (const shipment of shipments) {
    console.log("======================================================================");
    console.log("  " + shipment.name + " (" + shipment.country + ")");
    console.log("======================================================================");

    try {
      const { result, statusCode } = await createShipment(shipment);

      if (statusCode !== 200 && statusCode !== 201) {
        console.log("  Error (" + statusCode + "): " + JSON.stringify(result, null, 2));
        continue;
      }

      const shipmentData = result.shipment || result;
      console.log("  ✅ Shipment created!");
      console.log("  Shipment ID: " + shipmentData.easyship_shipment_id);
      console.log("  Status: " + shipmentData.shipment_state);
      console.log("  Platform Order #: " + (shipmentData.platform_order_number || "N/A"));

      // Show available rates if included
      if (shipmentData.rates && shipmentData.rates.length > 0) {
        console.log("\n  Available Rates (" + shipmentData.rates.length + "):");

        // Find FedEx rates
        const fedexRates = shipmentData.rates.filter(r => {
          const name = (r.courier_service?.umbrella_name || r.courier_service?.name || "").toLowerCase();
          return name.includes("fedex");
        });

        if (fedexRates.length > 0) {
          console.log("\n  *** FedEx Options ***");
          fedexRates.forEach((rate, i) => {
            const cost = rate.rates_in_origin_currency?.total_charge || rate.total_charge || "N/A";
            const days = (rate.min_delivery_time || "?") + "-" + (rate.max_delivery_time || "?");
            const serviceName = rate.courier_service?.name || "";
            const courierId = rate.courier_service?.id;
            console.log("    " + (i+1) + ". " + serviceName);
            console.log("       $" + cost + " | " + days + " days | ID: " + courierId);
          });
        }

        // Show cheapest 5
        const sorted = shipmentData.rates.sort((a, b) => {
          const costA = a.rates_in_origin_currency?.total_charge || a.total_charge || 0;
          const costB = b.rates_in_origin_currency?.total_charge || b.total_charge || 0;
          return parseFloat(costA) - parseFloat(costB);
        });

        console.log("\n  *** Top 5 Cheapest ***");
        sorted.slice(0, 5).forEach((rate, i) => {
          const cost = rate.rates_in_origin_currency?.total_charge || rate.total_charge || "N/A";
          const days = (rate.min_delivery_time || "?") + "-" + (rate.max_delivery_time || "?");
          const courierName = rate.courier_service?.umbrella_name || "Unknown";
          const serviceName = rate.courier_service?.name || "";
          const courierId = rate.courier_service?.id;
          console.log("    " + (i+1) + ". " + courierName + " - " + serviceName);
          console.log("       $" + cost + " | " + days + " days | ID: " + courierId);
        });
      }

      createdShipments.push({
        name: shipment.name,
        country: shipment.country,
        easyship_shipment_id: shipmentData.easyship_shipment_id,
        status: shipmentData.shipment_state,
        rates: shipmentData.rates || []
      });

    } catch (err) {
      console.log("  Error: " + err.message);
    }
    console.log("");
  }

  // Summary
  console.log("\n======================================================================");
  console.log("  SUMMARY - Created Shipments");
  console.log("======================================================================");
  createdShipments.forEach((s, i) => {
    console.log("  " + (i+1) + ". " + s.name + " (" + s.country + ")");
    console.log("     Shipment ID: " + s.easyship_shipment_id);
    console.log("     Status: " + s.status);
    console.log("     Rates available: " + s.rates.length);
  });

  // Save to JSON
  const fs = require("fs");
  fs.writeFileSync(
    "/Users/andrejsp112/unified-shipping-platform/easyship_shipments.json",
    JSON.stringify(createdShipments, null, 2)
  );
  console.log("\n  Saved to easyship_shipments.json");
}

main();
