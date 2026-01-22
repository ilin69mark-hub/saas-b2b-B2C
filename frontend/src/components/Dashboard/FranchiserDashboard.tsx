import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Table, Typography, Tabs, Select, DatePicker, Button, Badge } from 'antd';
import { 
  ShopOutlined, 
  UsergroupAddOutlined, 
  RiseOutlined, 
  DollarCircleOutlined,
  AlertOutlined,
  CheckCircleOutlined 
} from '@ant-design/icons';
import { Dealer, User } from '@/types';
import { useGetDealersQuery, useGetNetworkStatsQuery } from '@/services/api';
import type { ColumnsType } from 'antd/es/table';

const { Title, Text } = Typography;
const { TabPane } = Tabs;
const { RangePicker } = DatePicker;

interface FranchiserDashboardProps {
  user: User;
}

const FranchiserDashboard: React.FC<FranchiserDashboardProps> = ({ user }) => {
  const [selectedPeriod, setSelectedPeriod] = useState<[Date, Date] | null>(null);
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  
  const { data: dealersData, isLoading: dealersLoading } = useGetDealersQuery();
  const { data: statsData, isLoading: statsLoading } = useGetNetworkStatsQuery();

  // Рассчитываем статистику
  const activeDealers = dealersData?.filter(dealer => dealer.status === 'active').length || 0;
  const totalRevenue = dealersData?.reduce((sum, dealer) => sum + (dealer.kpiMetrics.revenue || 0), 0) || 0;
  const avgConversion = dealersData 
    ? (dealersData.reduce((sum, dealer) => sum + dealer.kpiMetrics.conversionRate, 0) / dealersData.length) 
    : 0;
  const highPerformers = dealersData?.filter(dealer => 
    dealer.kpiMetrics.checklistCompletionRate >= 90 && dealer.kpiMetrics.conversionRate >= 25
  ).length || 0;

  // Определяем колонки для таблицы дилеров
  const columns: ColumnsType<Dealer> = [
    {
      title: 'Имя',
      dataIndex: ['contact', 'name'],
      key: 'name',
      render: (text, record) => `${record.businessName} (${record.address})`,
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Badge 
          status={status === 'active' ? 'success' : status === 'inactive' ? 'default' : 'error'} 
          text={status === 'active' ? 'Активен' : status === 'inactive' ? 'Неактивен' : 'Приостановлен'} 
        />
      ),
    },
    {
      title: 'Продажи',
      dataIndex: ['kpiMetrics', 'revenue'],
      key: 'revenue',
      render: (value: number) => `₽${value?.toLocaleString() || '0'}`,
    },
    {
      title: 'Конверсия',
      dataIndex: ['kpiMetrics', 'conversionRate'],
      key: 'conversionRate',
      render: (value: number) => `${value?.toFixed(2) || '0'}%`,
    },
    {
      title: 'Выполнение чек-листа',
      dataIndex: ['kpiMetrics', 'checklistCompletionRate'],
      key: 'checklistRate',
      render: (value: number) => `${value?.toFixed(2) || '0'}%`,
    },
    {
      title: 'Действия',
      key: 'actions',
      render: () => (
        <Button size="small">Подробнее</Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <Title level={2}>Панель управления франчайзера</Title>
        <div style={{ display: 'flex', gap: '16px' }}>
          <RangePicker onChange={(dates) => setSelectedPeriod(dates as [Date, Date])} />
          <Select 
            placeholder="Выберите регион" 
            style={{ width: 200 }} 
            onChange={setSelectedRegion}
            defaultValue="all"
          >
            <Select.Option value="all">Все регионы</Select.Option>
            <Select.Option value="moscow">Москва</Select.Option>
            <Select.Option value="spb">Санкт-Петербург</Select.Option>
            <Select.Option value="ekb">Екатеринбург</Select.Option>
            <Select.Option value="novosibirsk">Новосибирск</Select.Option>
          </Select>
        </div>
      </div>

      {/* Основные метрики сети */}
      <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Активные дилеры"
              value={activeDealers}
              prefix={<ShopOutlined />}
              loading={statsLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Общий доход"
              value={totalRevenue}
              precision={0}
              valueStyle={{ color: '#3f8600' }}
              prefix={<DollarCircleOutlined />}
              formatter={(value) => `₽${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
              loading={statsLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Средняя конверсия"
              value={avgConversion}
              precision={2}
              valueStyle={{ color: '#1890ff' }}
              prefix={<RiseOutlined />}
              suffix="%"
              loading={statsLoading}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Высокие перформеры"
              value={highPerformers}
              valueStyle={{ color: '#722ed1' }}
              prefix={<CheckCircleOutlined />}
              loading={statsLoading}
            />
          </Card>
        </Col>
      </Row>

      {/* Таблицы и графики */}
      <Tabs defaultActiveKey="dealers" destroyInactiveTabPane>
        <TabPane tab="Список дилеров" key="dealers">
          <Card>
            <Table 
              columns={columns} 
              dataSource={dealersData} 
              rowKey="id"
              loading={dealersLoading}
              pagination={{ pageSize: 10 }}
            />
          </Card>
        </TabPane>
        
        <TabPane tab="Аналитика" key="analytics">
          <Row gutter={[16, 16]}>
            <Col span={12}>
              <Card title="Региональное распределение">
                <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Text type="secondary">График регионального распределения</Text>
                </div>
              </Card>
            </Col>
            <Col span={12}>
              <Card title="Динамика по месяцам">
                <div style={{ height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Text type="secondary">График динамики сети</Text>
                </div>
              </Card>
            </Col>
          </Row>
        </TabPane>
        
        <TabPane tab="Оповещения" key="alerts">
          <Card title="Система оповещений">
            <div style={{ height: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Text type="secondary">Панель управления оповещениями и инцидентами</Text>
            </div>
          </Card>
        </TabPane>
      </Tabs>
    </div>
  );
};

export default FranchiserDashboard;