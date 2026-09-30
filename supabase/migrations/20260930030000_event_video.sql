-- Let organizers attach a short promo video to their event page (buyer-
-- facing EventPublic.tsx), alongside the existing banner photo.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS video_url TEXT;

COMMENT ON COLUMN public.events.video_url IS
  'Public URL of an organizer-uploaded promo video (event-media bucket). Shown as an autoplay-muted hero video on the public event page when present, alongside/instead of banner_url.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('event-media', 'event-media', true, 52428800, array['video/mp4', 'video/webm', 'video/quicktime'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS event_media_owner_insert ON storage.objects;
CREATE POLICY event_media_owner_insert
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'event-media' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS event_media_owner_update ON storage.objects;
CREATE POLICY event_media_owner_update
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'event-media' AND (storage.foldername(name))[1] = auth.uid()::text);
DROP POLICY IF EXISTS event_media_owner_delete ON storage.objects;
CREATE POLICY event_media_owner_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'event-media' AND (storage.foldername(name))[1] = auth.uid()::text);
