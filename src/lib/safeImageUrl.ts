/**
 * Validates a string before it's handed to an <img src>. Only allows the
 * schemes we ever legitimately produce for image previews: blob: (local
 * file previews from URL.createObjectURL) and https: (already-uploaded
 * Supabase storage URLs). Anything else — including javascript: or other
 * unexpected schemes — is rejected, so no unvalidated string can reach the
 * DOM as an image source.
 */
export function safeImageSrc(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  return /^(blob:|https:|data:image\/)/i.test(url) ? url : undefined;
}
