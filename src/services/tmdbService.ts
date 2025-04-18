/**
 * The Movie Database (TMDB) API service
 * Uses the public TMDB API to fetch metadata about movies and TV shows
 */

import { MediaItem, NetflixViewingItem, StatsData } from '@/types';

// TMDB API constants
const TMDB_API_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || '';
const TMDB_IMG_URL = 'https://image.tmdb.org/t/p';

// Image sizes for TMDB
const POSTER_SIZE = 'w342';
const BACKDROP_SIZE = 'w1280';

/**
 * Search for a movie or TV show
 * @param query The search query (title)
 * @returns Promise with search results
 */
export const searchMedia = async (query: string): Promise<any> => {
  try {
    const response = await fetch(
      `${TMDB_API_URL}/search/multi?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
        query
      )}&include_adult=false`
    );

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error searching TMDB:', error);
    return { results: [] };
  }
};

/**
 * Clean a title string to improve search results
 * Removes parentheses, episode numbers, and other noise
 */
export const cleanTitle = (title: string): string => {
  // Remove season and episode indicators like "S1:E2" or ": Episode Name"
  let cleanedTitle = title.replace(/: .*$|S\d+:E\d+.*$/i, '');

  // Remove content in parentheses (often contains "Limited Series" or other metadata)
  cleanedTitle = cleanedTitle.replace(/\([^)]*\)/g, '');

  // Remove limited series indicator
  cleanedTitle = cleanedTitle.replace(/: Limited Series$/i, '');

  // Trim whitespace
  return cleanedTitle.trim();
};

/**
 * Get TV show details including status (to determine if continuing)
 */
