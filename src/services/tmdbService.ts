/**
 * The Movie Database (TMDB) API service
 * Uses the public TMDB API to fetch metadata about movies and TV shows
 */

import { MediaItem, NetflixViewingItem, StatsData } from "@/types";

// TMDB API constants
const TMDB_API_URL = "https://api.themoviedb.org/3";
const TMDB_API_KEY = "1e13b54f2eee3386fc8816bd4fb8b2c4"; // This is a public API key for TMDB
const TMDB_IMG_URL = "https://image.tmdb.org/t/p";

// Image sizes for TMDB
const POSTER_SIZE = "w342";
const BACKDROP_SIZE = "w1280";

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
    console.error("Error searching TMDB:", error);
    return { results: [] };
  }
};

/**
 * Clean a title string to improve search results
 * Removes parentheses, episode numbers, and other noise
 */
export const cleanTitle = (title: string): string => {
  // Remove season and episode indicators like "S1:E2" or ": Episode Name"
  let cleanedTitle = title.replace(/: .*$|S\d+:E\d+.*$/i, "");
  
  // Remove content in parentheses (often contains "Limited Series" or other metadata)
  cleanedTitle = cleanedTitle.replace(/\([^)]*\)/g, "");
  
  // Remove limited series indicator
  cleanedTitle = cleanedTitle.replace(/: Limited Series$/i, "");
  
  // Trim whitespace
  return cleanedTitle.trim();
};

/**
 * Get TV show details including status (to determine if continuing)
 */
export const getTVShowDetails = async (tmdbId: string): Promise<any> => {
  try {
    const response = await fetch(
      `${TMDB_API_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`
    );
    
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
 * Process viewing history items to enrich with TMDB data
 */
export const processViewingHistory = async (
  viewingHistory: NetflixViewingItem[]
): Promise<MediaItem[]> => {
  const mediaMap = new Map<string, MediaItem>();
  
  // Process in batches to avoid rate limiting
  const batchSize = 5;
  
  for (let i = 0; i < viewingHistory.length; i += batchSize) {
    const batch = viewingHistory.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (item) => {
        try {
          const cleanedTitle = cleanTitle(item.title);
          const searchResult = await searchMedia(cleanedTitle);
          
          if (searchResult.results && searchResult.results.length > 0) {
            // Get the most relevant result (first result)
            const result = searchResult.results[0];
            
            // Determine if this is a movie or TV show
            const mediaType = result.media_type || (result.first_air_date ? "tv" : "movie");
            
            // Create a unique key that combines title and type
            const key = `${result.id}-${mediaType}`;
            
            // If we already have this media item, just update watch count and date
            if (mediaMap.has(key)) {
              const existingItem = mediaMap.get(key)!;
              existingItem.watchCount = (existingItem.watchCount || 1) + 1;
              // Keep the most recent watched date
              if (new Date(item.date) > new Date(existingItem.watchedDate)) {
                existingItem.watchedDate = item.date;
              }
            } else {
              // For TV shows, get additional details to check if continuing
              let continuing = false;
              let status = "";
              
              if (mediaType === "tv") {
                const tvDetails = await getTVShowDetails(result.id);
                if (tvDetails) {
                  status = tvDetails.status;
                  // Check if the show is continuing
                  continuing = ["Returning Series", "In Production"].includes(status);
                }
              }
              
              // Create a new media item
              const mediaItem: MediaItem = {
                id: result.id,
                title: result.title || result.name,
                type: mediaType as 'movie' | 'tv',
                posterPath: result.poster_path ? `${TMDB_IMG_URL}/${POSTER_SIZE}${result.poster_path}` : null,
                backdropPath: result.backdrop_path ? `${TMDB_IMG_URL}/${BACKDROP_SIZE}${result.backdrop_path}` : null,
                overview: result.overview || null,
                releaseDate: result.release_date,
                firstAirDate: result.first_air_date,
                lastAirDate: result.last_air_date,
                status,
                continuing,
                watchedDate: item.date,
                voteAverage: result.vote_average,
                watchCount: 1
              };
              
              mediaMap.set(key, mediaItem);
            }
          } else {
            // No results found, create a minimal media item
            const key = `unknown-${item.title}`;
            
            if (!mediaMap.has(key)) {
              mediaMap.set(key, {
                id: key,
                title: item.title,
                type: 'movie', // Default to movie if we can't determine
                posterPath: null,
                backdropPath: null,
                overview: null,
                watchedDate: item.date,
                watchCount: 1
              });
            } else {
              const existingItem = mediaMap.get(key)!;
              existingItem.watchCount = (existingItem.watchCount || 1) + 1;
            }
          }
        } catch (error) {
          console.error(`Error processing item: ${item.title}`, error);
        }
      })
    );
    
    // Add a small delay between batches to avoid rate limiting
    if (i + batchSize < viewingHistory.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Convert the map to an array and sort by watched date (most recent first)
  return Array.from(mediaMap.values()).sort((a, b) => 
    new Date(b.watchedDate).getTime() - new Date(a.watchedDate).getTime()
  );
};

/**
 * Generate statistics from processed media items
 */
export const generateStats = (mediaItems: MediaItem[]): StatsData => {
  const movies = mediaItems.filter(item => item.type === 'movie');
  const tvShows = mediaItems.filter(item => item.type === 'tv');
  
  // Watch counts by date periods
  const watchedByDay: Record<string, number> = {};
  const watchedByMonth: Record<string, number> = {};
  const watchedByYear: Record<string, number> = {};
  
  mediaItems.forEach(item => {
    const date = new Date(item.watchedDate);
    const day = date.toISOString().split('T')[0];
    const month = day.substring(0, 7); // YYYY-MM
    const year = day.substring(0, 4); // YYYY
    
    watchedByDay[day] = (watchedByDay[day] || 0) + 1;
    watchedByMonth[month] = (watchedByMonth[month] || 0) + 1;
    watchedByYear[year] = (watchedByYear[year] || 0) + 1;
  });
  
  // Most watched shows (by watch count)
  const mostWatchedShows = [...mediaItems]
    .sort((a, b) => (b.watchCount || 0) - (a.watchCount || 0))
    .slice(0, 10);
  
  // Shows that are continuing
  const continueWatchingShows = tvShows
    .filter(show => show.continuing)
    .sort((a, b) => new Date(b.watchedDate).getTime() - new Date(a.watchedDate).getTime());
  
  return {
    totalWatched: mediaItems.length,
    movieCount: movies.length,
    tvCount: tvShows.length,
    watchedByDay,
    watchedByMonth,
    watchedByYear,
    mostWatchedShows,
    continueWatchingShows
  };
};
