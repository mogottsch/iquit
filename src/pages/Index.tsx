import { useState } from 'react';
import { LandingPage } from '@/components/LandingPage';
import { parseNetflixCSV } from '@/services/csvService';
import { processViewingHistory, generateStats } from '@/services/tmdbService';
import { MediaItem, NetflixViewingItem, StatsData } from '@/types';
import { StatsOverview } from '@/components/StatsOverview';
import { MediaGrid } from '@/components/MediaGrid';
import { MediaCard } from '@/components/MediaCard';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';

const Index = () => {
  const [viewingHistory, setViewingHistory] = useState<NetflixViewingItem[]>([]);
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      // Step 1: Parse the CSV file
      const history = await parseNetflixCSV(file);
      setViewingHistory(history);
      
      toast({
        title: "CSV parsed successfully",
        description: `Found ${history.length} viewing history items`,
      });
      
      // Step 2: Process the viewing history to get media data
      const processedMedia = await processViewingHistory(history);
      setMediaItems(processedMedia);
      
      // Step 3: Generate statistics
      const statsData = generateStats(processedMedia);
      setStats(statsData);
      
      toast({
        title: "Analysis complete",
        description: `Processed ${processedMedia.length} unique titles`,
      });
    } catch (err) {
      console.error('Error processing file:', err);
      setError('Failed to process the file. Please try again with a valid Netflix viewing history CSV.');
      
      toast({
        variant: "destructive",
        title: "Error processing file",
        description: "Make sure you've uploaded a valid Netflix viewing history CSV file.",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setViewingHistory([]);
    setMediaItems([]);
    setStats(null);
    setError(null);
  };

  // Show landing page if no data loaded yet
  if (viewingHistory.length === 0 && !isProcessing) {
    return (
      <div className="container mx-auto py-12">
        <LandingPage onFileUpload={handleFileUpload} isProcessing={isProcessing} />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Stream Sense</h1>
          <p className="text-muted-foreground">Your Netflix viewing history analysis</p>
        </div>
        
        <Button 
          variant="outline" 
          onClick={handleReset}
          className="flex items-center gap-2"
        >
          <RefreshCw className="h-4 w-4" /> Start Over
        </Button>
      </div>
      
      <Separator />

      {/* Error message */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Loading state */}
      {isProcessing && (
        <LoadingSpinner 
          text="Analyzing your viewing history..." 
          subText="This may take a minute as we fetch metadata for each title" 
        />
      )}

      {/* Results */}
      {!isProcessing && stats && (
        <div className="space-y-8">
          {/* Statistics overview */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Viewing Statistics</h2>
            <StatsOverview stats={stats} />
          </div>
          
          {/* Continuing shows highlight */}
          {stats.continueWatchingShows.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">
                Continuing Shows You've Watched
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                These TV shows you've watched are still in production or returning for new seasons.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {stats.continueWatchingShows.slice(0, 5).map(show => (
                  <div key={`highlight-${show.id}`} className="col-span-1">
                    <MediaCard item={show} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Full media grid */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Your Viewing History</h2>
            <MediaGrid 
              items={mediaItems} 
              continuingShows={stats.continueWatchingShows} 
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Index;
