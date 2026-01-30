-- Create songs storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('songs', 'songs', true);

-- Allow anyone to download songs (public read)
CREATE POLICY "Anyone can download songs"
ON storage.objects FOR SELECT
USING (bucket_id = 'songs');

-- Only service role can upload songs (admin via edge function)
CREATE POLICY "Service role can upload songs"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'songs');

-- Service role can update songs
CREATE POLICY "Service role can update songs"
ON storage.objects FOR UPDATE
USING (bucket_id = 'songs');

-- Service role can delete songs
CREATE POLICY "Service role can delete songs"
ON storage.objects FOR DELETE
USING (bucket_id = 'songs');