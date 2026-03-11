/**
 * Category-based event images using Unsplash.
 * These are stable source URLs that return optimized images.
 */

const CATEGORY_IMAGES: Record<string, string> = {
  // Elegant black-tie gala dinner / ballroom
  galas:
    "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=800&h=400&fit=crop&q=85",
  // Vibrant club / party crowd with coloured lights
  parties:
    "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=800&h=400&fit=crop&q=85",
  // Keynote speaker on stage at a modern conference
  conferences:
    "https://images.unsplash.com/photo-1587825140708-dfaf72ae4b04?w=800&h=400&fit=crop&q=85",
  // Stadium / live sports atmosphere
  sports:
    "https://images.unsplash.com/photo-1547347298-4074fc3086f0?w=800&h=400&fit=crop&q=85",
  // Green / sustainability / outdoor
  sustainability:
    "https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?w=800&h=400&fit=crop&q=85",
  // Live music / concert
  concerts:
    "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=800&h=400&fit=crop&q=85",
  // Networking / professional meetup
  networking:
    "https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=800&h=400&fit=crop&q=85",
  // Arts / culture / exhibition
  arts:
    "https://images.unsplash.com/photo-1578301978693-85fa9c0320b9?w=800&h=400&fit=crop&q=85",
  // Graduation ceremony
  graduation:
    "https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800&h=400&fit=crop&q=85",
  // General event / festival crowd
  other:
    "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&h=400&fit=crop&q=85",
};

const DEFAULT_IMAGE =
  "https://images.unsplash.com/photo-1501281668745-f7f57925c3b4?w=800&h=400&fit=crop&q=85";

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
