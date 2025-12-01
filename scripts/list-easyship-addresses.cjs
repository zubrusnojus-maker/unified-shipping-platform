const https = require("https");

const API_KEY = process.env.EASYSHIP_API_KEY;
if (!API_KEY) {
  console.error("EASYSHIP_API_KEY required");
  process.exit(1);
}

const options = {
  hostname: "public-api.easyship.com",
  path: "/2024-09/addresses?per_page=100",
  method: "GET",
  headers: {
    "Authorization": "Bearer " + API_KEY,
    "Accept": "application/json"
  }
};

const req = https.request(options, (res) => {
  let data = "";
  res.on("data", chunk => data += chunk);
  res.on("end", () => {
    const result = JSON.parse(data);
    const addresses = result.addresses || [];

    // Group by country
    const byCountry = {};
    addresses.forEach(a => {
      const country = a.country_alpha2 || "??";
      if (!byCountry[country]) byCountry[country] = [];
      byCountry[country].push(a);
    });

    console.log("═".repeat(60));
    console.log("  EASYSHIP SAVED ADDRESSES (" + addresses.length + " total)");
    console.log("═".repeat(60));

    Object.keys(byCountry).sort().forEach(country => {
      console.log("\n  📍 " + country + " (" + byCountry[country].length + " addresses)");
      console.log("  " + "─".repeat(50));
      byCountry[country].forEach((a, i) => {
        console.log("  " + (i+1) + ". " + (a.company_name || a.contact_name));
        console.log("     ID: " + a.id);
        console.log("     " + a.line_1 + ", " + a.city + " " + a.postal_code);
        console.log("     Status: " + a.status);
      });
    });

    console.log("\n" + "═".repeat(60));
    console.log("  To add new warehouse addresses:");
    console.log("  https://app.easyship.com → Settings → Addresses");
    console.log("═".repeat(60));
  });
});
req.end();
