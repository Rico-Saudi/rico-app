// A phone photo of a shelf is routinely 4-6 MB — far past what the server
// accepts and far more detail than a catalogue thumbnail needs. Downscaling in
// the browser means the vendor never sees a "too large" error for a picture
// they took normally, and keeps the stored document small.
const MAX_DIMENSION = 1200;
const JPEG_QUALITY = 0.82;

export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode_failed'));
    };
    img.src = url;
  });
}

// Returns the original file untouched if anything here fails — the server cap
// is the real guard, so a browser that can't decode the image shouldn't block
// the upload outright.
export async function shrinkImage(file) {
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) return file;
  try {
    const img = await loadImage(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
    if (scale === 1 && file.size <= MAX_IMAGE_BYTES) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}
