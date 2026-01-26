

# Connect Google Sheets to Order Flow

## Overview

I'll create a direct integration between your order flow and Google Sheets. When a successful payment is processed, the order data will automatically be appended as a new row in your Google Sheet.

## What You'll Need to Set Up First

### Google Cloud Console Setup (you do this)

1. **Go to** [Google Cloud Console](https://console.cloud.google.com)
2. **Create a new project** (or use an existing one)
3. **Enable the Google Sheets API**:
   - Go to "APIs & Services" → "Library"
   - Search for "Google Sheets API" and enable it
4. **Create a Service Account**:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "Service Account"
   - Give it a name (e.g., "Personal Song Gifts Orders")
   - Copy the **email address** (looks like `name@project-id.iam.gserviceaccount.com`)
5. **Generate a Key**:
   - Click on the service account → "Keys" tab → "Add Key" → "Create new key"
   - Choose **JSON** format
   - Download the file — it contains the private key you'll need

### Share Your Google Sheet

1. Open your Google Sheet
2. Click "Share" and add the **service account email** as an Editor
3. Copy the **Spreadsheet ID** from the URL:
   - `https://docs.google.com/spreadsheets/d/`**`THIS_PART_IS_THE_ID`**`/edit`

## What I'll Build

### 1. New Backend Function: `append-to-sheet`

A dedicated function that:
- Authenticates with Google using your service account credentials
- Appends order data as a new row in your spreadsheet
- Can be called from the payment processing flow

### 2. Integration with Payment Flow

After a successful payment, the `process-payment` function will:
1. Create the order in the database ✓ (already does this)
2. Send confirmation email ✓ (already does this)
3. **NEW:** Append order to Google Sheet

### 3. Secrets Required

You'll need to add these secrets:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` — The service account email
- `GOOGLE_PRIVATE_KEY` — The private key from the JSON file (the long string starting with `-----BEGIN PRIVATE KEY-----`)
- `GOOGLE_SPREADSHEET_ID` — Your spreadsheet ID from the URL

## Google Sheet Column Structure

The function will append rows with these columns (in order):

| A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Order ID | Created At | Status | Tier | Price | Customer Name | Customer Email | Phone | Recipient | Occasion | Genre | Singer | Relationship | Special Qualities | Memory | Message |

Make sure your Google Sheet has a header row with these columns (or similar) so the data aligns correctly.

---

## Technical Details

### append-to-sheet Edge Function

```text
supabase/functions/append-to-sheet/index.ts
```

This function will:
1. Accept order data as JSON payload
2. Generate a JWT using the service account credentials
3. Exchange the JWT for an access token from Google
4. Call the Google Sheets API to append the row
5. Handle errors gracefully (order still completes even if sheet fails)

### process-payment Update

After sending the confirmation email, add a call to `append-to-sheet`:

```text
// After email send (around line 156)
try {
  await fetch(`${supabaseUrl}/functions/v1/append-to-sheet`, {
    method: "POST",
    headers: { ... },
    body: JSON.stringify({ orderData }),
  });
} catch (sheetError) {
  console.error("Failed to append to Google Sheet:", sheetError);
  // Don't fail the order if sheet append fails
}
```

---

## Summary of Steps

1. **You**: Set up Google Cloud service account and share your sheet
2. **You**: Provide me with the 3 secrets (email, private key, spreadsheet ID)
3. **Me**: Create the `append-to-sheet` function
4. **Me**: Update `process-payment` to call the new function
5. **Test**: Place a test order and verify it appears in your Google Sheet

