import {it, expect} from 'vitest';
import {youtubeVideoId, youtubeParamSeconds, youtubeTimestamp, youtubeContinuationUrl} from './youtubeContext';

it('extracts video ID from watch and short URLs, rejects non-YouTube', () => {
  expect(youtubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  expect(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  expect(youtubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=30')).toBe('dQw4w9WgXcQ');
  expect(youtubeVideoId('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  expect(youtubeVideoId('https://example.com/watch?v=dQw4w9WgXcQ')).toBeUndefined();
  expect(youtubeVideoId('https://www.youtube.com/shorts/abc')).toBeUndefined();
  expect(youtubeVideoId('https://www.youtube.com/playlist?list=abc')).toBeUndefined();
  expect(youtubeVideoId('not a url')).toBeUndefined();
});

it('extracts seconds from t= URL parameter in integer and hms forms', () => {
  expect(youtubeParamSeconds('https://www.youtube.com/watch?v=x&t=90')).toBe(90);
  expect(youtubeParamSeconds('https://youtu.be/x?t=1h23m45s')).toBe(5025);
  expect(youtubeParamSeconds('https://youtu.be/x?t=30m')).toBe(1800);
  expect(youtubeParamSeconds('https://youtu.be/x?start=120')).toBe(120);
  expect(youtubeParamSeconds('https://www.youtube.com/watch?v=x')).toBeUndefined();
  expect(youtubeParamSeconds('https://www.youtube.com/watch?v=x&t=abc')).toBeUndefined();
  expect(youtubeParamSeconds('https://www.youtube.com/watch?v=x&t=')).toBeUndefined();
});

it('prefers observed media position over URL param, falls back to URL param, returns nothing when neither available', () => {
  const url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30';
  const ts = youtubeTimestamp(url, 65000);
  expect(ts?.seconds).toBe(65); expect(ts?.source).toBe('html_media_position');
  const ts2 = youtubeTimestamp(url);
  expect(ts2?.seconds).toBe(30); expect(ts2?.source).toBe('url_t_parameter');
  expect(youtubeTimestamp('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBeUndefined();
  expect(youtubeTimestamp('https://example.com/video', 5000)).toBeUndefined();
  expect(youtubeTimestamp(url, NaN)).toMatchObject({source: 'url_t_parameter'});
});

it('builds canonical continuation URL, rejects non-YouTube URLs', () => {
  expect(youtubeContinuationUrl('https://youtu.be/dQw4w9WgXcQ?t=0', 90)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90');
  expect(youtubeContinuationUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', 0)).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=0');
  expect(youtubeContinuationUrl('https://example.com/watch?v=x', 30)).toBeUndefined();
  expect(youtubeContinuationUrl('https://youtu.be/dQw4w9WgXcQ', -1)).toBeUndefined();
});
