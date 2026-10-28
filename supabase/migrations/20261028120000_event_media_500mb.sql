-- Raise the promo video size cap on event-media from 50 MB to 500 MB.
UPDATE storage.buckets
SET file_size_limit = 524288000
WHERE id = 'event-media';
