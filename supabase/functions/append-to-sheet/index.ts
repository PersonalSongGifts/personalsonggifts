const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Base64URL encode for JWT
function base64urlEncode(data: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function textToBase64Url(text: string): string {
  const encoder = new TextEncoder();
  return base64urlEncode(encoder.encode(text));
}

// Import PEM private key for RS256 signing
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  // Handle escaped newlines from environment variables and remove headers
  const normalizedPem = pem.replace(/\\n/g, "\n");
  const pemContents = normalizedPem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  // Decode base64 to binary
  const binaryString = atob(pemContents);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  return await crypto.subtle.importKey(
    "pkcs8",
    bytes,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );
}

// Create and sign a JWT for Google API
async function createGoogleJWT(
  serviceAccountEmail: string,
  privateKey: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const expiry = now + 3600; // 1 hour

  const header = {
    alg: "RS256",
    typ: "JWT",
  };

  const payload = {
    iss: serviceAccountEmail,
    scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: expiry,
  };

  const headerB64 = textToBase64Url(JSON.stringify(header));
  const payloadB64 = textToBase64Url(JSON.stringify(payload));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const key = await importPrivateKey(privateKey);
  const encoder = new TextEncoder();
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(unsignedToken)
  );

  const signatureB64 = base64urlEncode(new Uint8Array(signature));
  return `${unsignedToken}.${signatureB64}`;
}

// Exchange JWT for access token
async function getAccessToken(jwt: string): Promise<string> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to get access token: ${errorText}`);
  }

  const data = await response.json();
  return data.access_token;
}

// Append a row to Google Sheets
async function appendToSheet(
  accessToken: string,
  spreadsheetId: string,
  values: string[]
): Promise<void> {
  const range = "Sheet1!A:R"; // Columns A through R (18 columns for unified Order/Lead + quality score)
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      values: [values],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to append to sheet: ${errorText}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await req.json();

    // Get secrets
    const serviceAccountEmail = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    let privateKey = Deno.env.get("GOOGLE_PRIVATE_KEY") || "";
    const spreadsheetId = Deno.env.get("GOOGLE_SPREADSHEET_ID");

    console.log("Private key starts with:", privateKey.substring(0, 50));
    console.log("Private key length:", privateKey.length);

    // Handle case where full JSON credentials file was pasted instead of just the private key
    if (privateKey.trim().startsWith("{")) {
      try {
        const credentials = JSON.parse(privateKey);
        privateKey = credentials.private_key || "";
        console.log("Extracted private_key from JSON credentials, length:", privateKey.length);
      } catch (e) {
        console.error("Failed to parse GOOGLE_PRIVATE_KEY as JSON:", e);
      }
    }

    // Normalize escaped newlines to actual newlines (important for PEM parsing)
    privateKey = privateKey.replace(/\\n/g, "\n");
    
    console.log("After normalization, key starts with:", privateKey.substring(0, 30));
    console.log("Key contains BEGIN marker:", privateKey.includes("-----BEGIN PRIVATE KEY-----"));

    if (!serviceAccountEmail || !privateKey || !spreadsheetId) {
      console.error("Missing Google Sheets credentials - email:", !!serviceAccountEmail, "key:", !!privateKey, "spreadsheet:", !!spreadsheetId);
      return new Response(
        JSON.stringify({ error: "Google Sheets not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create JWT and get access token
    const jwt = await createGoogleJWT(serviceAccountEmail, privateKey);
    const accessToken = await getAccessToken(jwt);

    // Helper to format date in PST
    const formatPST = (isoString: string | undefined): string => {
      if (!isoString) {
        isoString = new Date().toISOString();
      }
      const date = new Date(isoString);
      return date.toLocaleString("en-US", { 
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false
      }) + " PST";
    };

    // Determine if this is an Order or a Lead based on presence of orderId
    const entryType = data.orderId ? "Order" : "Lead";
    const entryId = data.orderId || data.leadId || "";

    // Build row data (18 columns for unified Order/Lead sheet)
    // Column A: Type (Order/Lead)
    // Column B: ID (Order UUID or Lead UUID)
    // Column C: Created At
    // Column D: Status
    // Column E: Tier (empty for leads)
    // Column F: Price (empty for leads)
    // Column G: Customer Name
    // Column H: Customer Email
    // Column I: Customer Phone
    // Column J: Recipient Name
    // Column K: Occasion
    // Column L: Genre
    // Column M: Singer Preference
    // Column N: Special Qualities
    // Column O: Favorite Memory
    // Column P: Special Message
    // Column Q: Device Type (for tracking)
    // Column R: Quality Score (for leads)
    const rowValues = [
      entryType,
      entryId,
      formatPST(data.createdAt || data.capturedAt),
      data.status || (entryType === "Order" ? "paid" : "lead"),
      data.pricingTier || "",
      data.price?.toString() || "",
      data.customerName || "",
      data.customerEmail || "",
      data.customerPhone || "",
      data.recipientName || "",
      data.occasion || "",
      data.genre || "",
      data.singerPreference || "",
      data.specialQualities || "",
      data.favoriteMemory || "",
      data.specialMessage || "",
      data.deviceType || "",
      data.qualityScore?.toString() || "",
    ];

    await appendToSheet(accessToken, spreadsheetId, rowValues);

    console.log(`${entryType} ${entryId} synced to Google Sheets`);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Append to sheet error:", error);
    const message = error instanceof Error ? error.message : "Failed to sync to Google Sheets";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
