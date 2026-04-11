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
    <div className="cs-card p-4 mt-4">
      {/* Tabs */}
      <div className="flex gap-1 mb-4 pb-2" style={{ borderBottom: '1px solid var(--cs-border)' }}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="text-xs px-4 py-2 rounded-t-lg font-display font-medium transition-all"
            style={
              activeTab === tab.id
                ? { background: 'var(--cs-bg-surface)', color: 'var(--cs-accent)', borderBottom: '2px solid var(--cs-accent)' }
                : { color: 'var(--cs-text-muted)' }
            }
            onMouseEnter={(e) => {
              if (activeTab !== tab.id) e.currentTarget.style.color = 'var(--cs-text-secondary)';
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.id) e.currentTarget.style.color = 'var(--cs-text-muted)';
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

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
