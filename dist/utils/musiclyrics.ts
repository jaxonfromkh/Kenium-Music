import { readFile, writeFile } from 'node:fs/promises';


let defaultFetch = null
let cookieFetch = null

async function getFetch(withCookies = true) {
  if (withCookies) {
    if (!cookieFetch) {
      const fetchCookie = await import('fetch-cookie').then(m => m.default || m)
      if (typeof fetchCookie !== 'function') {
        throw new Error('Invalid fetch-cookie export');
      }
      cookieFetch = fetchCookie(globalThis.fetch)
    }
    return cookieFetch
  }

  if (!defaultFetch) {
    if (typeof globalThis.fetch === 'function') {
      defaultFetch = globalThis.fetch
    }
  }

  return defaultFetch
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
    ARTIST_TITLE: /^(.*?)\s*[-–—~]\s*(.+)$/
  };

  private tokenData: { value: string; expires: number } | null = null;
  private tokenPromise: Promise<string> | null = null;
  private readonly TOKEN_TTL = 55000;
  private readonly TOKEN_FILE = 'musixmatch_token.txt';

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
      return null;
    } catch {
      return null;
    }
  }

  private async saveTokenToFile(token: string, expires: number): Promise<void> {
    try {
      await writeFile(this.TOKEN_FILE, JSON.stringify({ value: token, expires }), 'utf-8');
    } catch (error) {
      console.error('Failed to save token to file:', error);
    }
  }

  private async fetchToken(): Promise<string> {
    const fetch = await getFetch();
    const url = this.buildUrl(this.ENDPOINTS.TOKEN, { app_id: this.APP_ID });
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Token request failed: ${response.status}`);
    const data = await response.json();
    if (data?.message?.header?.status_code !== 200) {
      throw new Error(data?.message?.header?.hint || 'Invalid token response');
    }
    return data.message.body.user_token;
  }

  private async getToken(): Promise<string> {
    const now = Date.now();
    if (!this.tokenData) {
      this.tokenData = await this.readTokenFromFile();
    }
    if (this.tokenData && now < this.tokenData.expires) {
      return this.tokenData.value;
    }
    if (this.tokenPromise) return this.tokenPromise;
    this.tokenPromise = (async () => {
      try {
        const token = await this.fetchToken();
        const expires = Date.now() + this.TOKEN_TTL;
        this.tokenData = { value: token, expires };
        await this.saveTokenToFile(token, expires);
        return token;
      } finally {
        this.tokenPromise = null;
      }
    })();
    return this.tokenPromise;
  }

  private async apiGet(url: string): Promise<any> {
    const fetch = await getFetch();
    const response = await fetch(url, { headers: { accept: 'application/json' } });
    if (!response.ok) throw new Error(`API request failed: ${response.status}`);
    return response.json();
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

  private async searchTrack(title: string, token: string, artist?: string): Promise<any> {
    const url = this.buildUrl(this.ENDPOINTS.SEARCH, {
      app_id: this.APP_ID,
      page_size: '3',
      page: '1',
      s_track_rating: 'desc',
      q_track: title,
      q_artist: artist,
      usertoken: token
    });
    const data = await this.apiGet(url);
    return data?.message?.body?.track_list?.[0]?.track || null;
  }

  private async getAltLyrics(title: string, artist: string, token: string): Promise<{ lyrics?: string | null; track?: any; subtitles?: string | null } | null> {
    const url = this.buildUrl(this.ENDPOINTS.ALT_LYRICS, {
      format: 'json',
      namespace: 'lyrics_richsynched',
      subtitle_format: 'mxm',
      app_id: this.APP_ID,
      usertoken: token,
      q_artist: artist || undefined,
      q_track: title
    });
    const data = await this.apiGet(url);
    const calls = data?.message?.body?.macro_calls || {};
    const result = {
      lyrics: calls['track.lyrics.get']?.message?.body?.lyrics?.lyrics_body || null,
      track: calls['matcher.track.get']?.message?.body?.track || null,
      subtitles: calls['track.subtitles.get']?.message?.body?.subtitle_list?.[0]?.subtitle?.subtitle_body || null
    };
    if (!result.lyrics && !result.subtitles) return null;
    return result;
  }

  private parseQuery(query: string): { artist?: string; title: string } {
    const cleaned = query.replace(/\b(?:VEVO|Official(?: Music)? Video|Lyrics)\b/gi, '').trim();
    const m = cleaned.match(this.REGEX.ARTIST_TITLE);
    if (m) {
      return { artist: m[1].trim(), title: m[2].trim() };
    }
    return { title: cleaned };
  }

  public async findLyrics(query: string): Promise<LyricsData | null> {
    const token = await this.getToken();
    const parsed = this.parseQuery(query);

    if (parsed.artist) {
      const alt = await this.getAltLyrics(parsed.title, parsed.artist, token);
      if (alt) return this.formatResult(alt.subtitles || null, alt.lyrics || null, alt.track || {});
    }

    const track = await this.searchTrack(parsed.title, token, parsed.artist);
    if (track) {
      const lyricsData = await this.getLyricsFromTrack(track, token);
      if (lyricsData?.subtitles || lyricsData?.lyrics) {
        return this.formatResult(lyricsData.subtitles || null, lyricsData.lyrics || null, track);
      }
    }

    const altTitleOnly = await this.getAltLyrics(parsed.title, '', token);
    if (altTitleOnly) return this.formatResult(altTitleOnly.subtitles || null, altTitleOnly.lyrics || null, altTitleOnly.track || {});

    return null;
  }

  private async getLyricsFromTrack(trackData: any, token: string): Promise<{ subtitles?: string | null; lyrics?: string | null } | null> {
    try {
      const url = this.buildUrl(this.ENDPOINTS.LYRICS, {
        app_id: this.APP_ID,
        subtitle_format: 'mxm',
        track_id: String(trackData.track_id),
        usertoken: token
      });
      const data = await this.apiGet(url);
      const subtitles = data?.message?.body?.subtitle?.subtitle_body || null;
      return { subtitles, lyrics: null };
    } catch {
      return null;
    }
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
        albumArt: trackData?.album_coverart_800x800 || trackData?.album_coverart_350x350 || trackData?.album_coverart_100x100
      },
      source: 'Musixmatch'
    };
  }
}