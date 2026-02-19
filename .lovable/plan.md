
## Unplayed Song Re-send: Admin Visibility, Controls & Stats

### The Problem
The unplayed re-send system is **fully automated and invisible** right now. It fires every cron run with no admin awareness of:
- Whether it's currently active or paused
- How many re-sends have gone out
- Whether those re-sends worked (did they lead to plays?)
- Which specific orders were re-sent to

Admins need a control panel for this — similar to how the Valentine Remarketing Panel works — so they can pause/resume it, see aggregate stats, and see the list of orders where a re-send went out and whether the customer then played the song.

---

### What Will Be Built

#### 1. On/Off Toggle via `admin_settings`

The cron function currently has no kill switch for the unplayed re-send queue. The fix: at the start of Section 8, fetch `admin_settings` key `unplayed_resend_enabled`. If the value is `"false"`, skip the entire section. This is the same pattern used by the Valentine remarketing kill switch.

The `admin_settings` table already exists and is fully wired to the `automation-get-settings` edge function (GET/POST). No new edge function or migration needed.

#### 2. New `UnplayedResendPanel` Component

A new admin component rendered inside the **Automation tab** (below `AutomationDashboard`). It mirrors the `ValentineRemarketingPanel` structure with:

**Control row:**
- Toggle switch: "Unplayed Re-send" — enabled / paused
- When paused, shows a yellow "Paused" badge. When enabled, shows a green "Active" badge.

**Stats row (computed from `allOrders`):**
These are computed client-side from the already-fetched orders data — no new API calls needed.

| Stat | Source |
|---|---|
| Eligible | `status=delivered`, `delivery_status=sent`, `song_played_at IS NULL`, `sent_at > 24h ago`, `unplayed_resend_sent_at IS NULL` |
| Re-sends Sent | `unplayed_resend_sent_at IS NOT NULL` count |
| Played After Re-send | `unplayed_resend_sent_at IS NOT NULL` AND `song_played_at IS NOT NULL` AND `song_played_at > unplayed_resend_sent_at` |
| Recovery Rate | Played After Re-send ÷ Re-sends Sent |

**Re-send List (scrollable table):**
Shows all orders where `unplayed_resend_sent_at IS NOT NULL`, sorted by most recent re-send first. Columns:
- Customer name
- Recipient name  
- Re-send sent timestamp
- Song played after? (yes ✓ with timestamp / not yet ✗)
- A small badge showing play count if > 0

This gives admins the ability to answer: "Did the re-send actually work?"

#### 3. Wire `unplayed_resend_sent_at` into the Order Interface

The `Order` interface in `Admin.tsx` doesn't currently include `unplayed_resend_sent_at`. It needs to be added so the component can compute stats and render the list from the already-fetched `allOrders` data. The field exists in the DB (migration already applied) and in `types.ts`.

Also need to ensure the admin orders `GET` query (in `admin-orders/index.ts`) includes `unplayed_resend_sent_at` in the `select()` fields so it's actually returned.

#### 4. Show Re-send Status in Individual Order Detail

In the "Customer Engagement" section of the order detail dialog (the section that already shows `song_played_at`, `song_play_count`, and `song_downloaded_at`), add a row for:

- **"Follow-up Re-send:"** — `formatAdminDate(unplayed_resend_sent_at)` or "Not sent" 
- If played after re-send: shows a green ✓ indicating the re-send successfully recovered the play

---

### Files to Change

| File | Change |
|---|---|
| `supabase/functions/process-scheduled-deliveries/index.ts` | Add kill-switch check at start of Section 8 using `admin_settings.unplayed_resend_enabled` |
| `supabase/functions/admin-orders/index.ts` | Add `unplayed_resend_sent_at` to the GET select fields |
| `src/pages/Admin.tsx` | (1) Add `unplayed_resend_sent_at` to Order interface; (2) render `<UnplayedResendPanel>` inside Automation tab; (3) add re-send row in order detail engagement section |
| `src/components/admin/UnplayedResendPanel.tsx` | New component — toggle, stats cards, scrollable re-send list |

---

### How the Kill Switch Works

**In `process-scheduled-deliveries` Section 8:**
```
const { data: resendSetting } = await supabase
  .from("admin_settings")
  .select("value")
  .eq("key", "unplayed_resend_enabled")
  .maybeSingle();

if (resendSetting?.value === "false") {
  console.log("[RESEND] Skipped — disabled via admin settings");
  // skip section entirely
}
```

**In the panel (toggle handler):**
Posts to `automation-get-settings` with `key: "unplayed_resend_enabled"` and `value: "true"` or `"false"`. Same pattern as the Valentine remarketing pause toggle.

---

### Stats Logic (Client-Side, No New API)

All stats come from `allOrders` (already fetched). The component receives `allOrders` as a prop.

```typescript
const resendsSent = allOrders.filter(o => o.unplayed_resend_sent_at);
const playedAfterResend = resendsSent.filter(o => 
  o.song_played_at && 
  new Date(o.song_played_at) > new Date(o.unplayed_resend_sent_at!)
);
const eligible = allOrders.filter(o =>
  o.status === "delivered" &&
  o.delivery_status === "sent" &&
  !o.song_played_at &&
  !o.unplayed_resend_sent_at &&
  o.sent_at &&
  new Date(o.sent_at) < new Date(Date.now() - 24 * 60 * 60 * 1000)
);
const recoveryRate = resendsSent.length > 0
  ? Math.round((playedAfterResend.length / resendsSent.length) * 100)
  : 0;
```

---

### Where It Appears in the Admin UI

- **Automation tab** → below `AutomationDashboard` component
- Title: "Unplayed Song Re-send" with a toggle and status badge
- Scrollable order list (max-height with overflow-y-auto) showing each re-sent order and whether it was played afterward
- **Order detail dialog** → inside the existing "Customer Engagement" block, a new "Follow-up Re-send" row

This follows the same visual language as `AutomationDashboard` and `ValentineRemarketingPanel` so it feels native to the admin.
