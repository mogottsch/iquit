import { Film, Tv, TrendingUp, Clock, Search, SortAsc, SortDesc, CalendarDays } from 'lucide-react';
import { useState } from 'react';

import { MediaCard } from './MediaCard';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/DropdownMenu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MediaItem } from '@/types';

interface MediaGridProps {
  items: MediaItem[];
  continuingShows: MediaItem[];
}

type SortOption = 'recent' | 'title' | 'rating';
type SortDirection = 'asc' | 'desc';

export function MediaGrid({ items, continuingShows }: MediaGridProps) {
  const [filter, setFilter] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('recent');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  // Split into movies and TV shows
  const movies = items.filter((item) => item.type === 'movie');
  const tvShows = items.filter((item) => item.type === 'tv');

  // Apply search filter
  const filterItems = (mediaItems: MediaItem[]) => {
    if (!filter) return mediaItems;

    const searchTerm = filter.toLowerCase();
    return mediaItems.filter((item) => item.title.toLowerCase().includes(searchTerm));
  };

  // Apply sorting
  const sortItems = (mediaItems: MediaItem[]) => {
    const sorted = [...mediaItems];

    sorted.sort((a, b) => {
      let comparison = 0;

      if (sortBy === 'recent') {
        comparison = new Date(b.watchedDate).getTime() - new Date(a.watchedDate).getTime();
      } else if (sortBy === 'title') {
        comparison = a.title.localeCompare(b.title);
      } else if (sortBy === 'rating') {
        const ratingA = a.voteAverage || 0;
        const ratingB = b.voteAverage || 0;
        comparison = ratingA - ratingB;
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return sorted;
  };

  // Apply filtering and sorting
  const filteredMovies = sortItems(filterItems(movies));
  const filteredTvShows = sortItems(filterItems(tvShows));
  const filteredContinuing = sortItems(filterItems(continuingShows));

  // Get counts
  const movieCount = filteredMovies.length;
  const tvShowCount = filteredTvShows.length;
  const continuingCount = filteredContinuing.length;

  return (
    <div className="space-y-6">
      {/* Search and filter controls */}
      <div className="flex flex-col sm:flex-row gap-4 items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search titles..."
            className="pl-8"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
            }}
          >
            {sortDirection === 'asc' ? (
              <SortAsc className="h-4 w-4" />
            ) : (
              <SortDesc className="h-4 w-4" />
            )}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex gap-2">
                {sortBy === 'recent' && <Clock className="h-4 w-4" />}
                {sortBy === 'title' && <SortAsc className="h-4 w-4" />}
                {sortBy === 'rating' && <TrendingUp className="h-4 w-4" />}
                <span className="hidden sm:inline-block">
                  Sort by{' '}
                  {sortBy === 'recent' ? 'Watch Date' : sortBy === 'title' ? 'Title' : 'Rating'}
                </span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setSortBy('recent')}>
                <Clock className="h-4 w-4 mr-2" /> Watch Date
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('title')}>
                <SortAsc className="h-4 w-4 mr-2" /> Title
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('rating')}>
                <TrendingUp className="h-4 w-4 mr-2" /> Rating
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">All ({movieCount + tvShowCount})</TabsTrigger>
          <TabsTrigger value="movies">
            <Film className="h-4 w-4 mr-1" /> Movies ({movieCount})
          </TabsTrigger>
          <TabsTrigger value="tv">
            <Tv className="h-4 w-4 mr-1" /> TV Shows ({tvShowCount})
          </TabsTrigger>
          {continuingCount > 0 && (
            <TabsTrigger value="continuing">
              <CalendarDays className="h-4 w-4 mr-1" /> Continuing ({continuingCount})
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="all">
          {filteredMovies.length === 0 && filteredTvShows.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">No results found</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-4">
              {[...filteredMovies, ...filteredTvShows]
                .sort(
                  (a, b) => new Date(b.watchedDate).getTime() - new Date(a.watchedDate).getTime()
                )
                .map((item) => (
                  <MediaCard key={`${item.id}-${item.type}`} item={item} />
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="movies">
          {filteredMovies.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">No movies found</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-4">
              {filteredMovies.map((movie) => (
                <MediaCard key={`${movie.id}-${movie.type}`} item={movie} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="tv">
          {filteredTvShows.length === 0 ? (
            <p className="text-muted-foreground text-center py-12">No TV shows found</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-4">
              {filteredTvShows.map((show) => (
                <MediaCard key={`${show.id}-${show.type}`} item={show} />
              ))}
            </div>
          )}
        </TabsContent>

        {continuingCount > 0 && (
          <TabsContent value="continuing">
            <div className="rounded-lg p-4 bg-primary/10 border border-primary/20 mb-4">
              <h3 className="font-medium mb-1 flex items-center">
                <CalendarDays className="h-4 w-4 mr-2" />
                Continuing TV Shows
              </h3>
              <p className="text-sm text-muted-foreground">
                These shows are still in production or are returning for new seasons.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 mt-4">
              {filteredContinuing.map((show) => (
                <MediaCard
                  key={`${show.id}-${show.type}-continuing`}
                  item={show}
                  showContinuingBadge={true}
                />
              ))}
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
