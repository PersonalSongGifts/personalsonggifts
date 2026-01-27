
# Switch to Zapier for Google Sheets Sync

## Overview
Replace the Google Sheets API integration with a simple Zapier webhook. Zapier handles all Google authentication for you - no more private key issues!

## How It Works

```text
Payment Completed → Zapier Webhook → Google Sheet Row Created
```

---

## Step 1: Create Your Zap (You Do This)

1. Go to **zapier.com** and create a new Zap
2. **Trigger**: Search for "Webhooks by Zapier" → Select "Catch Hook"
3. Click Continue → **Copy the webhook URL** (starts with `https://hooks.zapier.com/hooks/catch/...`)
4. **Action**: Search for "Google Sheets" → Select "Create Spreadsheet Row"
5. Connect your Google account when prompted
6. Select your spreadsheet and worksheet
7. Map the fields (I'll list them below)

---

## Step 2: Add the Webhook Secret (I'll Prompt You)

I'll ask you to add a new secret called `ZAPIER_WEBHOOK_URL` with the URL from step 1.

---

## Step 3: Update the Payment Function (I'll Do This)

Modify `supabase/functions/process-payment/index.ts` to:
- Remove the call to `append-to-sheet`
- Add a direct call to your Zapier webhook
- Send all order data in the request

---

## Fields Zapier Will Receive

When mapping in Zapier, you'll see these fields:

| Field | Description |
|-------|-------------|
| `orderId` | Unique order ID |
| `createdAt` | Order timestamp |
| `status` | Always "paid" |
| `pricingTier` | "standard" or "priority" |
| `price` | 49 or 79 |
| `customerName` | Buyer's name |
| `customerEmail` | Buyer's email |
| `customerPhone` | Buyer's phone (optional) |
| `recipientName` | Who the song is for |
| `occasion` | Birthday, Wedding, etc. |
| `genre` | Pop, Country, etc. |
| `singerPreference` | Male, Female, etc. |
| `specialQualities` | What makes them special |
| `favoriteMemory` | Their favorite memory |
| `specialMessage` | Optional message to include |

---

## Why This Is Better

| Before (Google API) | After (Zapier) |
|---------------------|----------------|
| Complex service account setup | Just paste a URL |
| Private key formatting issues | No authentication needed |
| Hard to debug | See every request in Zapier |
| Only Google Sheets | Can add Slack, email, etc. |

---

## Summary

1. **You create** a Zap with webhook trigger → Google Sheets action
2. **You add** the `ZAPIER_WEBHOOK_URL` secret
3. **I update** the `process-payment` function to call Zapier
4. **Test** with a real order and watch it appear in your sheet!
