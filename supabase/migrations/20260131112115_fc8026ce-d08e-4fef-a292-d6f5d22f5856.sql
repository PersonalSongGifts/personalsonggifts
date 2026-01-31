-- Drop the old restrictive check constraint
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_status_check;

-- Add new constraint with all valid status values
ALTER TABLE public.leads ADD CONSTRAINT leads_status_check 
CHECK (status = ANY (ARRAY['lead', 'song_ready', 'preview_sent', 'converted']));