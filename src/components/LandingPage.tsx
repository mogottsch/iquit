
import { Button } from '@/components/ui/button';
import { FileUpload } from './FileUpload';
import { ExternalLink } from 'lucide-react';

interface LandingPageProps {
  onFileUpload: (file: File) => void;
  isProcessing: boolean;
}

export function LandingPage({ onFileUpload, isProcessing }: LandingPageProps) {
  const NETFLIX_ACTIVITY_URL = 'https://www.netflix.com/viewingactivity';

  return (
    <div className="flex flex-col items-center text-center space-y-8 max-w-xl mx-auto">
      <div className="space-y-4">
        <h1 className="text-4xl font-bold tracking-tight">Stream Sense</h1>
        <p className="text-xl text-muted-foreground">
          Discover insights from your Netflix viewing history
        </p>
      </div>

      <div className="space-y-2 text-center">
        <p>Follow these steps to analyze your viewing history:</p>
        <ol className="list-decimal text-left space-y-4 mx-auto pl-6 pt-4">
          <li>
            <p className="font-medium">Download your Netflix viewing history</p>
            <p className="text-sm text-muted-foreground mb-2">
              Visit your Netflix Account page and go to Viewing Activity
            </p>
            <Button variant="outline" size="sm" className="flex items-center" asChild>
              <a 
                href={NETFLIX_ACTIVITY_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Go to Netflix Activity <ExternalLink className="ml-2 h-3 w-3" />
              </a>
            </Button>
          </li>
          <li>
            <p className="font-medium">Click "Download all" to get the CSV file</p>
            <p className="text-sm text-muted-foreground">
              Look for the "Download all" button at the bottom of your viewing activity
            </p>
          </li>
          <li>
            <p className="font-medium">Upload the CSV file here</p>
            <p className="text-sm text-muted-foreground mb-4">
              Your data never leaves your browser and is processed locally
            </p>
          </li>
        </ol>
      </div>

      <div className="w-full pt-6">
        <FileUpload onFileUpload={onFileUpload} isProcessing={isProcessing} />
      </div>

      <div className="text-xs text-muted-foreground max-w-sm pt-6">
        <p>
          This tool is not affiliated with Netflix. We don't store any of your data.
          All processing happens in your browser.
        </p>
      </div>
    </div>
  );
}
