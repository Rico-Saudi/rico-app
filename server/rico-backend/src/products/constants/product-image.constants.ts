// A vendor photographs a shelf with a phone camera, so the raw file is often
// several megabytes. The dashboard downscales before uploading; this cap is
// the backstop for anything that skips it.
export const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;

export const ALLOWED_PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Keyed by the image's own id, not the product's, so replacing a photo yields
// a new URL — the old one can never be served from a cache in its place.
export function productImageUrl(imageId: unknown): string {
  return `/products/images/${String(imageId)}`;
}
