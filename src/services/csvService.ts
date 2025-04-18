import Papa from 'papaparse';

import { CSVData, NetflixViewingItem } from '@/types';

/**
 * Parse a Netflix viewing history CSV file
 * @param file The CSV file to parse
 * @returns Promise with parsed viewing history
 */
export const parseNetflixCSV = (file: File): Promise<NetflixViewingItem[]> => {
  return new Promise((resolve, reject) => {
    Papa.parse<CSVData>(file, {
      header: true,
      complete: (results): void => {
        const viewingHistory: NetflixViewingItem[] = results.data
          .filter((item) => item.Title && item.Date) // Filter out empty rows
          .map((item) => ({
            title: item.Title,
            date: item.Date,
            rawTitle: item.Title,
            rawDate: item.Date,
          }))
          .slice(0, 50);
        resolve(viewingHistory);
      },
      error: (error: any) => {
        reject(error);
      },
    });
  });
};
