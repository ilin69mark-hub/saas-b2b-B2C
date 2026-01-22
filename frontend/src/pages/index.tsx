import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Card, Col, Row, Statistic, Progress, Button, Table, Space, Tag } from 'antd';
import { CheckCircleOutlined, ClockCircleOutlined, SyncOutlined, UserOutlined } from '@ant-design/icons';
import { RootState, AppDispatch } from '../store';
import { fetchChecklists } from '../store/checklistSlice';
import { useRouter } from 'next/router';
import Head from 'next/head';

const { Column } = Table;

const Dashboard: React.FC = () => {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { items: checklists, loading } = useSelector((state: RootState) => state.checklist);
  const { isAuthenticated, user } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }
    
    dispatch(fetchChecklists());
  }, [dispatch, isAuthenticated, router]);

  // Calculate statistics
  const totalChecklists = checklists.length;
  const completedChecklists = checklists.filter(cl => cl.status === 'completed').length;
  const inProgressChecklists = checklists.filter(cl => cl.status === 'in_progress').length;
  const pendingChecklists = checklists.filter(cl => cl.status === 'pending').length;
  
  const overallKPIScore = checklists.length 
    ? checklists.reduce((sum, checklist) => sum + checklist.kpi_score, 0) / checklists.length 
    : 0;

  // Sample data for recent activities
  const recentActivities = [
    {
      id: '1',
      activity: 'Завершен ежедневный чек-лист',
      date: '2023-06-15 14:30',
      status: 'completed',
    },
    {
      id: '2',
      activity: 'Создан новый чек-лист',
      date: '2023-06-15 10:15',
      status: 'pending',
    },
    {
      id: '3',
      activity: 'Добавлены новые задачи',
      date: '2023-06-14 16:45',
      status: 'completed',
    },
    {
      id: '4',
      activity: 'Обновлен профиль',
      date: '2023-06-14 09:20',
      status: 'completed',
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#52c41a';
      case 'in_progress':
        return '#1890ff';
      case 'pending':
        return '#faad14';
      default:
        return '#bfbfbf';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Выполнен';
      case 'in_progress':
        return 'В процессе';
      case 'pending':
        return 'Ожидает';
      default:
        return 'Неизвестен';
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <Head>
        <title>Дашборд дилера | Платформа управления франчайзингом</title>
        <meta name="description" content="Дашборд для дилеров франчайзинговой сети" />
      </Head>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <h1 style={{ fontSize: '28px', fontWeight: 600, marginBottom: 0 }}>
            Добро пожаловать, {user?.first_name || user?.email || 'Дилер'}!
          </h1>
          <p style={{ color: '#8c8c8c', marginTop: '8px' }}>Ваша статистика и задачи на сегодня</p>
        </Col>
      </Row>

      {/* Stats Cards */}
      <Row gutter={[16, 16]} style={{ marginTop: '24px' }}>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Всего чек-листов"
              value={totalChecklists}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="Выполнено"
              value={completedChecklists}
              prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="В процессе"
              value={inProgressChecklists}
              prefix={<SyncOutlined style={{ color: '#1890ff' }} />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Card>
            <Statistic
              title="KPI"
              value={`${overallKPIScore.toFixed(1)}%`}
              precision={1}
              valueStyle={{ color: overallKPIScore > 70 ? '#3f8600' : overallKPIScore > 40 ? '#faad14' : '#cf1322' }}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* KPI Progress */}
      <Row gutter={[16, 16]} style={{ marginTop: '24px' }}>
        <Col xs={24} lg={16}>
          <Card title="Прогресс KPI" loading={loading}>
            <div style={{ marginBottom: '24px' }}>
              <h3>Общий прогресс выполнения задач</h3>
              <Progress 
                percent={Math.round(overallKPIScore)} 
                strokeColor={{
                  '0%': '#108ee9',
                  '100%': '#87d068',
                }}
                size="large"
              />
              <p style={{ marginTop: '8px', textAlign: 'center' }}>
                {overallKPIScore.toFixed(1)}% выполнения
              </p>
            </div>

            <div>
              <h3>Статусы чек-листов</h3>
              <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                <div>
                  <Tag color="#52c41a">Выполнено: {completedChecklists}</Tag>
                </div>
                <div>
                  <Tag color="#1890ff">В процессе: {inProgressChecklists}</Tag>
                </div>
                <div>
                  <Tag color="#faad14">Ожидает: {pendingChecklists}</Tag>
                </div>
              </div>
            </div>
          </Card>
        </Col>

        <Col xs={24} lg={8}>
          <Card title="Быстрые действия">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button 
                type="primary" 
                size="large" 
                onClick={() => router.push('/checklists')}
              >
                Создать чек-лист
              </Button>
              <Button size="large" onClick={() => router.push('/checklists')}>
                Посмотреть все задачи
              </Button>
              <Button size="large" onClick={() => router.push('/profile')}>
                Профиль
              </Button>
            </Space>
          </Card>

          <Card title="Недавняя активность" style={{ marginTop: '16px' }}>
            <Table 
              dataSource={recentActivities} 
              pagination={false} 
              showHeader={false}
              rowKey="id"
            >
              <Column 
                title="Активность" 
                dataIndex="activity" 
                key="activity"
                render={(text) => <span>{text}</span>}
              />
              <Column 
                title="Дата" 
                dataIndex="date" 
                key="date"
                render={(text) => <span style={{ fontSize: '12px', color: '#8c8c8c' }}>{text}</span>}
              />
            </Table>
          </Card>
        </Col>
      </Row>

      {/* Recent Checklists */}
      <Row style={{ marginTop: '24px' }}>
        <Col span={24}>
          <Card 
            title="Последние чек-листы" 
            extra={
              <Button 
                type="link" 
                onClick={() => router.push('/checklists')}
              >
                Показать все
              </Button>
            }
            loading={loading}
          >
            <Table 
              dataSource={checklists.slice(0, 5)} 
              rowKey="id"
              pagination={false}
            >
              <Column 
                title="Название" 
                dataIndex="title" 
                key="title"
                render={(text) => <strong>{text}</strong>}
              />
              <Column 
                title="Описание" 
                dataIndex="description" 
                key="description"
                render={(text) => text || '-'}
              />
              <Column 
                title="Статус" 
                key="status"
                render={(_, record: any) => (
                  <Tag color={getStatusColor(record.status)}>
                    {getStatusText(record.status)}
                  </Tag>
                )}
              />
              <Column 
                title="KPI" 
                dataIndex="kpi_score" 
                key="kpi_score"
                render={(score) => `${score.toFixed(1)}%`}
              />
              <Column 
                title="Дата создания" 
                dataIndex="created_at" 
                key="created_at"
                render={(date) => new Date(date).toLocaleDateString()}
              />
            </Table>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default Dashboard;