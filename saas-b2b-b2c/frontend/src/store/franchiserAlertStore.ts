import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AlertType = 'plan' | 'dealer' | 'manager' | 'escalation';
export type AlertSeverity = 'critical' | 'warning';
export type AlertStatus = 'new' | 'acknowledged' | 'resolved';

export interface FranchiserAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  metric?: number;
  target?: string;
  createdAt: string;
  status: AlertStatus;
  assignedTo?: string;
  resolvedAt?: string;
}

export interface FranchiserAlertSettings {
  enabled: boolean;
  channel: {
    inApp: boolean;
    email: boolean;
    push: boolean;
  };
  thresholds: {
    criticalForecastPercent: number;
    dealerChurnPercent: number;
    managerKpiPercent: number;
  };
}

interface FranchiserAlertState {
  alerts: FranchiserAlert[];
  settings: FranchiserAlertSettings;
  isOpen: boolean;
  filter: 'all' | 'critical' | AlertType;
  
  setAlerts: (alerts: FranchiserAlert[]) => void;
  addAlert: (alert: FranchiserAlert) => void;
  markAsRead: (alertId: string) => void;
  markAllAsRead: () => void;
  assignAlert: (alertId: string, managerId: string) => void;
  resolveAlert: (alertId: string) => void;
  setOpen: (open: boolean) => void;
  setFilter: (filter: 'all' | 'critical' | AlertType) => void;
  setSettings: (settings: Partial<FranchiserAlertSettings>) => void;
  getUnreadCount: () => number;
  getCriticalCount: () => number;
}

const defaultSettings: FranchiserAlertSettings = {
  enabled: true,
  channel: {
    inApp: true,
    email: false,
    push: false,
  },
  thresholds: {
    criticalForecastPercent: 90,
    dealerChurnPercent: 5,
    managerKpiPercent: 70,
  },
};

export const useFranchiserAlertStore = create<FranchiserAlertState>()(
  persist(
    (set, get) => ({
      alerts: [],
      settings: defaultSettings,
      isOpen: false,
      filter: 'all',

      setAlerts: (alerts) => set({ alerts }),
      
      addAlert: (alert) => set((state) => ({
        alerts: [alert, ...state.alerts],
      })),

      markAsRead: (alertId) => set((state) => ({
        alerts: state.alerts.map(a => 
          a.id === alertId ? { ...a, status: 'acknowledged' as AlertStatus } : a
        ),
      })),

      markAllAsRead: () => set((state) => ({
        alerts: state.alerts.map(a => ({ ...a, status: 'acknowledged' as AlertStatus })),
      })),

      assignAlert: (alertId, managerId) => set((state) => ({
        alerts: state.alerts.map(a => 
          a.id === alertId ? { ...a, assignedTo: managerId, status: 'acknowledged' as AlertStatus } : a
        ),
      })),

      resolveAlert: (alertId) => set((state) => ({
        alerts: state.alerts.map(a => 
          a.id === alertId ? { ...a, status: 'resolved' as AlertStatus, resolvedAt: new Date().toISOString() } : a
        ),
      })),

      setOpen: (isOpen) => set({ isOpen }),
      
      setFilter: (filter) => set({ filter }),

      setSettings: (newSettings) => set((state) => ({
        settings: { ...state.settings, ...newSettings },
      })),

      getUnreadCount: () => {
        const { alerts } = get();
        return alerts.filter(a => a.status === 'new').length;
      },

      getCriticalCount: () => {
        const { alerts } = get();
        return alerts.filter(a => a.severity === 'critical' && a.status !== 'resolved').length;
      },
    }),
    {
      name: 'franchiser-alert-storage',
      partialize: (state) => ({ alerts: state.alerts, settings: state.settings }),
    }
  )
);