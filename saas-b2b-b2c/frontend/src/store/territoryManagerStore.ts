// src/store/territoryManagerStore.ts
import { create } from 'zustand';
import apiClient from '@/api/axiosClient';

export interface TerritorySummary {
  planCompletionPercent: number;
  planCompletionChange: number;
  quarterForecastPercent: number;
  redZoneDealersCount: number;
  avgConversion: number;
  activeAlerts: number;
}

export interface DealerMetrics {
  dealerId: string;
  dealerName: string;
  salonCount: number;
  planPercent: number;
  forecastPercent: number;
  conversion: number;
  status: 'green' | 'yellow' | 'red';
  plan?: number;
  fact?: number;
  debt?: number;
  margin?: number;
  avgCheck?: number;
  taskCount?: number;
}

export interface TerritoryManager {
  id: string;
  name: string;
  territoryName: string;
  region: string;
}

interface TerritoryManagerState {
  activeTab: string;
  manager: TerritoryManager | null;
  summary: TerritorySummary | null;
  dealers: DealerMetrics[];
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  summaryModalOpen: boolean;
  setActiveTab: (tab: string) => void;
  setManager: (manager: TerritoryManager) => void;
  setSummary: (summary: TerritorySummary) => void;
  setDealers: (dealers: DealerMetrics[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLastUpdated: (date: Date) => void;
  setSummaryModalOpen: (open: boolean) => void;
  fetchSummary: () => Promise<void>;
  fetchDealers: () => Promise<void>;
  fetchFunnel: (period?: string, startDate?: string, endDate?: string) => Promise<any>;
  fetchPlanFact: (period?: string) => Promise<any>;
  fetchBenchmarks: (period?: string, startDate?: string, endDate?: string) => Promise<any>;
}

export const useTerritoryManagerStore = create<TerritoryManagerState>((set, get) => ({
  activeTab: 'map',
  manager: null,
  summary: null,
  dealers: [],
  isLoading: false,
  error: null,
  lastUpdated: null,
  summaryModalOpen: false,
  setActiveTab: (tab) => set({ activeTab: tab }),
  setManager: (manager) => set({ manager }),
  setSummary: (summary) => set({ summary }),
  setDealers: (dealers) => set({ dealers }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setLastUpdated: (date) => set({ lastUpdated: date }),
  setSummaryModalOpen: (open) => set({ summaryModalOpen: open }),

  fetchSummary: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.get('/territory/summary');
      const data = res.data;
      set({
        summary: {
          planCompletionPercent: data.planCompletionPercent || 0,
          planCompletionChange: data.planCompletionChange || 0,
          quarterForecastPercent: data.quarterForecastPercent || 0,
          redZoneDealersCount: data.redZoneDealersCount || 0,
          avgConversion: data.avgConversion || 0,
          activeAlerts: data.activeAlerts || 0,
        },
        lastUpdated: new Date(),
      });
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Ошибка загрузки сводки';
      console.error('Error fetching territory summary:', e);
      set({ error: msg });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchDealers: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await apiClient.get('/territory/planfact?period=month');
      const data = res.data;
      
      const dealers: DealerMetrics[] = (data.dealers || []).map((d: any) => ({
        dealerId: d.id,
        dealerName: d.dealer_name || '',
        salonCount: d.salon_count || 0,
        planPercent: d.plan_percent || 0,
        forecastPercent: d.forecast !== undefined ? d.forecast : d.plan_percent >= 80 ? 100 : d.plan_percent >= 50 ? 70 : 30,
        conversion: d.conversion || 0,
        status: d.plan_percent >= 80 ? 'green' : d.plan_percent >= 50 ? 'yellow' : 'red',
        plan: d.plan || 0,
        fact: d.fact || 0,
        debt: d.debt || 0,
        margin: d.margin || 0,
        avgCheck: d.avg_check || 0,
        taskCount: d.task_count || 0,
      }));
      
      set({ dealers, error: null, lastUpdated: new Date() });
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Ошибка загрузки дилеров';
      console.error('Error fetching dealers:', e);
      set({ error: msg });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchFunnel: async (period = 'month', startDate?: string, endDate?: string) => {
    try {
      let url = `/territory/funnel?period=${period}`;
      if (startDate && endDate) {
        url = `/territory/funnel?start_date=${startDate}&end_date=${endDate}`;
      }
      const res = await apiClient.get(url);
      set({ error: null });
      return res.data;
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Ошибка загрузки воронки';
      console.error('Error fetching funnel:', e);
      set({ error: msg });
      return null;
    }
  },

  fetchPlanFact: async (period = 'month', startDate?: string, endDate?: string) => {
    try {
      let url = `/territory/planfact?period=${period}`;
      if (startDate && endDate) {
        url = `/territory/planfact?start_date=${startDate}&end_date=${endDate}`;
      }
      const res = await apiClient.get(url);
      set({ error: null });
      return res.data;
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Ошибка загрузки план-факта';
      console.error('Error fetching planfact:', e);
      set({ error: msg });
      return null;
    }
  },

  fetchBenchmarks: async (period?: string, startDate?: string, endDate?: string) => {
    try {
      let url = `/territory/benchmarks?period=${period || 'month'}`;
      if (period === 'custom' && startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
      }
      const res = await apiClient.get(url);
      set({ error: null });
      return res.data;
    } catch (e: any) {
      const msg = e?.response?.data?.error || e?.message || 'Ошибка загрузки бенчмарков';
      console.error('Error fetching benchmarks:', e);
      set({ error: msg });
      return null;
    }
  },
}));