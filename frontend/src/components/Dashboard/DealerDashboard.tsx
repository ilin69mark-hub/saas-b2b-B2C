import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Statistic, Progress, Button, List, Typography, Space } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, UserOutlined, DollarOutlined } from '@ant-design/icons';
import { Checklist, Lead, User } from '@/types';
import { useGetChecklistQuery, useGetLeadsQuery } from '@/services/api';

const { Title, Text } = Typography;

interface DealerDashboardProps {
  user: User;
}

const DealerDashboard: React.FC<DealerDashboardProps> = ({ user }) => {
  const [todayChecklist, setTodayChecklist] = useState<Checklist | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  
  const { data: checklistData } = useGetChecklistQuery();
  const { data: leadsData } = useGetLeadsQuery();

  useEffect(() => {
    if (checklistData && checklistData.length > 0) {
      // Находим чек-лист на сегодня
      const today = new Date().toISOString().split('T')[0];
      const todayItem = checklistData.find(item => item.date.startsWith(today));
      setTodayChecklist(todayItem || null);
    }
    
    if (leadsData) {
      setLeads(leadsData);
    }
  }, [checklistData, leadsData]);

  // Рассчитываем статистику
  const completedTasks = todayChecklist 
    ? todayChecklist.tasks.filter(task => task.status === 'completed' || task.status === 'verified').length 
    : 0;
  
  const totalTasks = todayChecklist?.tasks.length || 0;
  const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const newLeadsCount = leads.filter(lead => 
    new Date(lead.createdAt) >= new Date(new Date().setHours(0, 0, 0, 0))
  ).length;

  const activeDealsValue = leads
    .filter(lead => lead.funnelStage === 'negotiation' || lead.funnelStage === 'proposal')
    .reduce((sum, lead) => sum + (lead.value || 0), 0);

  return (
    <div style={{ padding: '24px' }}>
      <Title level={2}>Личный кабинет дилера</Title>
      <Text>Добро пожаловать, {user.firstName} {user.lastName}!</Text>

      {/* Основные метрики */}
      <Row gutter={[16, 16]} style={{ marginTop: '24px' }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Выполнение чек-листа"
              value={completionRate}
              precision={0}
              valueStyle={{ color: completionRate >= 80 ? '#52c41a' : completionRate >= 50 ? '#faad14' : '#ff4d4f' }}
              prefix={<CheckCircleOutlined />}
              suffix="/ 100%"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Новые лиды сегодня"
              value={newLeadsCount}
              valueStyle={{ color: '#1890ff' }}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Активные сделки"
              value={activeDealsValue}
              precision={0}
              valueStyle={{ color: '#13c2c2' }}
              prefix={<DollarOutlined />}
              formatter={(value) => `₽${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Средняя конверсия"
              value={23.5}
              precision={1}
              valueStyle={{ color: '#722ed1' }}
              prefix={<ClockCircleOutlined />}
              suffix="%"
            />
          </Card>
        </Col>
      </Row>

      {/* Прогресс выполнения чек-листа */}
      <Row style={{ marginTop: '24px' }}>
        <Col span={24}>
          <Card title="Прогресс чек-листа на сегодня">
            <div style={{ marginBottom: '16px' }}>
              <Space>
                <Text strong>Выполнено: {completedTasks}/{totalTasks}</Text>
                <Text type={completionRate >= 80 ? 'success' : completionRate >= 50 ? 'warning' : 'danger'}>
                  {completionRate}% выполнения
                </Text>
              </Space>
            </div>
            <Progress percent={completionRate} size="large" status={completionRate >= 80 ? 'success' : completionRate >= 50 ? 'active' : 'exception'} />
            
            {todayChecklist && todayChecklist.tasks.length > 0 && (
              <List
                style={{ marginTop: '16px' }}
                dataSource={todayChecklist.tasks.slice(0, 5)} // Показываем только первые 5 задач
                renderItem={(task, index) => (
                  <List.Item key={index}>
                    <List.Item.Meta
                      title={task.title}
                      description={task.description}
                    />
                    <div>
                      <Button 
                        type={task.status === 'completed' || task.status === 'verified' ? 'primary' : 'default'}
                        size="small"
                        disabled={task.status === 'completed' || task.status === 'verified'}
                      >
                        {task.status === 'completed' || task.status === 'verified' ? 'Выполнено' : 'Отметить'}
                      </Button>
                    </div>
                  </List.Item>
                )}
              />
            )}
          </Card>
        </Col>
      </Row>

      {/* Последние лиды */}
      <Row style={{ marginTop: '24px' }}>
        <Col span={24}>
          <Card title="Последние лиды">
            {leads.length > 0 ? (
              <List
                dataSource={leads.slice(0, 5)} // Показываем только последние 5 лидов
                renderItem={(lead, index) => (
                  <List.Item key={index}>
                    <List.Item.Meta
                      title={`${lead.contact.name} (${lead.source})`}
                      description={`Статус: ${lead.status}, Этап воронки: ${lead.funnelStage}`}
                    />
                    <div>
                      <Text>{lead.value ? `₽${lead.value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') : 'Не указана'}</Text>
                    </div>
                  </List.Item>
                )}
              />
            ) : (
              <Text>Нет данных о лидах</Text>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default DealerDashboard;