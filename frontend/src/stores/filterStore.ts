import { create } from 'zustand';

interface FilterState {
  minValue: string;
  dateRange: [number | null, number | null];
  token: string | null;
  showSpam: boolean;
  showFailed: boolean;
  showDust: boolean;
  showUnconfirmed: boolean;
  riskFilter: 'LOW' | 'MEDIUM' | 'HIGH' | 'SEVERE' | null;
  setFilter: <K extends keyof FilterState>(key: K, value: FilterState[K]) => void;
  resetFilters: () => void;
}

const defaults = {
  minValue: '0',
  dateRange: [null, null] as [number | null, number | null],
  token: null,
  showSpam: false,
  showFailed: false,
  showDust: false,
  showUnconfirmed: true,
  riskFilter: null,
};

export const useFilterStore = create<FilterState>((set) => ({
  ...defaults,
  setFilter: (key, value) => set({ [key]: value }),
  resetFilters: () => set(defaults),
}));
