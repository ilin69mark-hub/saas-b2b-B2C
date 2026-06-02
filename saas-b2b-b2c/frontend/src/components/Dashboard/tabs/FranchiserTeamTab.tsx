import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Row, Col, Card, Table, Tag, Typography, Space, Button, InputNumber, Select, Collapse, Statistic, Progress, Divider, Modal, message, Form, Input, Segmented } from 'antd';
import {
  ArrowUpOutlined,
  ArrowDownOutlined,
  TeamOutlined,
  UserOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  EditOutlined,
  FilePdfOutlined,
  SaveOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import dynamic from 'next/dynamic';
import dayjs from 'dayjs';
import { useCreateEmployeeMutation, useGetFranchiserTeamQuery, useGetFranchiserDealersQuery } from '@/services/userApi';

const { Title, Text } = Typography;
const { Option } = Select;
const { Panel } = Collapse;

const ManagerKpiChart = dynamic(() => import('./ManagerKpiChart'), { ssr: false });
const ManagerPlanFactChart = dynamic(() => import('./ManagerPlanFactChart'), { ssr: false });

interface Manager {
  id: string;
  name: string;
  territory: string;
  planPercent: number;
  redDealersPercent: number;
  sla: number;
  dealerGrowth: number;
  churnRate: number;
  forecastPercent: number;
  integralKpi: number;
  bonusForecast: number;
  kpiHistory?: { month: string; kpi: number }[];
  dealers?: { name: string; planPercent: number; status: 'green' | 'yellow' | 'red' }[];
  planFactData?: { month: string; plan: number; fact: number }[];
}

interface ManagerPlans {
  [managerId: string]: {
    salesPlan: number;
    targetDealers: number;
    targetRedDealers: number;
    targetSla: number;
  };
}

const ManagerDetailPanel: React.FC<{ managerId: string; manager: Manager }> = ({ managerId, manager }) => {
  const [kpiData, setKpiData] = useState<{ month: string; kpi: number }[]>([]);
  const [planFactData, setPlanFactData] = useState<{ month: string; plan: number; fact: number }[]>([]);
  const [dealers, setDealers] = useState<{ name: string; planPercent: number; status: string }[]>([]);

  useEffect(() => {
    if (!managerId.includes('-')) return;
    const token = localStorage.getItem('accessToken');
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

    fetch(`${baseUrl}/api/v1/franchiser/team/${managerId}/dynamics?months=6`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(data => {
      if (data?.kpi) {
        setKpiData(data.kpi.map((k: any) => ({ month: k.month, kpi: k.kpi })));
        setPlanFactData(data.kpi
          .filter((k: any) => k.plan != null && k.fact != null)
          .map((k: any) => ({ month: k.month, plan: k.plan, fact: k.fact })));
      }
    }).catch(() => {});

    fetch(`${baseUrl}/api/v1/franchiser/team/${managerId}/dealers`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json()).then(data => {
      if (data?.dealers) {
        setDealers(data.dealers.map((d: any) => ({
          name: d.name,
          planPercent: d.percent,
          status: d.status as string,
        })));
      }
    }).catch(() => {});
  }, [managerId]);

  const displayKpi = kpiData.length > 0 ? kpiData : (manager.kpiHistory || []);
  const displayPlanFact = planFactData.length > 0 ? planFactData : (manager.planFactData || []);
  const displayDealers = dealers.length > 0 ? dealers : (manager.dealers || []).map(d => ({
    name: d.name,
    planPercent: d.planPercent,
    status: d.status,
  }));

  return (
    <Card style={{ marginTop: 16, marginLeft: 48, background: '#fafafa' }}>
      <Row gutter={24}>
        <Col span={12}>
          <Card title="KPI за 6 месяцев" size="small">
            <ManagerKpiChart data={displayKpi} />
          </Card>
        </Col>
        <Col span={12}>
          <Card title="План vs Факт" size="small">
            <ManagerPlanFactChart data={displayPlanFact} />
          </Card>
        </Col>
      </Row>
      <Divider />
      <Card title="Дилеры менеджера" size="small">
        <Table
          dataSource={displayDealers}
          columns={[
            { title: 'Дилер', dataIndex: 'name', key: 'name' },
            { title: '% плана', dataIndex: 'planPercent', key: 'planPercent', render: (v: number) => `${v}%` },
            { title: 'Статус', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s}>{s}</Tag> },
          ]}
          rowKey="name"
          pagination={false}
          size="small"
        />
      </Card>
      <Button type="link" icon={<FilePdfOutlined />} onClick={() => handleDownloadPdf(managerId)}>Детальный отчёт (PDF)</Button>
    </Card>
  );
};

const FranchiserTeamTab: React.FC = () => {
  const [selectedManager, setSelectedManager] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [plansModalOpen, setPlansModalOpen] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(dayjs().format('YYYY-MM'));
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansSaving, setPlansSaving] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [createEmployee, { isLoading: isCreating }] = useCreateEmployeeMutation();
  const { data: teamData } = useGetFranchiserTeamQuery();
  const [viewMode, setViewMode] = useState('managers');
  const { data: dealersData, isLoading: dealersLoading } = useGetFranchiserDealersQuery(undefined, {
    skip: viewMode !== 'dealers',
  });
  const dealers = useMemo(() => dealersData?.dealers || [], [dealersData]);

  const managers: Manager[] = useMemo(() => {
    return (teamData?.team_members || []).map((m) => ({
      id: m.id,
      name: m.name,
      territory: m.territory || '—',
      planPercent: m.plan_percent,
      redDealersPercent: m.red_dealers_pct,
      sla: m.sla,
      dealerGrowth: m.dealer_growth,
      churnRate: m.churn_rate,
      forecastPercent: m.forecast_percent,
      integralKpi: m.integral_kpi,
      bonusForecast: m.bonus_forecast,
    }));
  }, [teamData]);

  const [plans, setPlans] = useState<ManagerPlans>({});

  useEffect(() => {
    setPlans(prev => {
      const updated = { ...prev };
      managers.forEach(m => {
        if (!updated[m.id]) {
          updated[m.id] = {
            salesPlan: 5000000,
            targetDealers: 10,
            targetRedDealers: 10,
            targetSla: 95,
          };
        }
      });
      return updated;
    });
  }, [managers]);

  const getRowColor = (kpi: number) => {
    if (kpi >= 90) return '#f6ffed';
    if (kpi >= 75) return '#fffbe6';
    return '#fff1f0';
  };

  const columns = [
    {
      title: 'Менеджер',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Space>
          <TeamOutlined />
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: 'Территория',
      dataIndex: 'territory',
      key: 'territory',
      align: 'center',
    },
    {
      title: '% плана',
      dataIndex: 'planPercent',
      key: 'planPercent',
      align: 'center',
      sorter: (a: Manager, b: Manager) => a.planPercent - b.planPercent,
      render: (v: number) => (
        <Progress percent={v} size="small" strokeColor={v >= 95 ? '#52c41a' : v >= 85 ? '#fa8c16' : '#ff4d4f'} />
      ),
    },
    {
      title: 'В красной зоне',
      dataIndex: 'redDealersPercent',
      key: 'redDealersPercent',
      align: 'center',
      sorter: (a: Manager, b: Manager) => a.redDealersPercent - b.redDealersPercent,
      render: (v: number) => (
        <Tag color={v < 10 ? 'green' : v < 25 ? 'orange' : 'red'}>
          {v}%
        </Tag>
      ),
    },
    {
      title: 'SLA',
      dataIndex: 'sla',
      key: 'sla',
      align: 'center',
      sorter: (a: Manager, b: Manager) => a.sla - b.sla,
      render: (v: number) => (
        <Tag color={v >= 95 ? 'green' : v >= 80 ? 'orange' : 'red'}>
          {v}%
        </Tag>
      ),
    },
    {
      title: 'Прирост',
      dataIndex: 'dealerGrowth',
      key: 'dealerGrowth',
      align: 'center',
      sorter: (a: Manager, b: Manager) => a.dealerGrowth - b.dealerGrowth,
      render: (v: number) => (
        <Text type={v > 0 ? 'success' : v < 0 ? 'danger' : 'secondary'}>
          {v > 0 ? <><ArrowUpOutlined /> {v}</> : v < 0 ? <><ArrowDownOutlined /> {Math.abs(v)}</> : '-'}
        </Text>
      ),
    },
    {
      title: 'Отток',
      dataIndex: 'churnRate',
      key: 'churnRate',
      align: 'center',
      render: (v: number) => (
        <Tag color={v < 5 ? 'green' : v < 10 ? 'orange' : 'red'}>
          {v}%
        </Tag>
      ),
    },
    {
      title: 'Прогноз',
      dataIndex: 'forecastPercent',
      key: 'forecastPercent',
      align: 'center',
      render: (v: number) => (
        <Tag color={v >= 95 ? 'green' : v >= 85 ? 'orange' : 'red'}>
          {v}%
        </Tag>
      ),
    },
    {
      title: 'KPI',
      dataIndex: 'integralKpi',
      key: 'integralKpi',
      align: 'center',
      sorter: (a: Manager, b: Manager) => a.integralKpi - b.integralKpi,
      render: (v: number) => (
        <Progress 
          percent={v} 
          size="small" 
          strokeColor={v >= 90 ? '#52c41a' : v >= 75 ? '#fa8c16' : '#ff4d4f'}
          format={(p) => `${p}%`}
        />
      ),
    },
    {
      title: 'Бонус',
      dataIndex: 'bonusForecast',
      key: 'bonusForecast',
      align: 'center',
      sorter: (a: Manager, b: Manager) => a.bonusForecast - b.bonusForecast,
      render: (v: number) => (
        <Text strong type={v > 0 ? 'success' : 'secondary'}>
          {v.toLocaleString()} ₽
        </Text>
      ),
    },
  ];

  const dealerColumns = [
    {
      title: 'Дилер',
      dataIndex: 'name',
      key: 'name',
      render: (name: string) => (
        <Space>
          <UserOutlined />
          <Text strong>{name}</Text>
        </Space>
      ),
    },
    {
      title: 'Email',
      dataIndex: 'email',
      key: 'email',
    },
    {
      title: 'Менеджер',
      dataIndex: 'manager_name',
      key: 'manager_name',
      render: (v: string) => v || '—',
    },
    {
      title: 'План, ₽',
      dataIndex: 'plan',
      key: 'plan',
      align: 'center' as const,
      render: (v: number) => v ? Math.round(v).toLocaleString('ru-RU') : '—',
    },
    {
      title: 'Факт, ₽',
      dataIndex: 'fact',
      key: 'fact',
      align: 'center' as const,
      render: (v: number) => v ? Math.round(v).toLocaleString('ru-RU') : '—',
    },
    {
      title: 'Выполнение',
      dataIndex: 'plan_percent',
      key: 'plan_percent',
      align: 'center' as const,
      render: (v: number) => (
        <Progress percent={v} size="small" strokeColor={v >= 80 ? '#52c41a' : v >= 50 ? '#fa8c16' : '#ff4d4f'} />
      ),
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      align: 'center' as const,
      render: (s: string) => {
        const colors: Record<string, string> = { green: '#52c41a', yellow: '#faad14', red: '#ff4d4f' };
        const labels: Record<string, string> = { green: 'Хорошо', yellow: 'Средне', red: 'Плохо' };
        return <Tag color={colors[s] || 'default'}>{labels[s] || s}</Tag>;
      },
    },
  ];

  const handlePlanChange = (managerId: string, field: keyof ManagerPlans[string], value: number) => {
    setPlans(prev => ({
      ...prev,
      [managerId]: { ...prev[managerId], [field]: value }
    }));
  };

  const loadPlans = useCallback(async (month: string) => {
    setPlansLoading(true);
    const token = localStorage.getItem('accessToken');
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    try {
      const res = await fetch(`${baseUrl}/api/v1/franchiser/team/plans?month=${month}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
      setPlans(prev => {
        const updated = { ...prev };
        (data as any[]).forEach((p: any) => {
          updated[p.manager_id] = {
            salesPlan: p.sales_plan || 0,
            targetDealers: p.target_dealers || 0,
            targetRedDealers: p.target_red_dealers || 0,
            targetSla: p.target_sla || 0,
          };
        });
        return updated;
      });
    } catch { /* ignore */ }
    setPlansLoading(false);
  }, []);

  useEffect(() => {
    loadPlans(selectedMonth);
  }, [selectedMonth, loadPlans]);

  const handleSavePlans = async () => {
    setPlansSaving(true);
    const token = localStorage.getItem('accessToken');
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    try {
      const plansArray = Object.entries(plans).map(([managerId, p]) => ({
        manager_id: managerId,
        plan_amount: p.salesPlan,
        target_dealers: p.targetDealers,
        target_red_dealers: p.targetRedDealers,
        target_sla: p.targetSla,
      }));
      const res = await fetch(`${baseUrl}/api/v1/franchiser/team/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ month: selectedMonth, plans: plansArray }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        message.error(err?.error || 'Ошибка при сохранении');
        return;
      }
      message.success('Планы сохранены');
      setPlansModalOpen(false);
    } catch {
      message.error('Сервер недоступен');
    }
    setPlansSaving(false);
  };

  const handleAddManager = async (values: { email: string; password: string; first_name: string; last_name?: string; phone?: string }) => {
    try {
      await createEmployee({
        email: values.email,
        password: values.password,
        first_name: values.first_name,
        last_name: values.last_name,
        phone: values.phone ? `+7${values.phone.replace(/[^\d]/g, '')}` : undefined,
        role: 'franchiser_manager',
      }).unwrap();
      message.success('Менеджер успешно зарегистрирован');
      setAddModalOpen(false);
      addForm.resetFields();
    } catch (err: unknown) {
      const error = err as { status?: number | string; data?: { error?: string }; error?: string };
      if (error?.status === 'FETCH_ERROR') {
        message.error('Сервер недоступен. Убедитесь, что бэкенд запущен.');
      } else if (error?.status === 401) {
        message.error('Сессия истекла. Пожалуйста, перезайдите в систему.');
      } else {
        message.error(error?.data?.error || 'Ошибка при регистрации менеджера');
      }
    }
  };

  const monthOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    const now = dayjs();
    for (let i = -3; i <= 9; i++) {
      const m = now.add(i, 'month');
      options.push({
        value: m.format('YYYY-MM'),
        label: m.format('MMMM YYYY'),
      });
    }
    return options;
  }, []);

  const renderDetailPanel = (managerId: string) => {
    const manager = managers.find(m => m.id === managerId);
    if (!manager) return null;
    return <ManagerDetailPanel managerId={managerId} manager={manager} />;
  };

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>Моя команда</Title>
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v as 'managers' | 'dealers')}
          options={[
            { label: <><TeamOutlined /> Менеджеры</>, value: 'managers' },
            { label: <><UserOutlined /> Дилеры</>, value: 'dealers' },
          ]}
        />
      </Row>

      {viewMode === 'managers' ? (
        <>
          <Space style={{ marginBottom: 16 }}>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddModalOpen(true)}>
              Добавить менеджера
            </Button>
            <Button icon={<EditOutlined />} onClick={() => setPlansModalOpen(true)}>
              Назначить планы
            </Button>
            <Text type="secondary">Месяц: {dayjs(selectedMonth + '-01').format('MMMM YYYY')}</Text>
          </Space>

          <Card>
            <Table
              dataSource={managers}
              columns={columns}
              rowKey="id"
              expandable={{
                expandedRowRender: (record) => renderDetailPanel(record.id),
                rowExpandable: (record) => record.id !== undefined,
              }}
              pagination={false}
              rowStyle={(record) => ({
                background: getRowColor(record.integralKpi),
              })}
              onRow={(record) => ({
                onClick: () => setSelectedManager(record.id),
                style: { cursor: 'pointer' },
              })}
            />
          </Card>
        </>
      ) : (
        <Card>
          <Table
            dataSource={dealers}
            columns={dealerColumns}
            rowKey="id"
            pagination={false}
            loading={dealersLoading}
          />
        </Card>
      )}

      <Modal
        title="Назначение планов менеджерам"
        open={plansModalOpen}
        onCancel={() => setPlansModalOpen(false)}
        footer={null}
        width={800}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Select value={selectedMonth} onChange={setSelectedMonth} style={{ width: 200 }}>
            {monthOptions.map(m => (
              <Option key={m.value} value={m.value}>{m.label}</Option>
            ))}
          </Select>

          <Table
            dataSource={managers}
            loading={plansLoading}
            columns={[
              { title: 'Менеджер', dataIndex: 'name', key: 'name' },
              { title: 'Территория', dataIndex: 'territory', key: 'territory' },
              { 
                title: 'План продаж', 
                key: 'salesPlan',
                render: (_: any, r: Manager) => (
                  <InputNumber 
                    value={plans[r.id]?.salesPlan} 
                    onChange={(v) => handlePlanChange(r.id, 'salesPlan', v || 0)}
                    formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
                    parser={(v) => parseInt(v?.replace(/ /g, '') || '0')}
                    style={{ width: 120 }}
                  />
                )
              },
              { 
                title: 'Цель дилеров', 
                key: 'targetDealers',
                render: (_: any, r: Manager) => (
                  <InputNumber 
                    value={plans[r.id]?.targetDealers}
                    onChange={(v) => handlePlanChange(r.id, 'targetDealers', v || 0)}
                    min={0}
                    style={{ width: 80 }}
                  />
                )
              },
              { 
                title: 'Макс красных %', 
                key: 'targetRedDealers',
                render: (_: any, r: Manager) => (
                  <InputNumber 
                    value={plans[r.id]?.targetRedDealers}
                    onChange={(v) => handlePlanChange(r.id, 'targetRedDealers', v || 0)}
                    min={0}
                    max={100}
                    formatter={(v) => `${v}%`}
                    parser={(v) => parseInt(v?.replace('%', '') || '0')}
                    style={{ width: 80 }}
                  />
                )
              },
              { 
                title: 'Цель SLA', 
                key: 'targetSla',
                render: (_: any, r: Manager) => (
                  <InputNumber 
                    value={plans[r.id]?.targetSla}
                    onChange={(v) => handlePlanChange(r.id, 'targetSla', v || 0)}
                    min={0}
                    max={100}
                    formatter={(v) => `${v}%`}
                    parser={(v) => parseInt(v?.replace('%', '') || '0')}
                    style={{ width: 80 }}
                  />
                )
              },
            ]}
            rowKey="id"
            pagination={false}
            size="small"
          />

          <Space>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSavePlans} loading={plansSaving}>Сохранить планы</Button>
          </Space>
        </Space>
      </Modal>

      <Modal
        title="Зарегистрировать нового менеджера"
        open={addModalOpen}
        onCancel={() => { setAddModalOpen(false); addForm.resetFields(); }}
        footer={null}
        width={500}
      >
        <Form form={addForm} layout="vertical" onFinish={handleAddManager}>
          <Form.Item
            name="email"
            label="Email"
            rules={[
              { required: true, message: 'Введите email' },
              { type: 'email', message: 'Некорректный email' },
            ]}
          >
            <Input placeholder="manager@example.com" />
          </Form.Item>

          <Form.Item
            name="password"
            label="Пароль"
            rules={[
              { required: true, message: 'Введите пароль' },
              { min: 6, message: 'Минимум 6 символов' },
            ]}
          >
            <Input.Password placeholder="Минимум 6 символов" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="first_name"
                label="Имя"
                rules={[{ required: true, message: 'Введите имя' }]}
              >
                <Input placeholder="Иван" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="last_name" label="Фамилия">
                <Input placeholder="Петров" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item name="phone" label="Телефон">
            <Input
              addonBefore="+7"
              placeholder="(999) 123-45-67"
              maxLength={15}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^\d()\-\s]/g, '');
                const digits = cleaned.replace(/\D/g, '').slice(0, 10);
                let formatted = '';
                if (digits.length > 0) formatted += `(${digits.slice(0, 3)}`;
                if (digits.length > 3) formatted += `) ${digits.slice(3, 6)}`;
                if (digits.length > 6) formatted += `-${digits.slice(6, 8)}`;
                if (digits.length > 8) formatted += `-${digits.slice(8, 10)}`;
                if (formatted !== cleaned) {
                  addForm.setFieldsValue({ phone: formatted });
                }
              }}
            />
          </Form.Item>

          <Space>
            <Button type="primary" htmlType="submit" loading={isCreating} icon={<PlusOutlined />}>
              Зарегистрировать
            </Button>
            <Button onClick={() => { setAddModalOpen(false); addForm.resetFields(); }}>
              Отмена
            </Button>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default FranchiserTeamTab;