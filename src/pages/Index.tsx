import { AlertCircle, RefreshCw } from 'lucide-react';
import { useState } from 'react';

import { LandingPage } from '@/components/LandingPage';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { MediaCard } from '@/components/MediaCard';
import { MediaGrid } from '@/components/MediaGrid';
import { StatsOverview } from '@/components/StatsOverview';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/useToast';
import { parseNetflixCSV } from '@/services/csvService';
import { processViewingHistory, generateStats } from '@/services/tmdbService';
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

const renderLoading = () => (
  <LoadingSpinner
    text="Analyzing your viewing history..."
    subText="This may take a minute as we fetch metadata for each title"
  />
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

const useNetflixParser = () => {
  const { toast } = useToast();

  const parseCSVFile = async (file: File) => {
    const history = await parseNetflixCSV(file);

    toast({
      title: 'CSV parsed successfully',
      description: `Found ${history.length} viewing history items`,
    });

    return history;
  };

  return { parseCSVFile };
};

const useMediaProcessor = () => {
  const { toast } = useToast();

  const processMediaData = async (history: NetflixViewingItem[]) => {
    const processedMedia = await processViewingHistory(history);
    const statsData = generateStats(processedMedia);

    toast({
      title: 'Analysis complete',
      description: `Processed ${processedMedia.length} unique titles`,
    });

    return { processedMedia, statsData };
  };

  return { processMediaData };
};

const useErrorHandler = () => {
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleProcessingError = (err: unknown) => {
    console.error('Error processing file:', err);
    setError(
      'Failed to process the file. Please try again with a valid Netflix viewing history CSV.'
    );

    toast({
      variant: 'destructive',
      title: 'Error processing file',
      description: "Make sure you've uploaded a valid Netflix viewing history CSV file.",
    });
  };

  const clearError = () => setError(null);

  return { error, handleProcessingError, clearError };
};

const useFileProcessor = () => {
  const [viewingHistory, setViewingHistory] = useState<NetflixViewingItem[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const resetData = () => {
    setViewingHistory([]);
    setMediaItems([]);
    setStats(null);
  };

  return {
    viewingHistory,
    setViewingHistory,
    mediaItems,
    setMediaItems,
    stats,
    setStats,
    isProcessing,
    setIsProcessing,
    resetData,
  };
};

const useNetflixHistory = () => {
  const {
    viewingHistory,
    setViewingHistory,
    mediaItems,
    setMediaItems,
    stats,
    setStats,
    isProcessing,
    setIsProcessing,
    resetData,
  } = useFileProcessor();

  const { error, handleProcessingError, clearError } = useErrorHandler();
  const { parseCSVFile } = useNetflixParser();
  const { processMediaData } = useMediaProcessor();

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    clearError();

    try {
      const history = await parseCSVFile(file);
      setViewingHistory(history);

      const { processedMedia, statsData } = await processMediaData(history);
      setMediaItems(processedMedia);
      setStats(statsData);
    } catch (err) {
      handleProcessingError(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    resetData();
    clearError();
  };

  return {
    viewingHistory,
    mediaItems,
    stats,
    isProcessing,
    error,
    handleFileUpload,
    handleReset,
  };
};

const Index = () => {
  const { viewingHistory, mediaItems, stats, isProcessing, error, handleFileUpload, handleReset } =
    useNetflixHistory();

  if (viewingHistory.length === 0 && !isProcessing) {
    return (
      <div className="container mx-auto py-12">
        <LandingPage onFileUpload={handleFileUpload} isProcessing={isProcessing} />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {renderHeader(handleReset)}
      {error && renderError(error)}
      {isProcessing && renderLoading()}
      {!isProcessing && stats && renderResults(mediaItems, stats)}
    </div>
  );
};

export default Index;
