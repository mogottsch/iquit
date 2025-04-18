import { AlertCircle, RefreshCw } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';

import { LandingPage } from '@/components/LandingPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { MediaCard } from '@/components/MediaCard';
import { MediaGrid } from '@/components/MediaGrid';
import { StatsOverview } from '@/components/StatsOverview';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/useToast';
import { parseNetflixCSV } from '@/services/csvService';
import {
  processViewingHistory,
  generateStats,
  saveDataToLocalStorage,
  loadDataFromLocalStorage,
  clearLocalStorageData,
} from '@/services/tmdbService';
import { MediaItem, NetflixViewingItem, StatsData } from '@/types';

const renderHeader = (handleReset: () => void) => (
  <>
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Stream Sense</h1>
        <p className="text-muted-foreground">Your Netflix viewing history analysis</p>
      </div>

      <Button variant="outline" onClick={handleReset} className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4" /> Start Over
      </Button>
    </div>
    <Separator />
  </>
);

const renderError = (error: string) => (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertTitle>Error</AlertTitle>
    <AlertDescription>{error}</AlertDescription>
  </Alert>
);

const renderLoading = (
  progress?: { processed: number; total: number },
  partialResults?: MediaItem[]
) => (
  <div className="space-y-8">
    <div className="flex flex-col items-center justify-center gap-4">
      <LoadingSpinner
        text="Analyzing your viewing history..."
        subText={
          progress
            ? `Processing ${progress.processed} of ${progress.total} items`
            : 'This may take a minute as we fetch metadata for each title'
        }
      />
      {progress && (
        <div className="w-full max-w-md">
          <Progress value={(progress.processed / progress.total) * 100} />
          <p className="text-xs text-center mt-2 text-muted-foreground">
            {Math.round((progress.processed / progress.total) * 100)}%
          </p>
        </div>
      )}
    </div>

    {partialResults && partialResults.length > 0 && (
      <div>
        <h2 className="text-xl font-semibold mb-4">
          Content Discovered So Far ({partialResults.length})
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Showing titles as they're processed. More will appear as analysis continues...
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {partialResults.slice(0, 15).map((item) => (
            <div key={`partial-${item.id}`} className="col-span-1">
              <MediaCard item={item} />
            </div>
          ))}
        </div>
        {partialResults.length > 15 && (
          <p className="text-sm text-muted-foreground mt-4 text-center">
            + {partialResults.length - 15} more items being processed...
          </p>
        )}
      </div>
    )}
  </div>
);

const renderContinuingShows = (continueWatchingShows: MediaItem[]) => {
  if (continueWatchingShows.length === 0) return null;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Continuing Shows You've Watched</h2>
      <p className="text-sm text-muted-foreground mb-4">
        These TV shows you've watched are still in production or returning for new seasons.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {continueWatchingShows.slice(0, 5).map((show) => (
          <div key={`highlight-${show.id}`} className="col-span-1">
            <MediaCard item={show} />
          </div>
        ))}
      </div>
    </div>
  );
};

const renderResults = (mediaItems: MediaItem[], stats: StatsData) => (
  <div className="space-y-8">
    <div>
      <h2 className="text-xl font-semibold mb-4">Viewing Statistics</h2>
      <StatsOverview stats={stats} />
    </div>

    {renderContinuingShows(stats.continueWatchingShows)}

    <div>
      <h2 className="text-xl font-semibold mb-4">Your Viewing History</h2>
      <MediaGrid items={mediaItems} continuingShows={stats.continueWatchingShows} />
    </div>
  </div>
);

