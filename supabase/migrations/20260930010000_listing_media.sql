-- Resale listing photos/videos — sellers can attach a real photo (and an
-- optional short video) to their ticket listing instead of always falling
-- back to the brand-gradient placeholder on the marketplace.
--
-- Storage: public bucket (unlike external-tickets) since these images are
-- meant to be seen by anyone browsing the marketplace, including guest
-- checkout buyers who aren't signed in. Sellers manage files under their
-- own uid-prefixed folder (path convention: <auth.uid()>/<file>); anyone
-- can read (public bucket, served straight from the CDN URL — no RLS
-- SELECT policy needed).

alter table public.tickets
  add column if not exists photo_url text,
  add column if not exists video_url text;

comment on column public.tickets.photo_url is
  'Public URL of the seller-uploaded listing photo (listing-media bucket). Null falls back to the brand-gradient placeholder.';
comment on column public.tickets.video_url is
  'Public URL of the seller-uploaded listing video (listing-media bucket), optional.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listing-media', 'listing-media', true, 26214400,
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do nothing;

drop policy if exists listing_media_owner_insert on storage.objects;
create policy listing_media_owner_insert
  on storage.objects for insert to authenticated
  with check (bucket_id = 'listing-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists listing_media_owner_update on storage.objects;
create policy listing_media_owner_update
  on storage.objects for update to authenticated
  using (bucket_id = 'listing-media' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists listing_media_owner_delete on storage.objects;
create policy listing_media_owner_delete
  on storage.objects for delete to authenticated
  using (bucket_id = 'listing-media' and (storage.foldername(name))[1] = auth.uid()::text);
