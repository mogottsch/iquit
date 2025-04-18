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

// Global cancellation flag to abort processing
let processingCancelled = false;

/**
 * Cancel any ongoing processing
 */
export const cancelProcessing = (): void => {
  processingCancelled = true;
  clearProcessingState();
  console.log('Processing cancelled');
};

/**
 * Reset the cancellation flag
 */
export const resetCancellation = (): void => {
  processingCancelled = false;
};

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
 * Report newly processed items to the callback
 */
const reportProcessedItem = (
  mediaMap: Map<string, MediaItem>,
  batchItems: NetflixViewingItem[],
  onItemProcessed: (item: MediaItem) => void
): void => {
  // Process each item in the current batch
  for (const batchItem of batchItems) {
    const cleanedTitle = cleanTitle(batchItem.title);

    // Find media items that match this batch item's title
    for (const mediaItem of mediaMap.values()) {
      // Check if this media item was created from this batch item
      // Simple check: title similarity and watched date match
      if (
        (mediaItem.title.toLowerCase().includes(cleanedTitle.toLowerCase()) ||
          cleanedTitle.toLowerCase().includes(mediaItem.title.toLowerCase())) &&
        mediaItem.watchedDate === batchItem.date
      ) {
        onItemProcessed(mediaItem);
      }
    }
  }
};

/**
 * Process viewing history items to enrich with TMDB data
 */
export const processViewingHistory = async (
  viewingHistory: NetflixViewingItem[],
  progressCallback?: (currentCount: number, totalCount: number) => void,
  onItemProcessed?: (item: MediaItem) => void,
  startIndex: number = 0,
  existingMediaMap?: Map<string, MediaItem>
): Promise<{ mediaItems: MediaItem[]; cancelled: boolean }> => {
  // Reset cancellation flag at the start
  resetCancellation();

  const mediaMap = existingMediaMap || new Map<string, MediaItem>();
  const batchSize = 40;

  for (let i = startIndex; i < viewingHistory.length; i += batchSize) {
    // Check if processing has been cancelled
    if (processingCancelled) {
      console.log('Processing aborted at index', i);
      return {
        mediaItems: Array.from(mediaMap.values()),
        cancelled: true,
      };
    }

    const batch = viewingHistory.slice(i, i + batchSize);
    await processBatch(batch, mediaMap);

    if (progressCallback) {
      progressCallback(i + batch.length, viewingHistory.length);
    }

    if (onItemProcessed && batch.length > 0) {
      reportProcessedItem(mediaMap, batch, onItemProcessed);
    }

    // Save current state periodically to support resuming on refresh
    if (i % 10 === 0 && i > startIndex) {
      saveProcessingState(viewingHistory, i, Array.from(mediaMap.values()));
    }

    // Force UI update by yielding to event loop for larger batches
    if (i % 10 === 0) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    // Add a small delay between batches to avoid rate limiting
    if (i + batchSize < viewingHistory.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  // Processing complete
  completeProcessing();

  return {
    mediaItems: Array.from(mediaMap.values()).sort(
      (a, b) => new Date(b.watchedDate).getTime() - new Date(a.watchedDate).getTime()
    ),
    cancelled: false,
  };
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

/**
 * Save media items and stats to localStorage
 */
export const saveDataToLocalStorage = (mediaItems: MediaItem[], stats: StatsData): void => {
  try {
    console.log('Saving data to localStorage:', {
      itemCount: mediaItems.length,
      statsAvailable: !!stats,
    });
    localStorage.setItem('iquit-media-items', JSON.stringify(mediaItems));
    localStorage.setItem('iquit-stats', JSON.stringify(stats));
    localStorage.setItem('iquit-data-timestamp', Date.now().toString());
  } catch (error) {
    console.error('Error saving data to localStorage:', error);
  }
};

/**
 * Load media items and stats from localStorage
 */
export const loadDataFromLocalStorage = (): {
  mediaItems: MediaItem[] | null;
  stats: StatsData | null;
  timestamp: number | null;
} => {
  try {
    const mediaItemsJson = localStorage.getItem('iquit-media-items');
    const statsJson = localStorage.getItem('iquit-stats');
    const timestampStr = localStorage.getItem('iquit-data-timestamp');

    const parsedItems = mediaItemsJson ? JSON.parse(mediaItemsJson) : null;
    const parsedStats = statsJson ? JSON.parse(statsJson) : null;

    // Only return valid data (arrays must not be empty)
    return {
      mediaItems:
        parsedItems && Array.isArray(parsedItems) && parsedItems.length > 0 ? parsedItems : null,
      stats: parsedStats ? parsedStats : null,
      timestamp: timestampStr ? parseInt(timestampStr, 10) : null,
    };
  } catch (error) {
    console.error('Error loading data from localStorage:', error);
    return { mediaItems: null, stats: null, timestamp: null };
  }
};

/**
 * Clear saved data from localStorage
 */
export const clearLocalStorageData = (): void => {
  try {
    localStorage.removeItem('iquit-media-items');
    localStorage.removeItem('iquit-stats');
    localStorage.removeItem('iquit-data-timestamp');
  } catch (error) {
    console.error('Error clearing localStorage data:', error);
  }
};

/**
 * Save viewing history and processing state to localStorage
 */
export const saveProcessingState = (
  viewingHistory: NetflixViewingItem[],
  processedCount: number,
  partialItems: MediaItem[]
): void => {
  try {
    localStorage.setItem('iquit-viewing-history', JSON.stringify(viewingHistory));
    localStorage.setItem('iquit-processed-count', processedCount.toString());
    localStorage.setItem('iquit-partial-items', JSON.stringify(partialItems));
    localStorage.setItem('iquit-processing-active', 'true');
  } catch (error) {
    console.error('Error saving processing state to localStorage:', error);
  }
};

/**
 * Load in-progress processing state from localStorage
 */
export const loadProcessingState = (): {
  viewingHistory: NetflixViewingItem[] | null;
  processedCount: number;
  partialItems: MediaItem[] | null;
  isProcessing: boolean;
} => {
  try {
    const viewingHistoryJson = localStorage.getItem('iquit-viewing-history');
    const processedCountStr = localStorage.getItem('iquit-processed-count');
    const partialItemsJson = localStorage.getItem('iquit-partial-items');
    const isProcessingStr = localStorage.getItem('iquit-processing-active');

    return {
      viewingHistory: viewingHistoryJson ? JSON.parse(viewingHistoryJson) : null,
      processedCount: processedCountStr ? parseInt(processedCountStr, 10) : 0,
      partialItems: partialItemsJson ? JSON.parse(partialItemsJson) : null,
      isProcessing: isProcessingStr === 'true',
    };
  } catch (error) {
    console.error('Error loading processing state from localStorage:', error);
    return { viewingHistory: null, processedCount: 0, partialItems: null, isProcessing: false };
  }
};

/**
 * Clear processing state from localStorage
 */
export const clearProcessingState = (): void => {
  try {
    localStorage.removeItem('iquit-viewing-history');
    localStorage.removeItem('iquit-processed-count');
    localStorage.removeItem('iquit-partial-items');
    localStorage.removeItem('iquit-processing-active');
  } catch (error) {
    console.error('Error clearing processing state from localStorage:', error);
  }
};

/**
 * Mark processing as complete
 */
export const completeProcessing = (): void => {
  try {
    localStorage.removeItem('iquit-processing-active');
  } catch (error) {
    console.error('Error updating processing state in localStorage:', error);
  }
};
