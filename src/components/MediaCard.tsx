import { format } from 'date-fns';
import { Tv, Film, Calendar, Star } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { MediaItem } from '@/types';

interface MediaCardProps {
  item: MediaItem;
  showContinuingBadge?: boolean;
}

export function MediaCard({ item, showContinuingBadge = true }: MediaCardProps) {
  const placeholder = '/placeholder.svg';
  const watchedDate = new Date(item.watchedDate);
  const isValidDate = !isNaN(watchedDate.getTime());

  // Format for displaying dates
  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? 'Unknown' : format(date, 'MMM d, yyyy');
  };

  return (
    <Card className="overflow-hidden h-full flex flex-col hover:shadow-md transition-shadow">
      <div className="aspect-[2/3] relative bg-muted overflow-hidden">
        {item.posterPath ? (
          <img
            src={item.posterPath}
            alt={item.title}
            className="object-cover w-full h-full"
            onError={(e) => {
              (e.target as HTMLImageElement).src = placeholder;
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            {item.type === 'movie' ? (
              <Film className="h-16 w-16 text-muted-foreground opacity-40" />
            ) : (
              <Tv className="h-16 w-16 text-muted-foreground opacity-40" />
            )}
          </div>
        )}

        {/* Media type badge */}
        <Badge
          className="absolute top-2 left-2"
          variant={item.type === 'movie' ? 'default' : 'secondary'}
        >
          {item.type === 'movie' ? (
            <>
              <Film className="h-3 w-3 mr-1" /> Movie
            </>
          ) : (
            <>
              <Tv className="h-3 w-3 mr-1" /> TV Show
            </>
          )}
        </Badge>

        {/* Continuing badge */}
        {item.type === 'tv' && item.continuing && showContinuingBadge && (
          <Badge className="absolute top-2 right-2 bg-green-600 hover:bg-green-700">
            Continuing
          </Badge>
        )}

        {/* Rating badge */}
        {item.voteAverage && (
          <Badge className="absolute bottom-2 right-2 bg-yellow-600 hover:bg-yellow-700">
            <Star className="h-3 w-3 mr-1 fill-current" /> {item.voteAverage.toFixed(1)}
          </Badge>
        )}
      </div>

      <CardContent className="pt-4 flex-grow">
        <h3 className="font-medium text-base mb-1 line-clamp-2">{item.title}</h3>

        {item.type === 'movie' && item.releaseDate && (
          <p className="text-xs text-muted-foreground mb-2">
            Released: {formatDate(item.releaseDate)}
          </p>
        )}

        {item.type === 'tv' && item.firstAirDate && (
          <p className="text-xs text-muted-foreground mb-2">
            First aired: {formatDate(item.firstAirDate)}
          </p>
        )}

        {item.overview && (
          <p className="text-xs text-muted-foreground line-clamp-3 mt-2">{item.overview}</p>
        )}
      </CardContent>

      <CardFooter className="pt-0 text-xs text-muted-foreground border-t mt-auto">
        <div className="flex items-center w-full">
          <Calendar className="h-3 w-3 mr-1" />
          <span>Watched: {isValidDate ? format(watchedDate, 'MMM d, yyyy') : 'Unknown date'}</span>

          {item.watchCount && item.watchCount > 1 && (
            <Badge variant="outline" className="ml-auto">
              Watched {item.watchCount}×
            </Badge>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
