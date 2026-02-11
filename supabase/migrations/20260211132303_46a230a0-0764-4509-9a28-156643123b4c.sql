-- Bulk-convert all leads that have a matching paid order but were never marked converted
UPDATE leads l
SET status = 'converted',
    converted_at = NOW(),
    order_id = o.id
FROM orders o
WHERE LOWER(o.customer_email) = LOWER(l.email)
  AND o.status != 'cancelled'
  AND l.status != 'converted';
