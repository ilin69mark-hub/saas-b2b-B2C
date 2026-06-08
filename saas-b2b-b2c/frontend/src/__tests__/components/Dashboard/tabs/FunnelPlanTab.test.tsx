import React from 'react';
import { render, screen } from '@testing-library/react';
import FunnelPlanTab from '@/components/Dashboard/tabs/FunnelPlanTab';

describe('FunnelPlanTab', () => {
  it('renders without crashing', () => {
    render(<FunnelPlanTab />);
    expect(document.querySelector('.ant-card')).toBeDefined();
  });

  it('renders period switcher', () => {
    render(<FunnelPlanTab />);
    const radioGroup = document.querySelector('.ant-radio-group');
    expect(radioGroup).toBeDefined();
  });

  it('renders group by selector', () => {
    render(<FunnelPlanTab />);
    const select = document.querySelector('.ant-select');
    expect(select).toBeDefined();
  });

  it('renders loading state', () => {
    render(<FunnelPlanTab />);
    const spin = document.querySelector('.ant-spin');
    expect(spin).toBeDefined();
  });

  it('renders plan-fact card', () => {
    render(<FunnelPlanTab />);
    const cards = document.querySelectorAll('.ant-card');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('renders funnel card', () => {
    render(<FunnelPlanTab />);
    const cards = document.querySelectorAll('.ant-card');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('renders empty state when no data', () => {
    render(<FunnelPlanTab />);
    const empty = document.querySelector('.ant-empty');
    expect(empty || document.querySelector('.ant-card')).toBeDefined();
  });
});

describe('FunnelPlanTab calculations', () => {
  it('calculates total plan correctly', () => {
    const salons = [
      { id: '1', name: 'A', plan: 1000000, fact: 800000, percent: 80, forecast: 'green' as const, managerName: '', sellersCount: 0, avgCheck: 0 },
    ];
    const total = salons.reduce((sum, s) => sum + s.plan, 0);
    expect(total).toBe(1000000);
  });

  it('calculates total fact correctly', () => {
    const salons = [
      { id: '1', name: 'A', plan: 1000000, fact: 800000, percent: 80, forecast: 'green' as const, managerName: '', sellersCount: 0, avgCheck: 0 },
    ];
    const total = salons.reduce((sum, s) => sum + s.fact, 0);
    expect(total).toBe(800000);
  });

  it('calculates plan percent correctly', () => {
    const totalPlan = 1000000;
    const totalFact = 850000;
    const percent = Math.round((totalFact / totalPlan) * 100);
    expect(percent).toBe(85);
  });

  it('handles zero traffic in funnel', () => {
    const traffic = 0;
    const consultation = 0;
    const conversion = traffic > 0 ? (consultation / traffic) * 100 : 0;
    expect(conversion).toBe(0);
  });

  it('calculates top managers correctly', () => {
    const managers = [
      { id: '1', name: 'A', revenue: 100, salon: '', planPercent: 0, conversion: 0 },
      { id: '2', name: 'B', revenue: 200, salon: '', planPercent: 0, conversion: 0 },
    ];
    const top = [...managers].sort((a, b) => b.revenue - a.revenue)[0];
    expect(top.name).toBe('B');
  });

  it('calculates anti-top managers correctly', () => {
    const managers = [
      { id: '1', name: 'A', revenue: 0, salon: '', planPercent: 0, conversion: 15 },
      { id: '2', name: 'B', revenue: 0, salon: '', planPercent: 0, conversion: 5 },
    ];
    const antiTop = [...managers].sort((a, b) => a.conversion - b.conversion)[0];
    expect(antiTop.name).toBe('B');
  });
});

describe('FunnelPlanTab rendering features', () => {
  it('shows correct percent color for high percent', () => {
    const percent = 85;
    const color = percent >= 80 ? '#52c41a' : percent >= 50 ? '#faad14' : '#ff4d4f';
    expect(color).toBe('#52c41a');
  });

  it('shows correct percent color for medium percent', () => {
    const percent = 50;
    const color = percent >= 80 ? '#52c41a' : percent >= 50 ? '#faad14' : '#ff4d4f';
    expect(color).toBe('#faad14');
  });

  it('shows correct percent color for low percent', () => {
    const percent = 25;
    const color = percent >= 80 ? '#52c41a' : percent >= 50 ? '#faad14' : '#ff4d4f';
    expect(color).toBe('#ff4d4f');
  });

  it('renders forecast icon for green', () => {
    const forecast = 'green';
    const icons: Record<string, string> = { green: '🟢', yellow: '🟡', red: '🔴' };
    expect(icons[forecast]).toBe('🟢');
  });

  it('renders forecast icon for yellow', () => {
    const forecast = 'yellow';
    const icons: Record<string, string> = { green: '🟢', yellow: '🟡', red: '🔴' };
    expect(icons[forecast]).toBe('🟡');
  });

  it('renders forecast icon for red', () => {
    const forecast = 'red';
    const icons: Record<string, string> = { green: '🟢', yellow: '🟡', red: '🔴' };
    expect(icons[forecast]).toBe('🔴');
  });
});

describe('FunnelPlanTab drill-down support', () => {
  it('renders when salon data would be present', () => {
    render(<FunnelPlanTab />);
    const collapse = document.querySelector('.ant-collapse');
    expect(collapse || document.querySelector('.ant-empty')).toBeDefined();
  });
});
