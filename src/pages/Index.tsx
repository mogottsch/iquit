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
  saveProcessingState,
  loadProcessingState,
  clearProcessingState,
  cancelProcessing,
} from '@/services/tmdbService';
import { MediaItem, NetflixViewingItem, StatsData } from '@/types';

const renderHeader = (handleReset: () => void) => (
  <>
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">iquit</h1>
        <p className="text-muted-foreground">
          Save your streaming history before canceling subscriptions
        </p>
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
          {partialResults.slice(0, 20).map((item) => (
            <div key={`partial-${item.id}`} className="col-span-1">
              <MediaCard item={item} />
            </div>
          ))}
        </div>
        {partialResults.length > 20 && (
          <p className="text-sm text-muted-foreground mt-4 text-center">
            + {partialResults.length - 20} more items being processed...
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
  const [showLandingPage, setShowLandingPage] = useState(true);

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
    showLandingPage,
    setShowLandingPage,
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
    state.setShowLandingPage(true);
  };

  const handleProcessingError = (err: unknown) => {
    console.error('Error processing file:', err);
    state.setError(
      'Failed to process the file. Please try again with a valid streaming service viewing history CSV.'
    );

    toast({
      variant: 'destructive',
      title: 'Error processing file',
      description: "Make sure you've uploaded a valid viewing history CSV file.",
    });
  };

  const handleItemProcessed = (item: MediaItem) => {
    state.setPartialMediaItems((prev) => {
      // Check if we already have this item
      if (prev.some((existingItem) => existingItem.id === item.id)) {
        // Update existing item
        return prev.map((existingItem) =>
          existingItem.id === item.id
            ? { ...existingItem, watchCount: (existingItem.watchCount || 1) + 1 }
            : existingItem
        );
      }

      // Add new item
      const newItems = [...prev, item];

      // Sort by most recently watched
      return newItems.sort(
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
    const loadSavedData = async () => {
      try {
        // First check if there's an in-progress processing job
        const { viewingHistory, processedCount, partialItems, isProcessing } =
          loadProcessingState();

        console.log('Checking for in-progress processing:', {
          hasHistory: !!viewingHistory && viewingHistory.length > 0,
          processedCount,
          hasPartialItems: !!partialItems && partialItems.length > 0,
          isProcessing,
        });

        if (viewingHistory && viewingHistory.length > 0 && isProcessing) {
          // We have an in-progress job to resume
          console.log('Resuming processing from index:', processedCount);

          // Set initial state
          state.setViewingHistory(viewingHistory);
          state.setIsProcessing(true);
          state.setShowLandingPage(false);

          if (partialItems && partialItems.length > 0) {
            state.setPartialMediaItems(partialItems);
          }

          // Resume processing
          state.setProgress({ processed: processedCount, total: viewingHistory.length });

          // Use a slight delay to allow UI to update first
          setTimeout(async () => {
            try {
              // Create a map from partial items to maintain state
              const mediaMap = new Map<string, MediaItem>();
              if (partialItems) {
                partialItems.forEach((item) => {
                  mediaMap.set(`${item.id}-${item.type}`, item);
                });
              }

              // Resume processing from where we left off
              const { mediaItems: processedMedia, cancelled } = await processViewingHistory(
                viewingHistory,
                handlers.handleProgress,
                handlers.handleItemProcessed,
                processedCount,
                mediaMap
              );

              // Only proceed with stats calculation and success message if not cancelled
              if (!cancelled) {
                const stats = generateStats(processedMedia);
                state.setMediaItems(processedMedia);
                state.setStats(stats);

                // Save completed data
                saveDataToLocalStorage(processedMedia, stats);
                clearProcessingState();

                handlers.toast({
                  title: 'Analysis complete',
                  description: `Processed ${processedMedia.length} unique titles`,
                });
              }
            } catch (err) {
              handlers.handleProcessingError(err);
            } finally {
              state.setIsProcessing(false);
            }
          }, 500);

          return true; // Indicates we're resuming processing
        }

        // If no in-progress job, check for completed data
        const { mediaItems, stats } = loadDataFromLocalStorage();
        if (mediaItems && stats) {
          state.setMediaItems(mediaItems);
          state.setStats(stats);
          state.setShowLandingPage(false);
          return true; // Indicates we found saved data
        }

        return false; // No saved data found
      } catch (error) {
        console.error('Error in loadSavedData:', error);
        return false;
      }
    };

    loadSavedData();
  }, []);

  const handleFileUpload = async (file: File) => {
    state.setIsProcessing(true);
    state.setProgress(null);
    state.setPartialMediaItems([]);
    state.setShowLandingPage(false);
    handlers.clearError();

    // Clear any existing processing state
    clearProcessingState();

    try {
      // Parse the CSV file
      const history = await parseNetflixCSV(file);
      state.setViewingHistory(history);

      handlers.toast({
        title: 'CSV parsed successfully',
        description: `Found ${history.length} viewing history items`,
      });

      // Save the initial state to enable resuming if page is refreshed
      saveProcessingState(history, 0, []);

      // Process the viewing history
      const { mediaItems: processedMedia, cancelled } = await processViewingHistory(
        history,
        handlers.handleProgress,
        handlers.handleItemProcessed
      );

      // Only proceed with stats calculation and success message if not cancelled
      if (!cancelled) {
        const stats = generateStats(processedMedia);
        state.setMediaItems(processedMedia);
        state.setStats(stats);

        // Save data to localStorage
        saveDataToLocalStorage(processedMedia, stats);
        clearProcessingState();

        handlers.toast({
          title: 'Analysis complete',
          description: `Processed ${processedMedia.length} unique titles`,
        });
      }
    } catch (err) {
      handlers.handleProcessingError(err);
    } finally {
      state.setIsProcessing(false);
    }
  };

  const handleReset = () => {
    // Cancel any ongoing processing first
    cancelProcessing();

    // Then reset all state - make sure to completely clear mediaItems
    handlers.resetData();
    state.setMediaItems([]);
    state.setPartialMediaItems([]);
    state.setStats(null);

    // Force back to landing page
    state.setShowLandingPage(true);

    handlers.clearError();
    clearLocalStorageData();
    clearProcessingState();

    // Force UI update
    state.setIsProcessing(false);

    handlers.toast({
      title: 'Reset complete',
      description: 'Analysis has been cancelled and data cleared',
    });
  };

  return {
    error: state.error,
    viewingHistory: state.viewingHistory,
    mediaItems: state.mediaItems,
    partialMediaItems: state.partialMediaItems,
    stats: state.stats,
    isProcessing: state.isProcessing,
    progress: state.progress,
    showLandingPage: state.showLandingPage,
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
    showLandingPage,
    handleFileUpload,
    handleReset,
  } = useNetflixHistory();

  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
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

  // If reset was called or we're in initial state, show landing page
  if (showLandingPage) {
    return (
      <div className="container mx-auto py-12">
        <LandingPage onFileUpload={handleFileUpload} isProcessing={isProcessing} />
      </div>
    );
  }

  // Show loading UI with partial results during processing
  if (isProcessing) {
    return (
      <div className="container mx-auto py-8 space-y-8">
        {renderHeader(handleReset)}
        {error && renderError(error)}
        {renderLoading(progress, partialMediaItems)}
      </div>
    );
  }

  // Show results if we have completed data
  if (mediaItems.length > 0 && stats) {
    return (
      <div className="container mx-auto py-8 space-y-8">
        {renderHeader(handleReset)}
        {error && renderError(error)}
        {renderResults(mediaItems, stats)}
      </div>
    );
  }

  // Fallback: show landing page if nothing else matched
  return (
    <div className="container mx-auto py-12">
      <LandingPage onFileUpload={handleFileUpload} isProcessing={isProcessing} />
    </div>
  );
};

export default Index;
