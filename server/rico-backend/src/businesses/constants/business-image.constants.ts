// The storefront photo a vendor uploads for their own place. Same shape and
// limits as a product photo (see product-image.constants) — one camera, one
// dashboard, no reason for two different ceilings.
export const MAX_BUSINESS_IMAGE_BYTES = 2 * 1024 * 1024;

export const ALLOWED_BUSINESS_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Keyed by the image's own id, not the business's, so replacing a photo yields
// a new URL — the old one can never be served from a cache in its place.
export function businessImageUrl(imageId: unknown): string {
  return `/businesses/images/${String(imageId)}`;
}
