

# Google Sheets Order Sync Integration

## Overview
Automatically append new orders to your Google Sheet when payments are successfully processed. This creates a real-time order tracking system without any manual data entry.

## Prerequisites Completed
- Google Service Account created and configured
- Google Sheet shared with service account email
- All three credentials extracted and ready

## Implementation Steps

### Step 1: Add Required Secrets
Add three secrets to Lovable Cloud:
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - The service account email address
- `GOOGLE_PRIVATE_KEY` - The private key from the JSON file
- `GOOGLE_SPREADSHEET_ID` - Your spreadsheet ID

### Step 2: Create append-to-sheet Edge Function
Build a new backend function that:
- Accepts order data as input
- Generates a JWT token using the service account credentials
- Exchanges the JWT for a Google access token
- Appends a new row to your spreadsheet via Google Sheets API
- Handles errors gracefully (orders still complete if sheet sync fails)

### Step 3: Update process-payment Function
Modify the existing payment processing to:
- Call the new `append-to-sheet` function after successful order creation
- Pass all relevant order data for the spreadsheet row
- Continue normally even if sheet sync fails (non-blocking)

## Google Sheet Column Structure
Your sheet will receive rows with these 16 columns:

| Column | Data |
|--------|------|
| A | Order ID |
| B | Created At (timestamp) |
| C | Status |
| D | Pricing Tier |
| E | Price |
| F | Customer Name |
| G | Customer Email |
| H | Phone |
| I | Recipient Name |
| J | Occasion |
| K | Genre |
| L | Singer Preference |
| M | Relationship |
| N | Special Qualities |
| O | Favorite Memory |
| P | Special Message |

## Technical Details

### append-to-sheet Function Architecture

```text
Request Flow:
1. Receive order data from process-payment
2. Create JWT claim with service account email
3. Sign JWT with private key (RS256)
4. POST to Google OAuth to get access token
5. POST to Sheets API to append row
6. Return success/failure status
```

### Google Sheets API Endpoint
```text
POST https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}:append
```

### Error Handling Strategy
- Sheet sync failures are logged but don't block order completion
- Customer still receives confirmation email
- Order is still saved to database
- Retry logic can be added later if needed

## Testing
After implementation:
1. Place a test order using the `HyperdriveFREE2026` coupon
2. Verify the order appears in your Google Sheet within seconds
3. Check that all 16 columns are populated correctly

