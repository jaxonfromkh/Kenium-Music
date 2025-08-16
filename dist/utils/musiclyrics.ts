import { readFile, writeFile, unlink } from 'node:fs/promises';

let defaultFetch: typeof globalThis.fetch | null = null;
let cookieFetch: typeof globalThis.fetch | null = null;

async function getFetch(withCookies = true): Promise<typeof globalThis.fetch> {
  if (withCookies) {
    if (!cookieFetch) {
      const fetchCookie = await import('fetch-cookie').then(m => m.default || m);
      if (typeof fetchCookie !== 'function') {
        throw new Error('Invalid fetch-cookie export');
      }
      cookieFetch = fetchCookie(globalThis.fetch);
    }
    return cookieFetch!;
  }

  if (!defaultFetch) {
    if (typeof globalThis.fetch === 'function') {
      defaultFetch = globalThis.fetch;
    } else {
      throw new Error('No global fetch available');
    }
  }

  return defaultFetch!;
}

function resetCookieFetch() {
  cookieFetch = null;
}

interface LyricsData {
  text: string | null;
  lines: { range: { start: number }; line: string }[] | null;
  track: {
    title: string;
    author: string;
    albumArt?: string;
  };
  source: string;
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message?: string) {
    super(message || `HTTP ${status}`);
    this.status = status;
  }
}

class MxmApiError extends Error {
  code: number;
  hint?: string;
  constructor(code: number, hint?: string) {
    super(hint || `Musixmatch API error ${code}`);
    this.code = code;
    this.hint = hint;
  }
}

export class Musixmatch {
  private readonly APP_ID = 'web-desktop-app-v1.0';
  private readonly ENDPOINTS = Object.freeze({
    TOKEN: 'https://apic-desktop.musixmatch.com/ws/1.1/token.get',
    SEARCH: 'https://apic-desktop.musixmatch.com/ws/1.1/track.search',
    LYRICS: 'https://apic-desktop.musixmatch.com/ws/1.1/track.subtitle.get',
    ALT_LYRICS: 'https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get'
  });

  private readonly REGEX = {
    TIMESTAMPS: /\d{1,2}:\d{2}(?:\.\d{1,3})?/g,
    ARTIST_TITLE: /^(.*?)\s*[-–—~]\s*(.+)$/ // artist - title
  };

  // Token handling
  private tokenData: { value: string; expires: number } | null = null;
  private tokenPromise: Promise<string> | null = null;
  private readonly TOKEN_TTL = 55_000; // 55s (sliding)
  private readonly TOKEN_FILE = 'musixmatch_token.txt';
  private lastTokenPersist = 0;
  private readonly TOKEN_PERSIST_MIN_INTERVAL = 5_000; // debounce disk writes

  // Requests
  private requestTimeoutMs = 10_000; // tighter timeout for speed
  private readonly defaultHeaders = {
    accept: 'application/json',
    'user-agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118 Safari/537.36'
  };

  // Simple in-memory cache for repeated queries
  private cache = new Map<string, { value: LyricsData | null; expires: number }>();
  private readonly CACHE_TTL = 5 * 60_000; // 5 minutes

  constructor(opts?: {
    requestTimeoutMs?: number;
    cacheTTL?: number;
  }) {
    if (opts?.requestTimeoutMs) this.requestTimeoutMs = opts.requestTimeoutMs;
    if (opts?.cacheTTL) (this as any).CACHE_TTL = opts.cacheTTL;
  }

