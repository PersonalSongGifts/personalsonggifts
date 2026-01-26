-- Drop the overly permissive INSERT policy
DROP POLICY IF EXISTS "Anyone can insert orders" ON public.orders;

-- Create a restrictive policy - only service role can insert (via edge function)
-- This effectively blocks all direct client inserts
CREATE POLICY "Only service role can insert orders"
ON public.orders
FOR INSERT
TO authenticated, anon
WITH CHECK (false);

-- Add explicit policy to prevent updates from regular users
CREATE POLICY "No public updates allowed"
ON public.orders
FOR UPDATE
TO authenticated, anon
USING (false)
WITH CHECK (false);

-- Add explicit policy to prevent deletes from regular users  
CREATE POLICY "No public deletes allowed"
ON public.orders
FOR DELETE
TO authenticated, anon
USING (false);