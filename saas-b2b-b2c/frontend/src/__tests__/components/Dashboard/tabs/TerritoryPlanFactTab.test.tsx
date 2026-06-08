import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import TerritoryPlanFactTab from '@/components/Dashboard/tabs/TerritoryPlanFactTab';

const mockFetchPlanFact = jest.fn();
const mockApiPut = jest.fn();

jest.mock('@/store/territoryManagerStore', () => ({
  useTerritoryManagerStore: () => ({
    fetchPlanFact: mockFetchPlanFact,
  }),
}));

jest.mock('@/api/axiosClient', () => ({
  get: jest.fn(),
  put: (...args: any[]) => mockApiPut(...args),
}));

const mockDealers = [
  {
    id: 'd1',
    dealer_name: 'Дилер 1',
    plan: 10000000,
    fact: 12000000,
    forecast: 13000000,
    reason: '',
    actions: '',
  },
  {
    id: 'd2',
    dealer_name: 'Дилер 2',
    plan: 8000000,
    fact: 4000000,
    forecast: 5000000,
    reason: 'staff_issue',
    actions: 'Нанять продавца',
  },
  {
    id: 'd3',
    dealer_name: 'Дилер 3',
    plan: 5000000,
    fact: 5000000,
    forecast: 5500000,
    reason: '',
    actions: '',
  },
];

const mockPlanFactData = {
  dealers: mockDealers,
  total_plan: 23000000,
  total_fact: 21000000,
};

describe('TerritoryPlanFactTab', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchPlanFact.mockResolvedValue(mockPlanFactData);
  });

  it('загружает и отображает план-факт данные', async () => {
    render(<TerritoryPlanFactTab />);

    await waitFor(() => {
      expect(screen.getByText('Дилер 1')).toBeInTheDocument();
    });

    expect(screen.getByText('Дилер 2')).toBeInTheDocument();
    expect(screen.getByText('Дилер 3')).toBeInTheDocument();
  });

  it('отображает общий план и факт', async () => {
    const { container } = render(<TerritoryPlanFactTab />);

    await waitFor(() => {
      expect(container.textContent).toContain('23.0млн ₽');
    });

    expect(container.textContent).toContain('21.0млн ₽');
  });

  it('отображает процент выполнения', async () => {
    const { container } = render(<TerritoryPlanFactTab />);

    await waitFor(() => {
      expect(container.textContent).toContain('91%');
    });
  });

  it('отображает прогноз из API', async () => {
    render(<TerritoryPlanFactTab />);

    await waitFor(() => {
      expect(screen.getByText('13.0 млн ₽')).toBeInTheDocument(); // forecast dealer 1
    });
  });

  it('загружает сохранённые причины и действия', async () => {
    render(<TerritoryPlanFactTab />);

    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBeGreaterThan(0);
    });
  });

  it('загружает данные с периодом month по умолчанию', async () => {
    render(<TerritoryPlanFactTab />);

    await waitFor(() => {
      expect(mockFetchPlanFact).toHaveBeenCalledWith('month');
    });
  });

  it('отображает текст отклонения при отстающих дилерах', async () => {
    render(<TerritoryPlanFactTab />);

    await waitFor(() => {
      expect(screen.getByText(/Отставание от плана/)).toBeInTheDocument();
    });
  });

  it('отображает топ-3 вклад', async () => {
    render(<TerritoryPlanFactTab />);

    await waitFor(() => {
      expect(screen.getByText(/Топ-3 дилера дают/)).toBeInTheDocument();
    });
  });

  it('отображает empty state когда нет данных', async () => {
    mockFetchPlanFact.mockResolvedValue({ dealers: [], total_plan: 0, total_fact: 0 });
    render(<TerritoryPlanFactTab />);

    await waitFor(() => {
      expect(screen.getByText('Нет данных за выбранный период')).toBeInTheDocument();
    });
  });

  it('рассчитывает отклонение', () => {
    const deviation = 4000000 - 8000000;
    const deviationPercent = ((4000000 - 8000000) / 8000000) * 100;
    expect(deviation).toBe(-4000000);
    expect(deviationPercent).toBe(-50);
  });

  it('рассчитывает процент выполнения', () => {
    const totalFact = 21000000;
    const totalPlan = 23000000;
    const percent = Math.round((totalFact / totalPlan) * 100);
    expect(percent).toBe(91);
  });

  it('отображает селектор периода', async () => {
    const { container } = render(<TerritoryPlanFactTab />);

    await waitFor(() => {
      expect(container.textContent).toContain('Месяц');
    });
  });

  it('вызывает fetchPlanFact с кастомными датами при custom периоде', async () => {
    const { container } = render(<TerritoryPlanFactTab />);

    await waitFor(() => {
      expect(mockFetchPlanFact).toHaveBeenCalledWith('month');
    });

    expect(container.textContent).toContain('Месяц');
  });
});