const useHistoryState = () => {
  const [viewingHistory, setViewingHistory] = useState<NetflixViewingItem[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [partialMediaItems, setPartialMediaItems] = useState<MediaItem[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ processed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  return {
    viewingHistory,
    setViewingHistory,
    mediaItems,
    setMediaItems,
    partialMediaItems,
    setPartialMediaItems,
    stats,
    setStats,
    isProcessing,
    setIsProcessing,
    progress,
    setProgress,
    error,
    setError,
  };
};

const useHistoryHandlers = (state: ReturnType<typeof useHistoryState>) => {
  const { toast } = useToast();

  const clearError = () => state.setError(null);

  const resetData = () => {
    state.setViewingHistory([]);
    state.setMediaItems([]);
    state.setPartialMediaItems([]);
    state.setStats(null);
    state.setProgress(null);
  };

  const handleProcessingError = (err: unknown) => {
    console.error('Error processing file:', err);
    state.setError(
      'Failed to process the file. Please try again with a valid Netflix viewing history CSV.'
    );

    toast({
      variant: 'destructive',
      title: 'Error processing file',
      description: "Make sure you've uploaded a valid Netflix viewing history CSV file.",
    });
  };

  const handleItemProcessed = (item: MediaItem) => {
    state.setPartialMediaItems((prev) => {
      if (prev.some((existingItem) => existingItem.id === item.id)) {
        return prev;
      }
      return [...prev, item].sort(
        (a, b) => new Date(b.watchedDate).getTime() - new Date(a.watchedDate).getTime()
      );
    });
  };

  const handleProgress = (processed: number, total: number) => {
    state.setProgress({ processed, total });
  };

  return {
    clearError,
    resetData,
    handleProcessingError,
    handleItemProcessed,
    handleProgress,
    toast,
  };
};

// eslint-disable-next-line max-lines-per-function
const useNetflixHistory = () => {
  const state = useHistoryState();
  const handlers = useHistoryHandlers(state);

  useEffect(() => {
    const loadSavedData = () => {
      try {
        const { mediaItems, stats } = loadDataFromLocalStorage();
        console.log('Attempting to load from localStorage:', {
          mediaItemsFound: !!mediaItems,
          statsFound: !!stats,
          itemCount: mediaItems?.length || 0,
        });

        if (mediaItems && stats) {
          state.setMediaItems(mediaItems);
          state.setStats(stats);
        }
      } catch (error) {
        console.error('Error in loadSavedData:', error);
      }
    };

    loadSavedData();
  }, []);

  const handleFileUpload = async (file: File) => {
    state.setIsProcessing(true);
    state.setProgress(null);
    state.setPartialMediaItems([]);
    handlers.clearError();

    try {
      // Parse the CSV file
      const history = await parseNetflixCSV(file);
      state.setViewingHistory(history);

      handlers.toast({
        title: 'CSV parsed successfully',
        description: `Found ${history.length} viewing history items`,
      });

      // Process the viewing history
      const processedMedia = await processViewingHistory(
        history,
        handlers.handleProgress,
        handlers.handleItemProcessed
      );

      const statsData = generateStats(processedMedia);
      state.setMediaItems(processedMedia);
      state.setStats(statsData);

      // Save data to localStorage
      saveDataToLocalStorage(processedMedia, statsData);

      handlers.toast({
        title: 'Analysis complete',
        description: `Processed ${processedMedia.length} unique titles`,
      });
    } catch (err) {
      handlers.handleProcessingError(err);
    } finally {
      state.setIsProcessing(false);
    }
  };

  const handleReset = () => {
    handlers.resetData();
    handlers.clearError();
    clearLocalStorageData();
  };

  return {
    error: state.error,
    viewingHistory: state.viewingHistory,
    mediaItems: state.mediaItems,
    partialMediaItems: state.partialMediaItems,
    stats: state.stats,
    isProcessing: state.isProcessing,
    progress: state.progress,
    handleFileUpload,
    handleReset,
  };
};

const Index = () => {
  const {
    error,
    viewingHistory,
    mediaItems,
    partialMediaItems,
    stats,
    isProcessing,
    progress,
    handleFileUpload,
    handleReset,
  } = useNetflixHistory();

  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    // Mark data as loaded after initial load attempt
    const timer = setTimeout(() => {
      setDataLoaded(true);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  if (!dataLoaded) {
    return (
      <div className="container mx-auto py-12 flex justify-center items-center">
        <LoadingSpinner text="Loading..." />
      </div>
    );
  }

  // If we have media items and stats, show results
  if (mediaItems.length > 0 && stats) {
    return (
      <div className="container mx-auto py-8 space-y-8">
        {renderHeader(handleReset)}
        {error && renderError(error)}
        {isProcessing && renderLoading(progress, partialMediaItems)}
        {renderResults(mediaItems, stats)}
      </div>
    );
  }

  // Otherwise show the landing page
  return (
    <div className="container mx-auto py-12">
      <LandingPage onFileUpload={handleFileUpload} isProcessing={isProcessing} />
    </div>
  );
};

export default Index;
