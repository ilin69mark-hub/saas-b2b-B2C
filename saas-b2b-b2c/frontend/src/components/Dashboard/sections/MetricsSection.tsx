import React from 'react';
import { Card, Row, Col, Statistic, Typography } from 'antd';
import { RiseOutlined, UserOutlined, ShopOutlined, FallOutlined } from '@ant-design/icons';
import { useSuperAdminStore } from '@/store/superAdminStore';

const { Title } = Typography;

const MetricsSection: React.FC = () => {
  const { stats, isLoading, lastUpdated } = useSuperAdminStore();

  return (
    <div>
      <Title level={3}>SaaS-метрики</Title>
      <Row gutter={16}>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title="MRR (ежемесячная выручка)"
              value={stats.mrr}
              suffix="₽"
              precision={0}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title="ARR (годовая выручка)"
              value={stats.arr}
              suffix="₽"
              precision={0}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title="Отток"
              value={stats.churnRate}
              suffix="%"
              precision={1}
              valueStyle={{ color: stats.churnRate > 10 ? '#ff4d4f' : '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title="ARPU (средний доход на пользователя)"
              value={stats.arpu}
              prefix={<UserOutlined />}
              suffix="₽"
              precision={0}
            />
          </Card>
        </Col>
      </Row>
      <Row gutter={16} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} lg={8}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title="Активные"
              value={stats.activeTenants}
              prefix={<ShopOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title="Новые за месяц"
              value={stats.newThisMonth}
              prefix={<RiseOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={8}>
          <Card style={{ height: '100%' }}>
            <Statistic
              title="Отключено за месяц"
              value={stats.churnedThisMonth}
              prefix={<FallOutlined />}
              valueStyle={{ color: '#ff4d4f' }}
            />
          </Card>
        </Col>
      </Row>
      {lastUpdated && (
        <div style={{ marginTop: 16, color: '#888' }}>
          Последнее обновление: {lastUpdated.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default MetricsSection;