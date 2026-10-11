import { PhotosService } from './photos.service';

// Width is the cache key's other half, and every cache miss is a billed photo
// fetch — so an unbounded width parameter is a cost bug, not a cosmetic one.
describe('PhotosService.normalizeWidth', () => {
  it('keeps the widths we actually serve', () => {
    expect(PhotosService.normalizeWidth('400')).toBe(400);
    expect(PhotosService.normalizeWidth('800')).toBe(800);
    expect(PhotosService.normalizeWidth('1200')).toBe(1200);
  });

  it('snaps an in-between width to the nearest one we serve', () => {
    // A client asking for 360 wants a small image; 400 is the right answer,
    // and collapsing it there keeps one cached variant instead of two.
    expect(PhotosService.normalizeWidth('360')).toBe(400);
    expect(PhotosService.normalizeWidth('900')).toBe(800);
    expect(PhotosService.normalizeWidth('5000')).toBe(1200);
  });

  it('falls back to the default for anything unusable', () => {
    expect(PhotosService.normalizeWidth(undefined)).toBe(800);
    expect(PhotosService.normalizeWidth('')).toBe(800);
    expect(PhotosService.normalizeWidth('huge')).toBe(800);
  });
});
