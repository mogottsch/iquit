
import { StatsData } from '@/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Film, Tv, CalendarClock, Award } from 'lucide-react';

interface StatsOverviewProps {
  stats: StatsData;
}

export function StatsOverview({ stats }: StatsOverviewProps) {
  // Get the most active month and year
  const getMostActive = (data: Record<string, number>): { period: string; count: number } => {
    const entries = Object.entries(data);
    if (entries.length === 0) return { period: 'None', count: 0 };
    
    const max = entries.reduce((max, current) => 
      current[1] > max[1] ? current : max, entries[0]);
    
    return { period: max[0], count: max[1] };
  };
  
  const mostActiveMonth = getMostActive(stats.watchedByMonth);
  const mostActiveYear = getMostActive(stats.watchedByYear);
  
  // Format month for display
  const formatMonth = (month: string) => {
    if (month === 'None') return 'None';
    try {
      const date = new Date(month + '-01'); // Add day to make valid date
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
    } catch {
      return month;
    }
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium">Total Watched</CardTitle>
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.totalWatched}</div>
          <p className="text-xs text-muted-foreground">
            Movies and TV shows combined
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium">Movies</CardTitle>
          <Film className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.movieCount}</div>
          <p className="text-xs text-muted-foreground">
            {((stats.movieCount / stats.totalWatched) * 100).toFixed(1)}% of your viewing
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium">TV Shows</CardTitle>
          <Tv className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.tvCount}</div>
          <p className="text-xs text-muted-foreground">
            {((stats.tvCount / stats.totalWatched) * 100).toFixed(1)}% of your viewing
          </p>
        </CardContent>
      </Card>
      
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
          <CardTitle className="text-sm font-medium">Most Active</CardTitle>
          <Award className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{mostActiveMonth.count} views</div>
          <p className="text-xs text-muted-foreground">
            in {formatMonth(mostActiveMonth.period)}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