  private buildUrl(base: string, params: Record<string, string | undefined>): string {
    const url = new URL(base);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, v);
    }
    return url.toString();
  }

  private async readTokenFromFile(): Promise<{ value: string; expires: number } | null> {
    try {
      const data = await readFile(this.TOKEN_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      if (parsed?.value && parsed?.expires) return parsed;
    } catch {}
    return null;
  }

  private async saveTokenToFile(token: string, expires: number): Promise<void> {
    try {
      await writeFile(this.TOKEN_FILE, JSON.stringify({ value: token, expires }), 'utf-8');
    } catch (error) {
      // non-fatal
      console.error('Failed to save token to file:', error);
    }
  }

  private async apiGet(url: string, opts?: { withCookies?: boolean; headers?: Record<string, string> }): Promise<any> {
    const fetch = await getFetch(opts?.withCookies !== false);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);
    try {
      const res = await fetch(url, {
        headers: { ...this.defaultHeaders, ...(opts?.headers || {}) },
        signal: controller.signal
      });
      if (!res.ok) {
        throw new HttpError(res.status, `API request failed: ${res.status}`);
      }
      return res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchTokenAttempt(withCookies = true): Promise<string> {
    const url = this.buildUrl(this.ENDPOINTS.TOKEN, { app_id: this.APP_ID });
    const data = await this.apiGet(url, { withCookies });
    const header = data?.message?.header;
    if (header?.status_code !== 200) {
      throw new MxmApiError(header?.status_code ?? 0, header?.hint || 'Invalid token response');
    }
    return data.message.body.user_token;
  }

  private async resetToken(hard = false): Promise<void> {
    this.tokenData = null;
    this.tokenPromise = null;
    if (hard) {
      try {
        await unlink(this.TOKEN_FILE);
      } catch {
        // ignore if not present
      }
    }
  }

  // Sliding TTL, debounced persistence, captcha-aware retry
  private async getToken(force = false): Promise<string> {
    const now = Date.now();

    if (!this.tokenData) {
      this.tokenData = await this.readTokenFromFile();
    }

    if (!force && this.tokenData && now < this.tokenData.expires) {
      // Touch (sliding TTL) and debounce persistence
      this.tokenData.expires = now + this.TOKEN_TTL;
      if (now - this.lastTokenPersist > this.TOKEN_PERSIST_MIN_INTERVAL) {
        this.lastTokenPersist = now;
        this.saveTokenToFile(this.tokenData.value, this.tokenData.expires).catch(() => {});
      }
      return this.tokenData.value;
    }

    if (this.tokenPromise) return this.tokenPromise;

    this.tokenPromise = (async () => {
      try {
        // First attempt
        try {
          const token = await this.fetchTokenAttempt(true);
          const expires = Date.now() + this.TOKEN_TTL;
          this.tokenData = { value: token, expires };
          await this.saveTokenToFile(token, expires);
          return token;
        } catch (err: any) {
          const isCaptcha =
            err instanceof MxmApiError &&
            (err.code === 401 || err.code === 403 || /captcha/i.test(err.hint || ''));
          const isAuthErr = err instanceof MxmApiError && (err.code === 401 || err.code === 403);
          if (isCaptcha || isAuthErr) {
            // Reset token and cookie jar on first captcha/auth error, then retry once
            await this.resetToken(true);
            resetCookieFetch();
            const token = await this.fetchTokenAttempt(true);
            const expires = Date.now() + this.TOKEN_TTL;
            this.tokenData = { value: token, expires };
            await this.saveTokenToFile(token, expires);
            return token;
          }
          throw err;
        }
      } finally {
        this.tokenPromise = null;
      }
    })();

    return this.tokenPromise;
  }

  private async callMxm<T>(makeUrl: (token: string) => string, retry = true): Promise<T> {
    const doCall = async (token: string): Promise<{ header: any; body: T }> => {
      const data = await this.apiGet(makeUrl(token));
      const header = data?.message?.header;
      const body = data?.message?.body;
      if (!header || header.status_code !== 200) {
        throw new MxmApiError(header?.status_code ?? 0, header?.hint);
      }
      return { header, body };
    };

    try {
      const token = await this.getToken();
      const { body } = await doCall(token);
      return body;
    } catch (err: any) {
      const code = err instanceof MxmApiError ? err.code : err instanceof HttpError ? err.status : 0;
      const tokenLikelyInvalid = code === 401 || code === 403;
      const isCaptcha = err instanceof MxmApiError && typeof err.hint === 'string' && /captcha/i.test(err.hint);
      if (retry && (tokenLikelyInvalid || isCaptcha)) {
        await this.resetToken(isCaptcha /* hard reset on captcha */);
        if (isCaptcha) resetCookieFetch();
        const newToken = await this.getToken(true);
        const { body } = await (async () => {
          const data = await this.apiGet(makeUrl(newToken));
          const header = data?.message?.header;
          const body = data?.message?.body;
          if (!header || header.status_code !== 200) {
            throw new MxmApiError(header?.status_code ?? 0, header?.hint);
          }
          return { header, body };
        })();
        return body;
      }
      throw err;
    }
  }

  private cleanLyrics(lyrics: string): string {
    const out: string[] = [];
    const stripped = lyrics.replace(this.REGEX.TIMESTAMPS, '');
    for (const raw of stripped.split('\n')) {
      const s = raw.trim();
      if (s) out.push(s);
    }
    return out.join('\n');
  }

  private parseSubtitles(subtitleBody: string): { range: { start: number }; line: string }[] | null {
    try {
      const subtitleData = JSON.parse(subtitleBody);
      if (!Array.isArray(subtitleData)) return null;
      return subtitleData.map((item: any) => ({
        range: { start: Math.round((item?.time?.total || 0) * 1000) },
        line: String(item?.text ?? '')
      }));
    } catch {
      return null;
    }
  }

  private async searchTrack(title: string, artist?: string): Promise<any | null> {
    const body = await this.callMxm<any>((token) =>
      this.buildUrl(this.ENDPOINTS.SEARCH, {
        app_id: this.APP_ID,
        page_size: '1', // smaller for speed
        page: '1',
        s_track_rating: 'desc',
        q_track: title,
        q_artist: artist,
        usertoken: token
      })
    );
    return body?.track_list?.[0]?.track || null;
  }

  private async getAltLyrics(
    title: string,
    artist: string | undefined
  ): Promise<{ lyrics?: string | null; track?: any; subtitles?: string | null } | null> {
    const body = await this.callMxm<any>((token) =>
      this.buildUrl(this.ENDPOINTS.ALT_LYRICS, {
        format: 'json',
        namespace: 'lyrics_richsynched',
        subtitle_format: 'mxm',
        app_id: this.APP_ID,
        usertoken: token,
        q_artist: artist || undefined,
        q_track: title
      })
    );
    const calls = body?.macro_calls || {};
    const result = {
      lyrics: calls['track.lyrics.get']?.message?.body?.lyrics?.lyrics_body || null,
      track: calls['matcher.track.get']?.message?.body?.track || null,
      subtitles: calls['track.subtitles.get']?.message?.body?.subtitle_list?.[0]?.subtitle?.subtitle_body || null
    };
    if (!result.lyrics && !result.subtitles) return null;
    return result;
  }

  private async getLyricsFromTrack(trackData: any): Promise<{ subtitles?: string | null; lyrics?: string | null } | null> {
    try {
      const body = await this.callMxm<any>((token) =>
        this.buildUrl(this.ENDPOINTS.LYRICS, {
          app_id: this.APP_ID,
          subtitle_format: 'mxm',
          track_id: String(trackData.track_id),
          usertoken: token
        })
      );
      const subtitles = body?.subtitle?.subtitle_body || null;
      return { subtitles, lyrics: null };
    } catch {
      return null;
    }
  }

  private parseQuery(query: string): { artist?: string; title: string } {
    const cleaned = query
      .replace(/\b(?:VEVO|Official(?: Music)? Video|Lyrics)\b/gi, '')
      .replace(/\s*```math[^```]*```|\s*KATEX_INLINE_OPEN[^KATEX_INLINE_CLOSE]*KATEX_INLINE_CLOSE/g, '') // strip brackets like (Official) [Lyric Video]
      .trim();
    const m = cleaned.match(this.REGEX.ARTIST_TITLE);
    if (m) {
      return { artist: m[1].trim(), title: m[2].trim() };
    }
    return { title: cleaned };
  }

  private formatResult(subtitles: string | null, lyrics: string | null, trackData: any): LyricsData {
    const lines = subtitles ? this.parseSubtitles(subtitles) : null;
    const text = lyrics ? this.cleanLyrics(lyrics) : lines ? lines.map(l => l.line).join('\n') : null;
    return {
      text: text || null,
      lines: lines || null,
      track: {
        title: trackData?.track_name || '',
        author: trackData?.artist_name || '',
        albumArt:
          trackData?.album_coverart_800x800 ||
          trackData?.album_coverart_350x350 ||
          trackData?.album_coverart_100x100
      },
      source: 'Musixmatch'
    };
  }

  private cacheKey(parsed: { artist?: string; title: string }): string {
    return `${(parsed.artist || '').toLowerCase().trim()}|${parsed.title.toLowerCase().trim()}`;
  }

  private getFromCache(key: string): LyricsData | null | undefined {
    const hit = this.cache.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    if (hit) this.cache.delete(key);
    return undefined;
  }

  private setCache(key: string, value: LyricsData | null) {
    this.cache.set(key, { value, expires: Date.now() + this.CACHE_TTL });
    // Optional: cap size to avoid unbounded growth
    if (this.cache.size > 100) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }
  }

  private async firstTruthy<T>(promises: Promise<T | null>[]): Promise<T | null> {
    return new Promise((resolve) => {
      if (promises.length === 0) return resolve(null);
      let pending = promises.length;
      let settled = false;
      for (const p of promises) {
        p.then((val) => {
          if (!settled && val) {
            settled = true;
            resolve(val);
          } else if (--pending === 0 && !settled) {
            resolve(null);
          }
        }).catch(() => {
          if (--pending === 0 && !settled) resolve(null);
        });
      }
    });
  }

  public async findLyrics(query: string): Promise<LyricsData | null> {
    const parsed = this.parseQuery(query);
    const key = this.cacheKey(parsed);
    const cached = this.getFromCache(key);
    if (cached !== undefined) return cached;

    if (parsed.artist) {
      // Run macro and search+lyrics concurrently; return the first good result
      const altP = this.getAltLyrics(parsed.title, parsed.artist).then((alt) =>
        alt ? this.formatResult(alt.subtitles || null, alt.lyrics || null, alt.track || {}) : null
      );

      const searchP = this.searchTrack(parsed.title, parsed.artist).then(async (track) => {
        if (!track) return null;
        const lyricsData = await this.getLyricsFromTrack(track);
        if (lyricsData?.subtitles || lyricsData?.lyrics) {
          return this.formatResult(lyricsData.subtitles || null, lyricsData.lyrics || null, track);
        }
        return null;
      });

      const winner = await this.firstTruthy([altP, searchP]);
      if (winner) {
        this.setCache(key, winner);
        return winner;
      }
    } else {
      // If no artist, try search->lyrics first (often faster), then macro as fallback
      const searchOnly = this.searchTrack(parsed.title).then(async (track) => {
        if (!track) return null;
        const lyricsData = await this.getLyricsFromTrack(track);
        if (lyricsData?.subtitles || lyricsData?.lyrics) {
          return this.formatResult(lyricsData.subtitles || null, lyricsData.lyrics || null, track);
        }
        return null;
      });
      const sRes = await searchOnly;
      if (sRes) {
        this.setCache(key, sRes);
        return sRes;
      }
    }

    // Fallback: macro with title only
    const altTitleOnly = await this.getAltLyrics(parsed.title, undefined);
    if (altTitleOnly) {
      const out = this.formatResult(
        altTitleOnly.subtitles || null,
        altTitleOnly.lyrics || null,
        altTitleOnly.track || {}
      );
      this.setCache(key, out);
      return out;
    }

    this.setCache(key, null);
    return null;
  }
}
