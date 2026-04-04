import { useState } from 'react';
import type { NormalizedTx } from '../types/api';
import { TimelineChart } from './TimelineChart';
import { ActivityHeatmap } from './ActivityHeatmap';
import { BalanceChart } from './BalanceChart';
import { StatsPanel } from './StatsPanel';

interface AnalysisPanelProps {
  transactions: NormalizedTx[];
  address: string;
  chain: string;
  onAddressClick?: (chain: string, address: string) => void;
}

type Tab = 'timeline' | 'heatmap' | 'balance' | 'stats';

const TABS: { id: Tab; label: string }[] = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'heatmap', label: 'Heatmap' },
  { id: 'balance', label: 'Balance' },
  { id: 'stats', label: 'Stats' },
];

export function AnalysisPanel({ transactions, address, chain, onAddressClick }: AnalysisPanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('timeline');

  if (transactions.length === 0) return null;

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mt-4">
      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-gray-700 pb-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`text-xs px-3 py-1.5 rounded-t transition-colors ${
              activeTab === tab.id
                ? 'bg-gray-700 text-gray-100'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'timeline' && (
        <TimelineChart transactions={transactions} chain={chain} />
      )}
      {activeTab === 'heatmap' && (
        <ActivityHeatmap transactions={transactions} />
      )}
      {activeTab === 'balance' && (
        <BalanceChart transactions={transactions} address={address} chain={chain} />
      )}
      {activeTab === 'stats' && (
        <StatsPanel
          transactions={transactions}
          address={address}
          chain={chain}
          onAddressClick={onAddressClick}
        />
      )}
    </div>
  );
}
