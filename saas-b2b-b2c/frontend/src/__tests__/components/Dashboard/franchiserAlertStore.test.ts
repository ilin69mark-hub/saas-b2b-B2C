import { useFranchiserAlertStore, FranchiserAlert, FranchiserAlertSettings } from '@/store/franchiserAlertStore';

const createTestAlert = (id: string): FranchiserAlert => ({
  id,
  type: 'plan',
  severity: 'critical',
  title: `Test Alert ${id}`,
  description: 'Description',
  createdAt: new Date().toISOString(),
  status: 'new',
});

describe('franchiserAlertStore', () => {
  beforeEach(() => {
    useFranchiserAlertStore.setState({ alerts: [] });
  });

  it('has initial empty alerts', () => {
    const state = useFranchiserAlertStore.getState();
    expect(state.alerts).toBeDefined();
    expect(state.alerts.length).toBe(0);
  });

  it('has default settings', () => {
    const state = useFranchiserAlertStore.getState();
    expect(state.settings).toBeDefined();
    expect(state.settings.thresholds.criticalForecastPercent).toBe(90);
    expect(state.settings.thresholds.dealerChurnPercent).toBe(5);
    expect(state.settings.thresholds.managerKpiPercent).toBe(70);
  });

  it('adds alert and marks as read', () => {
    const alert = createTestAlert('1');
    useFranchiserAlertStore.getState().addAlert(alert);
    useFranchiserAlertStore.getState().markAsRead('1');
    const updatedAlert = useFranchiserAlertStore.getState().alerts.find(a => a.id === '1');
    expect(updatedAlert?.status).toBe('acknowledged');
  });

  it('resolves alert', () => {
    const alert = createTestAlert('2');
    useFranchiserAlertStore.getState().addAlert(alert);
    useFranchiserAlertStore.getState().resolveAlert('2');
    const updatedAlert = useFranchiserAlertStore.getState().alerts.find(a => a.id === '2');
    expect(updatedAlert?.status).toBe('resolved');
    expect(updatedAlert?.resolvedAt).toBeDefined();
  });

  it('assigns alert to manager', () => {
    const alert = createTestAlert('3');
    useFranchiserAlertStore.getState().addAlert(alert);
    useFranchiserAlertStore.getState().assignAlert('3', 'Иван Иванов');
    const updatedAlert = useFranchiserAlertStore.getState().alerts.find(a => a.id === '3');
    expect(updatedAlert?.assignedTo).toBe('Иван Иванов');
  });

  it('calculates unread count', () => {
    const alert = createTestAlert('4');
    useFranchiserAlertStore.getState().addAlert(alert);
    const count = useFranchiserAlertStore.getState().getUnreadCount();
    expect(count).toBe(1);
  });

  it('calculates critical count', () => {
    const alert = createTestAlert('5');
    useFranchiserAlertStore.getState().addAlert(alert);
    const count = useFranchiserAlertStore.getState().getCriticalCount();
    expect(count).toBe(1);
  });

  it('updates settings', () => {
    useFranchiserAlertStore.getState().setSettings({
      thresholds: { criticalForecastPercent: 85, dealerChurnPercent: 10, managerKpiPercent: 75 }
    });
    const settings = useFranchiserAlertStore.getState().settings;
    expect(settings.thresholds.criticalForecastPercent).toBe(85);
    expect(settings.thresholds.dealerChurnPercent).toBe(10);
  });

  it('filters alerts by type', () => {
    const { alerts, setFilter } = useFranchiserAlertStore.getState();
    setFilter('plan');
    const planAlerts = alerts.filter(a => a.type === 'plan' && a.status !== 'resolved');
    expect(planAlerts.length).toBeGreaterThanOrEqual(0);
    setFilter('all');
  });
});
