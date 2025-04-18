import { FileUpIcon, AlertCircle } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface FileUploadProps {
  // eslint-disable-next-line no-unused-vars
  onFileUpload: (file: File) => void;
  isProcessing: boolean;
}

export function FileUpload({ onFileUpload, isProcessing }: FileUploadProps) {
  const [fileError, setFileError] = useState<string | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      setFileError(null);

      // Validate file type
      const file = acceptedFiles[0];
      if (!file) return;

      if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
        setFileError('Please upload a CSV file.');
        return;
      }

      onFileUpload(file);
    },
    [onFileUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    disabled: isProcessing,
  });

  return (
    <div className="w-full max-w-md mx-auto">
      {fileError && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{fileError}</AlertDescription>
        </Alert>
      )}

      <Card
        className={`border-2 border-dashed ${
          isDragActive ? 'border-primary bg-primary/5' : 'border-border'
        } hover:border-primary/50 transition-colors`}
      >
        <CardContent
          {...getRootProps()}
          className="p-6 flex flex-col items-center justify-center cursor-pointer"
        >
          <input {...getInputProps()} />

          <FileUpIcon className="h-12 w-12 text-muted-foreground mb-4" />

          <h3 className="text-lg font-medium mb-2">
            {isDragActive ? 'Drop your file here' : 'Upload your viewing history'}
          </h3>

          <p className="text-sm text-muted-foreground text-center mb-4">
            Drag and drop your Netflix viewing history CSV file, or click to browse
          </p>

          <Button disabled={isProcessing}>
            {isProcessing ? 'Processing...' : 'Select CSV File'}
          </Button>

          <p className="text-xs text-muted-foreground mt-4 text-center">
            Your data is processed locally. We don't store your viewing history.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
