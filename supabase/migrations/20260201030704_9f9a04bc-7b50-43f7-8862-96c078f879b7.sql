-- Add dismissed_at column to leads table for archiving/dismissing test leads
ALTER TABLE public.leads 
ADD COLUMN dismissed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;