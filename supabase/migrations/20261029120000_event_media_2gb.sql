-- Raise the promo video size cap on event-media from 500 MB to 2 GB.
UPDATE storage.buckets
SET file_size_limit = 2147483648
WHERE id = 'event-media';
