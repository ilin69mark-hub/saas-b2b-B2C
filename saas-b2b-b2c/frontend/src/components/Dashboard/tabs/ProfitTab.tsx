import React, { useState, useMemo, useEffect } from 'react';
import { Card, Row, Col, Typography, Spin, Table, Button, Alert, Space, Tag, Empty, Collapse, DatePicker, Modal, Form, InputNumber } from 'antd';
import { WarningOutlined, ReloadOutlined, ArrowUpOutlined, ArrowDownOutlined, EditOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import UnitEconomyCalculator from './UnitEconomyCalculator';
import { useGetUnitTemplatesQuery, useCreateUnitTemplateMutation, useDeleteUnitTemplateMutation } from '@/services/api';
import apiClient from '@/api/axiosClient';

const { Text } = Typography;

interface ExpenseBreakdown {
  category: string;
  amount: number;
  percent_of_revenue: number;
  prev_month_amount: number;
}

interface FinanceData {
  revenue: number;
  cogs: number;
  rent: number;
  utilities: number;
  payroll: number;
  taxes: number;
  logistics: number;
  marketing: number;
  defects: number;
  other_expenses: number;
  bonus: number;
  net_profit: number;
  net_profit_forecast: number;
  prev_month_net_profit: number;
  expense_breakdown: ExpenseBreakdown[];
}

interface ProfitTabProps {
  selectedMonth: dayjs.Dayjs;
  onMonthChange: (d: dayjs.Dayjs) => void;
}

const ProfitTab: React.FC<ProfitTabProps> = ({ selectedMonth, onMonthChange }) => {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [expenseForm] = Form.useForm();
  const [savingExpenses, setSavingExpenses] = useState(false);
  const { data: templatesData, isLoading: templatesLoading } = useGetUnitTemplatesQuery();
  const [createUnitTemplate] = useCreateUnitTemplateMutation();
  const [deleteUnitTemplate] = useDeleteUnitTemplateMutation();

  const monthStr = selectedMonth.format('YYYY-MM');

  const fetchData = async (month?: string) => {
    setLoading(true);
    setError(false);
    try {
      const isCurrentMonth = dayjs().isSame(dayjs(month, 'YYYY-MM'), 'month');
      const params = month
        ? { date: isCurrentMonth ? dayjs().format('YYYY-MM-DD') : dayjs(month, 'YYYY-MM').endOf('month').format('YYYY-MM-DD') }
        : {};
      const { data: financeData } = await apiClient.get('/dealer/finance', { params });
      setData(financeData);
    } catch (e) {
      console.error('Failed to fetch finance data', e);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(monthStr);
  }, [monthStr]);

  const marginProfit = (data?.revenue || 0) - (data?.cogs || 0);

  const hasExpenses = useMemo(() => {
    if (!data) return false;
    return data.rent > 0 || data.utilities > 0 || data.payroll > 0 || 
           data.taxes > 0 || data.logistics > 0 || data.marketing > 0 || 
           data.defects > 0 || data.other_expenses > 0;
  }, [data]);

  const expenses = useMemo(() => {
    if (!data) return [];
    return [
      { name: 'Себестоимость', value: data.cogs },
      { name: 'Аренда', value: data.rent },
      { name: 'Коммуналка', value: data.utilities },
      { name: 'ФОТ', value: data.payroll },
      { name: 'Налоги', value: data.taxes },
      { name: 'Логистика', value: data.logistics },
      { name: 'Маркетинг', value: data.marketing },
      { name: 'Бонусы', value: data.bonus || 0 },
      { name: 'Брак', value: data.defects },
      { name: 'Прочее', value: data.other_expenses },
    ].filter(item => item.value > 0);
  }, [data]);

  const pieData = useMemo(() => {
    if (!data) return [];
    const total = data.cogs + data.rent + data.utilities + data.payroll + data.taxes + data.logistics + data.marketing + data.defects + data.other_expenses;
    if (total === 0) return [];
    return [
      { category: 'Себестоимость', amount: data.cogs, percent: (data.cogs / total) * 100 },
      { category: 'Аренда', amount: data.rent, percent: (data.rent / total) * 100 },
      { category: 'Коммуналка', amount: data.utilities, percent: (data.utilities / total) * 100 },
      { category: 'ФОТ', amount: data.payroll, percent: (data.payroll / total) * 100 },
      { category: 'Налоги', amount: data.taxes, percent: (data.taxes / total) * 100 },
      { category: 'Логистика', amount: data.logistics, percent: (data.logistics / total) * 100 },
      { category: 'Маркетинг', amount: data.marketing, percent: (data.marketing / total) * 100 },
      { category: 'Брак', amount: data.defects, percent: (data.defects / total) * 100 },
      { category: 'Прочее', amount: data.other_expenses, percent: (data.other_expenses / total) * 100 },
    ].filter(item => item.amount > 0);
  }, [data]);

  const isRentHigh = data ? (data.rent / data.revenue) * 100 > 12 : false;
  const isPayrollHigh = data ? (data.payroll / data.revenue) * 100 > 20 : false;
  const isLogisticsHigh = data ? (data.logistics / data.revenue) * 100 > 5 : false;
  const isMarketingHigh = data ? (data.marketing / data.revenue) * 100 > 15 : false;
  const isNetProfitNegative = data ? data.net_profit < 0 : false;

  const prevTotalExpenses = data?.expense_breakdown?.reduce((sum, e) => sum + e.prev_month_amount, 0) || 0;
  const currentTotalExpenses = data?.expense_breakdown?.reduce((sum, e) => sum + e.amount, 0) || 0;
  const isExpenseGrowthHigh = prevTotalExpenses > 0 && ((currentTotalExpenses - prevTotalExpenses) / prevTotalExpenses) * 100 > 20;

  const openExpenseModal = async () => {
    try {
      const { data: expenseData } = await apiClient.get('/dealer/expenses', { params: { month: monthStr } });
      expenseForm.setFieldsValue({
        rent: expenseData.rent || undefined,
        utilities: expenseData.utilities || undefined,
        payroll: expenseData.payroll || undefined,
        taxes: expenseData.taxes || undefined,
        logistics: expenseData.logistics || undefined,
        marketing: expenseData.marketing || undefined,
        defects: expenseData.defects || undefined,
        other_expenses: expenseData.other_expenses || undefined,
      });
    } catch {
      expenseForm.resetFields();
    }
    setExpenseModalOpen(true);
  };

  const handleSaveExpenses = async () => {
    try {
      const values = await expenseForm.validateFields();
      setSavingExpenses(true);
      await apiClient.post('/dealer/expenses', {
        month: monthStr,
        rent: values.rent || 0,
        utilities: values.utilities || 0,
        payroll: values.payroll || 0,
        taxes: values.taxes || 0,
        logistics: values.logistics || 0,
        marketing: values.marketing || 0,
        defects: values.defects || 0,
        other_expenses: values.other_expenses || 0,
      });
      setExpenseModalOpen(false);
      fetchData(monthStr);
    } catch (e) {
      console.error('Failed to save expenses', e);
    } finally {
      setSavingExpenses(false);
    }
  };

  const expenseColumns = [
    {
      title: 'Категория',
      dataIndex: 'category',
      key: 'category',
      align: 'center',
      render: (category: string) => {
        const categoryLabels: Record<string, string> = {
          cogs: 'Себестоимость', rent: 'Аренда', utilities: 'Коммуналка', payroll: 'ФОТ',
          taxes: 'Налоги', logistics: 'Логистика', marketing: 'Маркетинг',
          defects: 'Брак', other: 'Прочее',
        };
        const label = categoryLabels[category] || category;
        const colors: Record<string, string> = {
          'Себестоимость': 'magenta',
          'Аренда': 'blue',
          'Коммуналка': 'cyan',
          'ФОТ': 'purple',
          'Налоги': 'orange',
          'Логистика': 'geekblue',
          'Маркетинг': 'green',
          'Брак': 'red',
          'Прочее': 'gold',
        };
        return <Tag color={colors[label] || 'default'}>{label}</Tag>;
      },
    },
    {
      title: 'Сумма',
      dataIndex: 'amount',
      key: 'amount',
      align: 'center',
      render: (val: number) => <Text strong>{val.toLocaleString()} ₽</Text>,
    },
    {
      title: '% от выручки',
      dataIndex: 'percent_of_revenue',
      key: 'percent_of_revenue',
      align: 'center',
      render: (val: number) => <Text>{val.toFixed(1)}%</Text>,
    },
    {
      title: 'К прошлому месяцу',
      key: 'change',
      align: 'center',
      render: (_: any, record: ExpenseBreakdown) => {
        const change = record.prev_month_amount > 0 
          ? ((record.amount - record.prev_month_amount) / record.prev_month_amount) * 100 
          : 0;
        if (change === 0) return <Text type="secondary">-</Text>;
        return (
          <Space>
            {change > 0 ? <ArrowUpOutlined style={{ color: '#ff4d4f' }} /> : <ArrowDownOutlined style={{ color: '#52c41a' }} />}
            <Text type={change > 0 ? 'danger' : 'success'}>{Math.abs(change).toFixed(1)}%</Text>
          </Space>
        );
      },
    },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert
        message="Ошибка загрузки данных"
        description="Не удалось загрузить финансовые данные. Попробуйте повторить запрос."
        type="error"
        showIcon
        action={
          <Button icon={<ReloadOutlined />} onClick={() => fetchData(monthStr)}>
            Повторить
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <Row justify="space-between" align="middle" style={{ marginBottom: 16 }}>
        <Col>
          <Text strong style={{ fontSize: 16 }}>Финансовый анализ</Text>
        </Col>
        <Col>
          <Space>
            <DatePicker
              picker="month"
              value={selectedMonth}
              onChange={(d) => d && onMonthChange(d)}
              allowClear={false}
              format="MMMM YYYY"
            />
            <Button icon={<EditOutlined />} onClick={openExpenseModal}>
              Внести расходы
            </Button>
          </Space>
        </Col>
      </Row>

      <Modal
        title={`Расходы за ${selectedMonth.format('MMMM YYYY')}`}
        open={expenseModalOpen}
        onCancel={() => setExpenseModalOpen(false)}
        onOk={handleSaveExpenses}
        confirmLoading={savingExpenses}
        okText="Сохранить"
        cancelText="Отмена"
      >
        <Form form={expenseForm} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="rent" label="Аренда">
                <InputNumber min={0} style={{ width: '100%' }} parser={value => value?.replace(/[^\d]/g, '') as any} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="payroll" label="ФОТ">
                <InputNumber min={0} parser={value => value?.replace(/[^\d]/g, '') as any} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="taxes" label="Налоги">
                <InputNumber min={0} parser={value => value?.replace(/[^\d]/g, '') as any} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="logistics" label="Логистика">
                <InputNumber min={0} parser={value => value?.replace(/[^\d]/g, '') as any} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="marketing" label="Маркетинг">
                <InputNumber min={0} parser={value => value?.replace(/[^\d]/g, '') as any} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="defects" label="Брак">
                <InputNumber min={0} parser={value => value?.replace(/[^\d]/g, '') as any} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="other_expenses" label="Прочее">
                <InputNumber min={0} parser={value => value?.replace(/[^\d]/g, '') as any} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {(isRentHigh || isPayrollHigh || isLogisticsHigh || isMarketingHigh || isNetProfitNegative || isExpenseGrowthHigh) && (
        <Alert
          message="Внимание: превышены нормативы"
          description={
            <Space direction="vertical">
              {isRentHigh && <Text>Аренда превышает 12% от выручки: {(((data?.rent || 0) / (data?.revenue || 1)) * 100).toFixed(1)}%</Text>}
              {isPayrollHigh && <Text>ФОТ превышает 20% от выручки: {(((data?.payroll || 0) / (data?.revenue || 1)) * 100).toFixed(1)}%</Text>}
              {isLogisticsHigh && <Text>Логистика превышает 5% от выручки: {(((data?.logistics || 0) / (data?.revenue || 1)) * 100).toFixed(1)}%</Text>}
              {isMarketingHigh && <Text>Маркетинг превышает 15% от выручки: {(((data?.marketing || 0) / (data?.revenue || 1)) * 100).toFixed(1)}%</Text>}
              {isNetProfitNegative && <Text>Чистая прибыль отрицательная: {Math.round(data?.net_profit || 0).toLocaleString()} ₽</Text>}
              {isExpenseGrowthHigh && <Text>Общий рост расходов превышает 20% по сравнению с прошлым месяцем: {((currentTotalExpenses - prevTotalExpenses) / prevTotalExpenses * 100).toFixed(1)}%</Text>}
            </Space>
          }
          type="error"
          showIcon
          style={{ marginTop: 16 }}
          icon={<WarningOutlined />}
        />
      )}

      {!hasExpenses && data && (
        <Alert
          message="Заполните расходы"
          description={
            <Space>
              Для расчёта чистой прибыли необходимо внести данные по расходам за текущий месяц.
              <Button size="small" icon={<EditOutlined />} onClick={openExpenseModal}>
                Внести
              </Button>
            </Space>
          }
          type="warning"
          showIcon
          style={{ marginBottom: 16, marginTop: 16 }}
        />
      )}

      <Card title="Путь от выручки к чистой прибыли" style={{ marginTop: 16 }}>
        {expenses.length > 0 ? (
          <Row gutter={[8, 8]}>
            <Col xs={24}>
              <div style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                <Text strong>Выручка</Text>
                <Text style={{ float: 'right', color: '#52c41a' }}>{Math.round(data?.revenue || 0).toLocaleString()} ₽</Text>
              </div>
            </Col>
            {expenses.map((expense, idx) => {
              const runningTotal = (data?.revenue || 0) - expenses.slice(0, idx + 1).reduce((sum, e) => sum + e.value, 0);
              return (
                <Col xs={24} key={expense.name}>
                  <div style={{ padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                    <Text type="secondary">- {expense.name}</Text>
                    <Text style={{ float: 'right', color: '#ff4d4f' }}>{Math.round(expense.value).toLocaleString()} ₽</Text>
                    <div style={{ fontSize: 12, color: '#888' }}>
                      Остаток: {Math.round(runningTotal).toLocaleString()} ₽
                    </div>
                  </div>
                </Col>
              );
            })}
            <Col xs={24}>
              <div style={{ padding: '12px 0' }}>
                <Text strong>Чистая прибыль</Text>
                <Text style={{ float: 'right', fontSize: 18, color: (data?.net_profit || 0) >= 0 ? '#1890ff' : '#ff4d4f' }}>
                  {Math.round(data?.net_profit || 0).toLocaleString()} ₽
                </Text>
              </div>
            </Col>
          </Row>
        ) : (
          <Empty description="Нет данных" />
        )}
      </Card>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }} align="stretch">
        <Col xs={24} lg={12} style={{ display: 'flex' }}>
          <Card title="Структура затрат" style={{ flex: 1, height: '100%' }} bodyStyle={{ height: '100%' }}>
            {pieData.length > 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {pieData.map(item => (
                  <div key={item.category} style={{ marginBottom: 8 }}>
                    <Row>
                      <Col span={12}>
                        <Tag color={
                          item.category === 'Себестоимость' ? 'magenta' :
                          item.category === 'Аренда' ? 'blue' :
                          item.category === 'ФОТ' ? 'purple' :
                          item.category === 'Налоги' ? 'orange' :
                          item.category === 'Логистика' ? 'geekblue' :
                          item.category === 'Брак' ? 'red' : 'default'
                        }>{item.category}</Tag>
                      </Col>
                      <Col span={6}>
                        <Text>{item.amount.toLocaleString()} ₽</Text>
                      </Col>
                      <Col span={6}>
                        <Text type="secondary">{item.percent.toFixed(1)}%</Text>
                      </Col>
                    </Row>
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="Нет данных о затратах" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12} style={{ display: 'flex' }}>
          <Card title="Детализация расходов" style={{ flex: 1, height: '100%' }} bodyStyle={{ height: '100%' }}>
            <Table
              dataSource={data?.expense_breakdown || []}
              columns={expenseColumns}
              rowKey="category"
              pagination={false}
              size="small"
              locale={{ emptyText: 'Нет данных о расходах' }}
            />
          </Card>
        </Col>
      </Row>

      <Collapse 
        ghost 
        style={{ marginTop: 16 }}
        items={[
          {
            key: 'unit-calculator',
            label: '🧮 Калькулятор unit-экономики',
            children: templatesLoading ? (
              <Spin />
            ) : (
              <UnitEconomyCalculator
                templates={templatesData || []}
                onSaveTemplate={async (template) => {
                  await createUnitTemplate(template).unwrap();
                }}
                onDeleteTemplate={async (id) => {
                  await deleteUnitTemplate(id).unwrap();
                }}
              />
            ),
          },
        ]}
      />
    </div>
  );
};

export default ProfitTab;
