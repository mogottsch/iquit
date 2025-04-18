import { RefreshCw } from 'lucide-react';

interface LoadingSpinnerProps {
  text?: string;
  subText?: string;
}

export function LoadingSpinner({
  text = 'Loading...',
  subText = 'This may take a moment',
}: LoadingSpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12">
      <div className="animate-spin mb-4">
        <RefreshCw className="h-8 w-8 text-primary" />
      </div>
      <p className="text-lg font-medium">{text}</p>
      {subText && <p className="text-sm text-muted-foreground">{subText}</p>}
    </div>
  );
}
