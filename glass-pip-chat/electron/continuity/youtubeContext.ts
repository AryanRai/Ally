/** YouTube URL helpers. Position must come from an authorised source; never fabricated. */

const YOUTUBE_HOST = /^(www\.|m\.)?youtube\.com$|^youtu\.be$/i;

/** Canonical 11-character video ID from a youtube.com/watch or youtu.be URL. undefined for non-YouTube URLs. */
export function youtubeVideoId(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (!YOUTUBE_HOST.test(u.hostname)) return;
    if (/^youtu\.be$/i.test(u.hostname)) {
      const id = u.pathname.slice(1).split('/')[0];
      return /^[\w-]{11}$/.test(id) ? id : undefined;
    }
    const v = u.searchParams.get('v');
    return v && /^[\w-]{11}$/.test(v) ? v : undefined;
  } catch { return; }
}

/** Seconds from the `t=` or `start=` URL parameter. Accepts plain integers and "1h23m45s" form. */
export function youtubeParamSeconds(url: string): number | undefined {
  try {
    const u = new URL(url);
    const raw = u.searchParams.get('t') ?? u.searchParams.get('start');
    if (!raw) return;
    if (/^\d+$/.test(raw)) {
      const n = parseInt(raw, 10);
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    }
    const m = raw.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
    if (!m || raw === '') return;
    return parseInt(m[1] ?? '0', 10) * 3600 + parseInt(m[2] ?? '0', 10) * 60 + parseInt(m[3] ?? '0', 10);
  } catch { return; }
}

/**
 * Best authoritative timestamp for a YouTube URL.
 * Prefers an observed HTML media element position (more current) over the URL's own `t=` parameter.
 * Returns undefined when the URL is not YouTube or no authoritative position is available.
 */
export function youtubeTimestamp(url: string, positionMs?: number): {seconds: number; source: string} | undefined {
  if (!youtubeVideoId(url)) return;
  if (typeof positionMs === 'number' && Number.isFinite(positionMs) && positionMs >= 0)
    return {seconds: Math.floor(positionMs / 1000), source: 'html_media_position'};
  const t = youtubeParamSeconds(url);
  if (t !== undefined) return {seconds: t, source: 'url_t_parameter'};
}

/** Canonical youtube.com watch URL with `t=` set. undefined for non-YouTube URLs or invalid seconds. */
export function youtubeContinuationUrl(url: string, seconds: number): string | undefined {
  const id = youtubeVideoId(url);
  if (!id || !Number.isFinite(seconds) || seconds < 0) return;
  return `https://www.youtube.com/watch?v=${id}&t=${Math.floor(seconds)}`;
}
