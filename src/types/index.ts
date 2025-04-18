export interface NetflixViewingItem {
  title: string;
  date: string;
  // Raw data from CSV
  rawTitle?: string;
  rawDate?: string;
}

export interface MediaItem {
  id: string;
  title: string;
  type: 'movie' | 'tv';
  posterPath: string | null;
  backdropPath: string | null;
  overview: string | null;
  releaseDate?: string;
  firstAirDate?: string;
  lastAirDate?: string;
  status?: string;
  continuing?: boolean;
  watchedDate: string;
  voteAverage?: number;
  // Additional fields for summary stats
  watchCount?: number;
}

export interface StatsData {
  totalWatched: number;
  movieCount: number;
  tvCount: number;
  watchedByDay: Record<string, number>;
  watchedByMonth: Record<string, number>;
  watchedByYear: Record<string, number>;
  mostWatchedShows: MediaItem[];
  continueWatchingShows: MediaItem[];
}

export interface CSVData {
  Title: string;
  Date: string;
}
