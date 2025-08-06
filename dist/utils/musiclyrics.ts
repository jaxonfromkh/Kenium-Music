import { readFile, writeFile } from 'node:fs/promises';

let fetchInstance = null;
async function getFetch() {
    if (!fetchInstance) {
        const [nodeFetch, fetchCookie] = await Promise.all([
            import('node-fetch').then(m => m.default),
            import('fetch-cookie').then(m => m.default || m)
        ]);

        if (typeof fetchCookie !== 'function') {
            throw new Error('Invalid fetch-cookie export');
        }

        fetchInstance = fetchCookie(nodeFetch);
    }
    return fetchInstance;
}

interface LyricsData {
    text: string | null;
    lines: { range: { start: number }, line: string }[] | null
    track: {
        title: string;
        author: string;
        albumArt?: string;
    };
    source: string;
}

export class Musixmatch {
    private readonly ENDPOINTS = Object.freeze({
        TOKEN: 'https://apic-desktop.musixmatch.com/ws/1.1/token.get?app_id=web-desktop-app-v1.0',
        SEARCH: 'https://apic-desktop.musixmatch.com/ws/1.1/track.search?app_id=web-desktop-app-v1.0&page_size=3&page=1&s_track_rating=desc',
        LYRICS: 'https://apic-desktop.musixmatch.com/ws/1.1/track.subtitle.get?app_id=web-desktop-app-v1.0&subtitle_format=lrc',
        ALT_LYRICS: 'https://apic-desktop.musixmatch.com/ws/1.1/macro.subtitles.get?format=json&namespace=lyrics_richsynched&subtitle_format=mxm&app_id=web-desktop-app-v1.0'
    });

    private readonly REGEX = {
        TIMESTAMPS: /\[\d+:\d+\.\d+\]/g,
        EMPTY_LINES: /^\s*$/,
        ARTIST_TITLE: /^(.*?)\s*[-–~]\s*(.+)$/
    };

    private tokenData: { value: string; expires: number } | null = null;
    private tokenPromise: Promise<string> | null = null;
    private readonly TOKEN_TTL = 55000; // 55 seconds
    private readonly TOKEN_FILE = 'musixmatch_token.txt';

    constructor() {
        this.initializeToken();
    }

    private async initializeToken() {
        try {
            await this.getToken();
        } catch (error) {
            console.error('Musixmatch initialization failed:', error);
        }
    }

    private async readTokenFromFile(): Promise<{ value: string; expires: number } | null> {
        try {
            const data = await readFile(this.TOKEN_FILE, 'utf-8');
            const parsed = JSON.parse(data);
            if (parsed.value && parsed.expires) {
                return parsed;
            }
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
        const response = await fetch(this.ENDPOINTS.TOKEN);

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
                this.tokenData = {
                    value: token,
                    expires: now + this.TOKEN_TTL
                };
                await this.saveTokenToFile(token, this.tokenData.expires);
                return token;
            } finally {
                this.tokenPromise = null;
            }
        })();

        return this.tokenPromise;
    }

    private async apiGet(url: string): Promise<any> {
        const fetch = await getFetch();
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        return response.json();
    }

    private cleanLyrics(lyrics: string): string {
        return lyrics
            .replace(this.REGEX.TIMESTAMPS, '')
            .split('\n')
            .map(line => line.trim())
            .filter(line => !this.REGEX.EMPTY_LINES.test(line))
            .join('\n');
    }

    private async searchTrack(title: string, token: string): Promise<any> {
        const url = `${this.ENDPOINTS.SEARCH}&q_track=${encodeURIComponent(title)}&usertoken=${token}`;
        const data = await this.apiGet(url);
        return data?.message?.body?.track_list?.[0]?.track || null;
    }

    private async getAltLyrics(title: string, artist: string, token: string): Promise<any> {
        const url = `${this.ENDPOINTS.ALT_LYRICS}&usertoken=${token}&q_artist=${encodeURIComponent(artist)}&q_track=${encodeURIComponent(title)}`;
        const data = await this.apiGet(url);
        const calls = data?.message?.body?.macro_calls || {};

        return {
            lyrics: calls['track.lyrics.get']?.message?.body?.lyrics?.lyrics_body,
            track: calls['matcher.track.get']?.message?.body?.track
        };
    }

 private parseQuery(query: string): { artist?: string, title: string } {
        const cleanedQuery = query
            .replace(/\b(VEVO|Official Music Video|Lyrics)\b/gi, '')
            .trim();

        const separatorMatch = cleanedQuery.match(this.REGEX.ARTIST_TITLE);
        if (separatorMatch) {
            return {
                artist: separatorMatch[1].trim(),
                title: separatorMatch[2].trim()
            };
        }

        const lastSpaceIndex = cleanedQuery.lastIndexOf(' ');
        if (lastSpaceIndex > 0) {
            return {
                artist: cleanedQuery.substring(0, lastSpaceIndex).trim(),
                title: cleanedQuery.substring(lastSpaceIndex + 1).trim()
            };
        }

        return { title: cleanedQuery };
    }

     public async findLyrics(query: string): Promise<LyricsData | null> {
        const token = await this.getToken();
        const parsed = this.parseQuery(query);

        console.log('Parsed query:', parsed);

        if (parsed.artist) {
            const altResult = await this.getAltLyrics(parsed.title, parsed.artist, token);
            if (altResult?.lyrics && altResult?.track) {
                return this.formatResult(altResult.lyrics, altResult.track);
            }
        }

        const trackResult = await this.searchTrack(query, token);
        if (trackResult) {
            const lyrics = await this.getLyricsFromTrack(trackResult, token);
            if (lyrics) return this.formatResult(lyrics, trackResult);
        }

        const titleOnlyResult = await this.getAltLyrics(parsed.title, '', token);
        if (titleOnlyResult?.lyrics && titleOnlyResult?.track) {
            return this.formatResult(titleOnlyResult.lyrics, titleOnlyResult.track);
        }

        return null;
    }

    private async getLyricsFromTrack(trackData: any, token: string): Promise<string | null> {
        try {
            const url = `${this.ENDPOINTS.LYRICS}&track_id=${trackData.track_id}&usertoken=${token}`;
            const data = await this.apiGet(url);
            const lyrics = data?.message?.body?.subtitle?.subtitle_body;
            return lyrics ? this.cleanLyrics(lyrics) : null;
        } catch {
            return null;
        }
    }

    private formatResult(lyrics: string, trackData: any): LyricsData {
        return {
            text: lyrics,
            lines: null,
            track: {
                title: trackData.track_name,
                author: trackData.artist_name,
                albumArt: trackData.album_coverart_350x350
            },
            source: 'Musixmatch'
        };
    }
}