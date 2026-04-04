import { create } from 'zustand';

interface TraceHistoryItem {
  chain: string;
  address: string;
  label?: string;
}

interface TraceSessionState {
  history: TraceHistoryItem[];
  currentIndex: number;
  rendererType: 'cytoscape' | 'sigma' | null;
  activeJobId: string | null;
  push: (item: TraceHistoryItem) => void;
  back: () => void;
  forward: () => void;
  lockRenderer: (type: 'cytoscape' | 'sigma') => void;
  setActiveJob: (id: string | null) => void;
}

export const useTraceSession = create<TraceSessionState>((set) => ({
  history: [],
  currentIndex: -1,
  rendererType: null,
  activeJobId: null,
  push: (item) =>
    set((s) => ({
      history: [...s.history.slice(0, s.currentIndex + 1), item],
      currentIndex: s.currentIndex + 1,
    })),
  back: () =>
    set((s) => ({
      currentIndex: Math.max(0, s.currentIndex - 1),
    })),
  forward: () =>
    set((s) => ({
      currentIndex: Math.min(s.history.length - 1, s.currentIndex + 1),
    })),
  lockRenderer: (type) => set({ rendererType: type }),
  setActiveJob: (id) => set({ activeJobId: id }),
}));
