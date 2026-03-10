/**
 * Category-based event images using Unsplash.
 * These are stable source URLs that return optimized images.
 */

const CATEGORY_IMAGES: Record<string, string> = {
  galas:
    "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=800&h=400&fit=crop&q=80",
  parties:
    "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=800&h=400&fit=crop&q=80",
  conferences:
    "https://images.unsplash.com/photo-1505373877841-8d25f7d46678?w=800&h=400&fit=crop&q=80",
  sports:
    "https://images.unsplash.com/photo-1461896836934-bd45ba8bfb5a?w=800&h=400&fit=crop&q=80",
  sustainability:
    "https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=800&h=400&fit=crop&q=80",
  other:
    "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&h=400&fit=crop&q=80",
};

const DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=800&h=400&fit=crop&q=80";

/**
 * Returns an image URL for an event, using the stored image_url if available,
 * otherwise falling back to a category-based Unsplash image.
 */
export function getEventImage(
  imageUrl: string | null | undefined,
  category: string
): string {
  if (imageUrl && imageUrl !== "/placeholder.svg") return imageUrl;
  return CATEGORY_IMAGES[category.toLowerCase()] ?? DEFAULT_IMAGE;
}
