-- Storage RLS Policies for ticket-files bucket
-- Prevents unauthorized access to ticket files

-- Policy 1: Sellers can upload files to their own folder
CREATE POLICY "Sellers upload to own folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'ticket-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 2: Sellers can view their own files, buyers can view purchased tickets
CREATE POLICY "Sellers and buyers can download tickets"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'ticket-files' AND (
    -- Seller can see their own files
    (storage.foldername(name))[1] = auth.uid()::text
    OR
    -- Buyer can see files they purchased (completed transactions only)
    EXISTS (
      SELECT 1 FROM public.tickets t
      JOIN public.transactions tr ON tr.ticket_id = t.id
      WHERE t.ticket_file_url = name
      AND tr.buyer_id = auth.uid()
      AND tr.status = 'completed'
    )
  )
);

-- Policy 3: Sellers can delete their own files
CREATE POLICY "Sellers delete own files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'ticket-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy 4: Sellers can update metadata of their own files
CREATE POLICY "Sellers update own files"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'ticket-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);