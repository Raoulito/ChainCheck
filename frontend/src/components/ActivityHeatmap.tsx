import { useMemo } from 'react';
import type { NormalizedTx } from '../types/api';

interface ActivityHeatmapProps {
  transactions: NormalizedTx[];
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

function getHeatColor(intensity: number): string {
  if (intensity === 0) return 'bg-gray-800';
  if (intensity < 0.25) return 'bg-blue-900/50';
  if (intensity < 0.5) return 'bg-blue-700/60';
  if (intensity < 0.75) return 'bg-blue-500/70';
  return 'bg-blue-400/80';
}

export function ActivityHeatmap({ transactions }: ActivityHeatmapProps) {
  const { grid, maxCount, peakDay, peakHour } = useMemo(() => {
    const counts = Array.from({ length: 7 }, () => Array(24).fill(0) as number[]);
    let max = 0;

    for (const tx of transactions) {
      if (tx.status === 'failed') continue;
      const date = new Date(tx.timestamp * 1000);
      const day = date.getUTCDay();
      const hour = date.getUTCHours();
      counts[day][hour]++;
      max = Math.max(max, counts[day][hour]);
    }

    // Find peak
    let pDay = 0, pHour = 0, pMax = 0;
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        if (counts[d][h] > pMax) {
          pMax = counts[d][h];
          pDay = d;
          pHour = h;
        }
      }
    }

    return { grid: counts, maxCount: max, peakDay: pDay, peakHour: pHour };
  }, [transactions]);

  if (transactions.length === 0) return null;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs font-medium text-gray-300">Activity Heatmap (UTC)</h4>
        {maxCount > 0 && (
          <span className="text-xs text-gray-500">
            Peak: {DAYS[peakDay]} {peakHour}:00-{peakHour + 1}:00 UTC
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs">
          <thead>
            <tr>
              <th className="w-8" />
              {HOURS.filter(h => h % 2 === 0).map((h) => (
                <th key={h} colSpan={2} className="text-gray-500 font-normal px-0.5">
                  {String(h).padStart(2, '0')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, di) => (
              <tr key={day}>
                <td className="text-gray-500 pr-1 text-right">{day}</td>
                {HOURS.map((h) => {
                  const count = grid[di][h];
                  const intensity = maxCount > 0 ? count / maxCount : 0;
                  return (
                    <td
                      key={h}
                      className={`w-3 h-3 ${getHeatColor(intensity)}`}
                      title={`${day} ${h}:00 — ${count} tx${count !== 1 ? 's' : ''}`}
                    />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
