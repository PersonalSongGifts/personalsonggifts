

## Fix Order 9FAF8508 — Copy Song Data from Lead

The lead (5AFF8D50) has all assets. The order needs them patched in.

### SQL Migration

```sql
UPDATE orders
SET 
  song_url = 'https://kjyhxodusvodkknmgmra.supabase.co/storage/v1/object/public/songs/leads/5AFF8D50-full.mp3',
  cover_image_url = 'https://kjyhxodusvodkknmgmra.supabase.co/storage/v1/object/public/songs/leads/5AFF8D50-cover.jpg',
  song_title = 'Oh Jordan Jelani and Joshua my sons',
  status = 'delivered'
WHERE id = '9faf8508-721b-4fd0-bb1d-d467541a114a';
```

After this, the customer's delivery link will work: **personalsonggifts.lovable.app/song/9FAF8508**

You can send that link to Jason right away once approved.