export const getTVShowDetails = async (tmdbId: string): Promise<any> => {
  try {
    const response = await fetch(`${TMDB_API_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);

    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`Error fetching TV show details for ID ${tmdbId}:`, error);
    return null;
  }
};

/**
 * Create a new media item based on TMDB search result
 */
const createMediaItem = async (result: any, watchedDate: string): Promise<MediaItem> => {
  const mediaType = result.media_type || (result.first_air_date ? 'tv' : 'movie');
  let continuing = false;
  let status = '';

  if (mediaType === 'tv') {
    const tvDetails = await getTVShowDetails(result.id);
    if (tvDetails) {
      status = tvDetails.status;
      continuing = ['Returning Series', 'In Production'].includes(status);
    }
  }

  return {
    id: result.id,
    title: result.title || result.name,
    type: mediaType as 'movie' | 'tv',
    posterPath: result.poster_path ? `${TMDB_IMG_URL}/${POSTER_SIZE}${result.poster_path}` : null,
    backdropPath: result.backdrop_path
      ? `${TMDB_IMG_URL}/${BACKDROP_SIZE}${result.backdrop_path}`
      : null,
    overview: result.overview || null,
    releaseDate: result.release_date,
    firstAirDate: result.first_air_date,
    lastAirDate: result.last_air_date,
    status,
    continuing,
    watchedDate,
    voteAverage: result.vote_average,
    watchCount: 1,
  };
};

/**
 * Create a minimal media item when no TMDB data is found
 */
const createMinimalMediaItem = (title: string, watchedDate: string): MediaItem => ({
  id: `unknown-${title}`,
  title,
  type: 'movie',
  posterPath: null,
  backdropPath: null,
  overview: null,
  watchedDate,
  watchCount: 1,
});

/**
 * Process a single viewing history item
 */
const processViewingItem = async (
  item: NetflixViewingItem,
  mediaMap: Map<string, MediaItem>
): Promise<void> => {
  try {
    const cleanedTitle = cleanTitle(item.title);
    const searchResult = await searchMedia(cleanedTitle);

    if (searchResult.results && searchResult.results.length > 0) {
      const result = searchResult.results[0];
      const mediaType = result.media_type || (result.first_air_date ? 'tv' : 'movie');
      const key = `${result.id}-${mediaType}`;

      if (mediaMap.has(key)) {
        updateExistingMediaItem(mediaMap, key, item.date);
      } else {
        const mediaItem = await createMediaItem(result, item.date);
        mediaMap.set(key, mediaItem);
      }
    } else {
      const key = `unknown-${item.title}`;

      if (!mediaMap.has(key)) {
        const minimalItem = createMinimalMediaItem(item.title, item.date);
        mediaMap.set(key, minimalItem);
      } else {
        updateExistingMediaItem(mediaMap, key, item.date);
      }
    }
  } catch (error) {
    console.error(`Error processing item: ${item.title}`, error);
  }
};

/**
 * Update an existing media item's watch count and date
 */
const updateExistingMediaItem = (
  mediaMap: Map<string, MediaItem>,
  key: string,
  watchedDate: string
): void => {
  const existingItem = mediaMap.get(key)!;
  existingItem.watchCount = (existingItem.watchCount || 1) + 1;

  // Keep the most recent watched date
  if (new Date(watchedDate) > new Date(existingItem.watchedDate)) {
    existingItem.watchedDate = watchedDate;
  }
};

/**
 * Process a batch of viewing history items
 */
const processBatch = async (
  batch: NetflixViewingItem[],
  mediaMap: Map<string, MediaItem>
): Promise<void> => {
  await Promise.all(batch.map((item) => processViewingItem(item, mediaMap)));
};

/**
 * Report newly processed item if it matches the batch
 */
const reportProcessedItem = (
  mediaMap: Map<string, MediaItem>,
  batchItem: NetflixViewingItem,
  onItemProcessed: (item: MediaItem) => void
): void => {
  // Find and report all newly processed items that match the batch
  // This approach is more thorough than the previous implementation
  for (const mediaItem of mediaMap.values()) {
    // Report each item directly instead of trying to match by title
    onItemProcessed(mediaItem);
  }
};

/**
 * Process viewing history items to enrich with TMDB data
 */
export const processViewingHistory = async (
  viewingHistory: NetflixViewingItem[],
  progressCallback?: (currentCount: number, totalCount: number) => void,
  onItemProcessed?: (item: MediaItem) => void
): Promise<MediaItem[]> => {
  const mediaMap = new Map<string, MediaItem>();
  const batchSize = 40;

  for (let i = 0; i < viewingHistory.length; i += batchSize) {
    const batch = viewingHistory.slice(i, i + batchSize);
    await processBatch(batch, mediaMap);

    if (progressCallback) {
      progressCallback(i + batch.length, viewingHistory.length);
    }

    if (onItemProcessed && batch.length > 0) {
      reportProcessedItem(mediaMap, batch[0], onItemProcessed);
    }

    if (i + batchSize < viewingHistory.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return Array.from(mediaMap.values()).sort(
    (a, b) => new Date(b.watchedDate).getTime() - new Date(a.watchedDate).getTime()
  );
};

/**
 * Calculate watch counts by time periods
 */
const calculateWatchCountsByPeriod = (
  mediaItems: MediaItem[]
): {
  byDay: Record<string, number>;
  byMonth: Record<string, number>;
  byYear: Record<string, number>;
} => {
  const watchedByDay: Record<string, number> = {};
  const watchedByMonth: Record<string, number> = {};
  const watchedByYear: Record<string, number> = {};

  mediaItems.forEach((item) => {
    updateWatchCounts(item, watchedByDay, watchedByMonth, watchedByYear);
  });

  return { byDay: watchedByDay, byMonth: watchedByMonth, byYear: watchedByYear };
};

const updateWatchCounts = (
  item: MediaItem,
  byDay: Record<string, number>,
  byMonth: Record<string, number>,
  byYear: Record<string, number>
) => {
  const date = new Date(item.watchedDate);
  const day = date.toISOString().split('T')[0];
  const month = day.substring(0, 7); // YYYY-MM
  const year = day.substring(0, 4); // YYYY

  byDay[day] = (byDay[day] || 0) + 1;
  byMonth[month] = (byMonth[month] || 0) + 1;
  byYear[year] = (byYear[year] || 0) + 1;
};

/**
 * Generate statistics from processed media items
 */
export const generateStats = (mediaItems: MediaItem[]): StatsData => {
  const movies = mediaItems.filter((item) => item.type === 'movie');
  const tvShows = mediaItems.filter((item) => item.type === 'tv');

  // Calculate watch counts by time periods
  const { byDay, byMonth, byYear } = calculateWatchCountsByPeriod(mediaItems);

  // Most watched shows (by watch count)
  const mostWatchedShows = [...mediaItems]
    .sort((a, b) => (b.watchCount || 0) - (a.watchCount || 0))
    .slice(0, 10);

  // Shows that are continuing
  const continueWatchingShows = tvShows
    .filter((show) => show.continuing)
    .sort((a, b) => new Date(b.watchedDate).getTime() - new Date(a.watchedDate).getTime());

  return {
    totalWatched: mediaItems.length,
    movieCount: movies.length,
    tvCount: tvShows.length,
    watchedByDay: byDay,
    watchedByMonth: byMonth,
    watchedByYear: byYear,
    mostWatchedShows,
    continueWatchingShows,
  };
};
