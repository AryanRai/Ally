import { beforeEach, describe, expect, it, vi } from 'vitest';
const { decode, encode, resize, image } = vi.hoisted(() => {
  const encode = vi.fn(() => Buffer.from('jpeg'));
  const resize = vi.fn();
  const image = { isEmpty: () => false, getSize: () => ({ width: 1280 }), resize, toJPEG: encode };
  resize.mockReturnValue(image);
  return { decode: vi.fn(() => image), encode, resize, image };
});
vi.mock('electron', () => ({ nativeImage: { createFromDataURL: decode } }));

describe('history thumbnails', () => {
  beforeEach(() => { vi.resetModules(); decode.mockReset().mockReturnValue(image); encode.mockClear(); resize.mockClear(); });
  it('encodes repeated screenshots once while preserving size, quality and six-image limit', async () => {
    const { thumbnails } = await import('./thumbs');
    const input = Array(8).fill('data:image/png;base64,screenshot');
    const expected = Array(6).fill('data:image/jpeg;base64,anBlZw==');
    expect(thumbnails(input)).toEqual(expected);
    expect(thumbnails(input)).toEqual(expected);
    expect(decode).toHaveBeenCalledTimes(1);
    expect(resize).toHaveBeenCalledWith({ width: 640, quality: 'good' });
    expect(encode).toHaveBeenCalledWith(72);
    expect(thumbnails([])).toBeUndefined();
  });
  it('retries failed decoding and keeps distinct source images distinct', async () => {
    const { thumbnail } = await import('./thumbs');
    decode.mockImplementationOnce(() => { throw Error('not ready'); });
    expect(thumbnail('first')).toBe('first');
    expect(thumbnail('first')).toBe('data:image/jpeg;base64,anBlZw==');
    thumbnail('second');
    expect(decode).toHaveBeenCalledTimes(3);
  });
  it('evicts by recency, by retained size and bypasses oversized images', async () => {
    const { thumbnail } = await import('./thumbs');
    thumbnail('old');
    for (let i = 0; i < 31; i++) thumbnail('image-' + i);
    thumbnail('old'); // Keep this recently used result.
    thumbnail('next');
    expect(decode).toHaveBeenCalledTimes(33);
    thumbnail('old');
    expect(decode).toHaveBeenCalledTimes(33);
    thumbnail('image-0');
    expect(decode).toHaveBeenCalledTimes(34);
    thumbnail('x'.repeat(3 * 1024 * 1024));
    thumbnail('y'.repeat(3 * 1024 * 1024));
    thumbnail('old');
    expect(decode).toHaveBeenCalledTimes(37);
    const huge = 'z'.repeat(4 * 1024 * 1024);
    thumbnail(huge); thumbnail(huge);
    expect(decode).toHaveBeenCalledTimes(39);
  });
});
