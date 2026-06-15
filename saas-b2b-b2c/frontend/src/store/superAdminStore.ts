import { create } from 'zustand';
import apiClient from '@/api/axiosClient';

interface SuperAdminStats {
  mrr: number;
  arr: number;
  churnRate: number;
  overduePayments: number;
  arpu: number;
  activeTenants: number;
  newThisMonth: number;
  churnedThisMonth: number;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended' | 'deleted';
  plan: string;
  mrr: number;
  createdAt: string;
}

interface SuperAdminState {
  activeSection: string;
  stats: SuperAdminStats;
  tenants: Tenant[];
  isLoading: boolean;
  alertCount: number;
  lastUpdated: Date | null;
  pagination: { page: number; limit: number; total: number };
  setActiveSection: (section: string) => void;
  setStats: (stats: SuperAdminStats) => void;
  setTenants: (tenants: Tenant[]) => void;
  setLoading: (loading: boolean) => void;
  setAlertCount: (count: number) => void;
  setLastUpdated: (date: Date) => void;
  setPagination: (page: number, limit: number, total: number) => void;
  fetchStats: () => Promise<void>;
  fetchAllTenants: (page?: number, limit?: number) => Promise<void>;
  suspendTenant: (tenantId: string) => Promise<void>;
  deleteTenant: (tenantId: string) => Promise<void>;
}

export const useSuperAdminStore = create<SuperAdminState>((set, get) => ({
  activeSection: 'metrics',
  stats: {
    mrr: 0,
    arr: 0,
    churnRate: 0,
    overduePayments: 0,
    arpu: 0,
    activeTenants: 0,
    newThisMonth: 0,
    churnedThisMonth: 0,
  },
  tenants: [],
  isLoading: false,
  alertCount: 0,
  lastUpdated: null,
  pagination: { page: 1, limit: 20, total: 0 },

  setActiveSection: (section) => set({ activeSection: section }),
  setStats: (stats) => set({ stats }),
  setTenants: (tenants) => set({ tenants }),
  setLoading: (loading) => set({ isLoading: loading }),
  setAlertCount: (count) => set({ alertCount: count }),
  setLastUpdated: (date) => set({ lastUpdated: date }),
  setPagination: (page, limit, total) => set({ pagination: { page, limit, total } }),

  fetchStats: async () => {
    const { setLoading, setStats, setLastUpdated } = get();
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/stats');
      const data = res.data as Record<string, unknown>;
      setStats({
        mrr: Number(data.mrr) || 0,
        arr: Number(data.arr) || 0,
        churnRate: Number(data.churnRate) || 0,
        overduePayments: Number(data.overduePayments) || 0,
        arpu: Number(data.arpu) || 0,
        activeTenants: Number(data.active_tenants) || 0,
        newThisMonth: Number(data.new_this_month) || 0,
        churnedThisMonth: Number(data.churned_tenants) || 0,
      });
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Error fetching stats:', e);
      setStats({ mrr: 0, arr: 0, churnRate: 0, overduePayments: 0, arpu: 0, activeTenants: 0, newThisMonth: 0, churnedThisMonth: 0 });
    } finally {
      setLoading(false);
    }
  },

  fetchAllTenants: async (page = 1, limit = 20) => {
    const { setLoading, setTenants, setPagination } = get();
    setLoading(true);
    try {
      const res = await apiClient.get('/admin/tenants', { params: { page, limit } });
      const data = res.data as { tenants: Tenant[]; total: number };
      setTenants(data.tenants || []);
      setPagination(page, limit, data.total || 0);
    } catch (e) {
      console.error('Error fetching tenants:', e);
      setTenants([]);
    } finally {
      setLoading(false);
    }
  },

  suspendTenant: async (tenantId: string) => {
    const { setTenants, tenants } = get();
    try {
      await apiClient.post(`/admin/tenants/${tenantId}/block`);
      setTenants(tenants.map(t => t.id === tenantId ? { ...t, status: 'suspended' as const } : t));
    } catch (e) {
      console.error('Error suspending tenant:', e);
      throw e;
    }
  },

  deleteTenant: async (tenantId: string) => {
    const { setTenants, tenants } = get();
    try {
      await apiClient.delete(`/admin/tenants/${tenantId}`);
      setTenants(tenants.filter(t => t.id !== tenantId));
    } catch (e) {
      console.error('Error deleting tenant:', e);
      throw e;
    }
  },
}));