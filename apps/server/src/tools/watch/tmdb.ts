import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';

import { ENV, type Environment } from '../../config/env.js';

export interface TmdbMatch {
  id: number;
  title: string;
  year: number | null;
  overview: string | null;
  posterPath: string | null;
}

export interface TmdbEpisode {
  title: string | null;
  overview: string | null;
}

const API = 'https://api.themoviedb.org/3';
const IMAGES = 'https://image.tmdb.org/t/p/w500';
const TIMEOUT_MS = 10_000;

const yearOf = (date: string | undefined) => (date && /^\d{4}/.test(date) ? Number(date.slice(0, 4)) : null);
const text = (value: string | null | undefined) => (value?.trim() ? value.trim() : null);

const movieResults = z.object({
  results: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      overview: z.string().nullish(),
      poster_path: z.string().nullish(),
      release_date: z.string().optional(),
    })
  ),
});

const tvResults = z.object({
  results: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
      overview: z.string().nullish(),
      poster_path: z.string().nullish(),
      first_air_date: z.string().optional(),
    })
  ),
});

const episodeSchema = z.object({ name: z.string().nullish(), overview: z.string().nullish() });

@Injectable()
export class TmdbClient {
  constructor(@Inject(ENV) private readonly env: Environment) {}

  get enabled(): boolean {
    return Boolean(this.env.TMDB_TOKEN);
  }

  async searchMovie(title: string, year: number | null): Promise<TmdbMatch | null> {
    const params = new URLSearchParams({ query: title, include_adult: 'false' });
    if (year) params.set('year', String(year));
    const body = movieResults.parse(await this.get(`/search/movie?${params}`));
    const hit = body.results[0];
    if (!hit) return null;
    return { id: hit.id, title: hit.title, year: yearOf(hit.release_date), overview: text(hit.overview), posterPath: hit.poster_path ?? null };
  }

  async searchTv(title: string, year: number | null): Promise<TmdbMatch | null> {
    const params = new URLSearchParams({ query: title, include_adult: 'false' });
    if (year) params.set('first_air_date_year', String(year));
    const body = tvResults.parse(await this.get(`/search/tv?${params}`));
    const hit = body.results[0];
    if (!hit) return null;
    return { id: hit.id, title: hit.name, year: yearOf(hit.first_air_date), overview: text(hit.overview), posterPath: hit.poster_path ?? null };
  }

  async episode(tvId: number, season: number, episode: number): Promise<TmdbEpisode | null> {
    const body = await this.get(`/tv/${tvId}/season/${season}/episode/${episode}`, true);
    if (body === null) return null;
    const parsed = episodeSchema.parse(body);
    return { title: text(parsed.name), overview: text(parsed.overview) };
  }

  async image(path: string): Promise<Buffer> {
    const response = await fetch(`${IMAGES}${path}`, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!response.ok) throw new Error(`TMDB image ${path} failed with status ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  private async get(path: string, allowMissing = false): Promise<unknown> {
    if (!this.env.TMDB_TOKEN) throw new Error('TMDB_TOKEN is not configured');
    const response = await fetch(`${API}${path}`, {
      headers: { Authorization: `Bearer ${this.env.TMDB_TOKEN}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (allowMissing && response.status === 404) return null;
    if (!response.ok) throw new Error(`TMDB ${path.split('?')[0]} failed with status ${response.status}`);
    return response.json();
  }
}
