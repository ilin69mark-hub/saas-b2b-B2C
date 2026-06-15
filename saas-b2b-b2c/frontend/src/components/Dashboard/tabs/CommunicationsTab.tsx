import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Card, Row, Col, Table, Tag, Button, Space, Modal, Form, Input, Select, InputNumber, Progress, Typography, Empty, Spin, message, Statistic, notification, Badge } from 'antd';
import { 
  PlusOutlined, 
  CommentOutlined,
  FileTextOutlined,
  BellOutlined,
} from '@ant-design/icons';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend } from 'recharts';
import dayjs from 'dayjs';
import apiClient from '@/api/axiosClient';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;

export type TaskStatus = 'new' | 'in_progress' | 'done' | 'overdue';
export type TaskPriority = 'high' | 'medium' | 'low';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'needs_clarification';
export type RequestType = 'discount' | 'return' | 'marketing' | 'other';

interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  createdAt: string;
  comments?: { text: string; author: string; date: string }[];
}

interface Request {
  id: string;
  type: RequestType;
  description: string;
  sentDate: string;
  status: RequestStatus;
  manager: string;
  amount?: number;
}

interface BudgetItem {
  id: string;
  date: string;
  purpose: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
}

interface Interaction {
  id: string;
  date: string;
  type: string;
  summary: string;
  result: string;
  managerName: string;
}

interface MarketingBudget {
  total: number;
  used: number;
  remaining: number;
  items: BudgetItem[];
}

const DONUT_COLORS = ['#1890ff', '#52c41a', '#fa8c16', '#ff4d4f', '#722ed1', '#13c2c2', '#d9d9d9'];

const taskStatusLabels: Record<TaskStatus, string> = {
  new: 'Новые',
  in_progress: 'В работе',
  done: 'Готово',
  overdue: 'Просрочено',
};

const taskPriorityLabels: Record<TaskPriority, string> = {
  high: 'Высокий',
  medium: 'Средний',
  low: 'Низкий',
};

const requestStatusLabels: Record<RequestStatus, string> = {
  pending: 'На рассмотрении',
  approved: 'Согласовано',
  rejected: 'Отклонено',
  needs_clarification: 'Требуется уточнение',
};

const requestTypeLabels: Record<RequestType, string> = {
  discount: 'Скидка',
  return: 'Возврат/брак',
  marketing: 'Маркетинг',
  other: 'Другое',
};

const CommunicationsTab: React.FC = () => {
  const [requestModalOpen, setRequestModalOpen] = useState(false);
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [form] = Form.useForm();
  const [commentForm] = Form.useForm();
  const wsRef = useRef<WebSocket | null>(null);
  const wsRetriesRef = useRef(0);
  const maxRetries = 3;
  const [wsConnected, setWsConnected] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [marketingBudget, setMarketingBudget] = useState<MarketingBudget | undefined>(undefined);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      try {
        const [tasksRes, requestsRes, budgetRes, interactionsRes] = await Promise.all([
          apiClient.get('/dealer/tasks'),
          apiClient.get('/dealer/requests'),
          apiClient.get('/dealer/marketing-budget'),
          apiClient.get('/dealer/interactions'),
        ]);
        setTasks(tasksRes.data?.tasks || []);
        setRequests((requestsRes.data?.requests || []).map((r: any) => ({
          id: r.id,
          type: r.type,
          description: r.description,
          sentDate: r.created_at ? dayjs(r.created_at).format('DD.MM.YYYY') : '',
          status: r.status,
          manager: '',
          amount: r.amount ?? 0,
        })));
        const b = budgetRes.data;
        setMarketingBudget(b ? { total: b.total_amount, used: b.used_amount, remaining: b.remaining, items: b.items || [] } : undefined);
        setInteractions((interactionsRes.data || []).map((i: any) => ({
          id: i.id,
          date: i.date,
          type: i.type,
          summary: i.summary,
          result: i.result,
          managerName: i.manager_name || '',
        })));
      } catch (e) {
        console.error('Failed to fetch communications data', e);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, []);

  useEffect(() => {
    const connectWebSocket = () => {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8080/ws';
      try {
        wsRef.current = new WebSocket(wsUrl);
        
        wsRef.current.onopen = () => {
          setWsConnected(true);
          wsRetriesRef.current = 0;
        };
        
        wsRef.current.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            handleWebSocketMessage(data);
          } catch (e) {
            console.error('WebSocket message parse error', e);
          }
        };
        
        wsRef.current.onclose = () => {
          setWsConnected(false);
          if (wsRetriesRef.current < maxRetries) {
            wsRetriesRef.current += 1;
            const delay = Math.pow(2, wsRetriesRef.current - 1) * 1000;
            setTimeout(connectWebSocket, delay);
          } else {
            console.error('WebSocket max retries reached');
          }
        };
        
        wsRef.current.onerror = (error) => {
          console.error('WebSocket error', error);
        };
      } catch (e) {
        console.error('WebSocket connection error', e);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const handleWebSocketMessage = (data: { type: string; payload: any }) => {
    switch (data.type) {
      case 'TASK_UPDATED':
        setTasks(prev => prev.map(t => t.id === data.payload.id ? { ...t, ...data.payload } : t));
        notification.info({
          message: 'Задача обновлена',
          description: data.payload.title,
          icon: <BellOutlined />,
          duration: 5,
        });
        break;
      case 'TASK_CREATED':
        setTasks(prev => [data.payload, ...prev]);
        notification.info({
          message: 'Новая задача от бренда',
          description: data.payload.title,
          icon: <BellOutlined />,
          duration: 5,
        });
        break;
      case 'REQUEST_STATUS_CHANGED':
        setRequests(prev => prev.map(r => r.id === data.payload.id ? { ...r, ...data.payload } : r));
        const statusText: Record<string, string> = {
          pending: 'На рассмотрении',
          approved: 'Согласовано',
          rejected: 'Отклонено',
          needs_clarification: 'Требуется уточнение',
        };
        notification.info({
          message: 'Статус запроса изменён',
          description: statusText[data.payload.status] || data.payload.status,
          icon: <BellOutlined />,
          duration: 5,
        });
        break;
      default:
        console.log('Unknown WebSocket message type:', data.type);
    }
  };

  const handleTaskStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    const prev = tasks;
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));
    try {
      await apiClient.patch(`/dealer/tasks/${taskId}`, { status: newStatus });
    } catch (e) {
      setTasks(prev);
      message.error('Не удалось обновить задачу');
    }
  };

  const handleCreateRequest = async () => {
    try {
      const values = await form.validateFields();
      await apiClient.post('/dealer/requests', values);
      message.success('Запрос отправлен');
      setRequestModalOpen(false);
      form.resetFields();
      const { data } = await apiClient.get('/dealer/requests');
      setRequests(data || []);
    } catch (e) {
      if (e instanceof Error || typeof e === 'object') {
        return;
      }
      message.error('Ошибка при отправке запроса');
    }
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (filterStatus !== 'all' && task.status !== filterStatus) return false;
      if (filterPriority !== 'all' && task.priority !== filterPriority) return false;
      return true;
    });
  }, [tasks, filterStatus, filterPriority]);

  const tasksByStatus = useMemo(() => {
    const map = new Map<TaskStatus, number>();
    for (const t of tasks) {
      const status = t.status === 'overdue' ? 'overdue' : t.status === 'done' ? 'done' : t.status;
      map.set(status, (map.get(status) || 0) + 1);
    }
    return Array.from(map.entries()).map(([status, count]) => ({
      name: taskStatusLabels[status] || status,
      value: count,
    }));
  }, [tasks]);

  const tasksByPriority = useMemo(() => {
    const map = new Map<TaskPriority, number>();
    for (const t of tasks) {
      map.set(t.priority, (map.get(t.priority) || 0) + 1);
    }
    return Array.from(map.entries()).map(([priority, count]) => ({
      name: taskPriorityLabels[priority] || priority,
      value: count,
    }));
  }, [tasks]);

  const requestsByStatus = useMemo(() => {
    const map = new Map<RequestStatus, number>();
    for (const r of requests) {
      map.set(r.status, (map.get(r.status) || 0) + 1);
    }
    return Array.from(map.entries()).map(([status, count]) => ({
      name: requestStatusLabels[status] || status,
      value: count,
    }));
  }, [requests]);

  const requestsByType = useMemo(() => {
    const map = new Map<RequestType, number>();
    for (const r of requests) {
      map.set(r.type, (map.get(r.type) || 0) + 1);
    }
    return Array.from(map.entries()).map(([type, count]) => ({
      name: requestTypeLabels[type] || type,
      value: count,
    }));
  }, [requests]);

  const overdueCount = useMemo(() => tasks.filter(t => t.status === 'overdue').length, [tasks]);
  const pendingRequests = useMemo(() => requests.filter(r => r.status === 'pending').length, [requests]);

  const tasksTableColumns = [
    {
      title: 'Задача',
      dataIndex: 'title',
      key: 'title',
      align: 'center',
      width: 200,
      render: (val: string, record: Task) => (
        <Space direction="vertical" size={0}>
          <Text strong>{val}</Text>
          <Text type="secondary" style={{ fontSize: 12 }}>{record.description}</Text>
        </Space>
      ),
    },
    {
      title: 'Срок',
      dataIndex: 'dueDate',
      key: 'dueDate',
      align: 'center',
      width: 120,
      render: (val: string) => {
        const due = dayjs(val);
        const now = dayjs();
        const daysDiff = due.diff(now, 'day');
        let color = '#52c41a';
        if (daysDiff < 0) color = '#ff4d4f';
        else if (daysDiff < 3) color = '#fa8c16';
        return <Tag color={color}>{due.format('DD.MM.YYYY')}</Tag>;
      },
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      align: 'center',
      width: 120,
      render: (val: TaskStatus) => {
        const statusMap: Record<TaskStatus, { color: string; text: string }> = {
          new: { color: 'blue', text: 'Новая' },
          in_progress: { color: 'orange', text: 'В работе' },
          done: { color: 'green', text: 'Готово' },
          overdue: { color: 'red', text: 'Просрочено' },
        };
        return <Tag color={statusMap[val].color}>{statusMap[val].text}</Tag>;
      },
    },
    {
      title: 'Приоритет',
      dataIndex: 'priority',
      key: 'priority',
      align: 'center',
      width: 100,
      render: (val: TaskPriority) => {
        const priorityMap: Record<TaskPriority, { color: string; text: string }> = {
          high: { color: 'red', text: 'Высокий' },
          medium: { color: 'orange', text: 'Средний' },
          low: { color: 'default', text: 'Низкий' },
        };
        return <Tag color={priorityMap[val].color}>{priorityMap[val].text}</Tag>;
      },
    },
    {
      title: 'Действия',
      key: 'actions',
      align: 'center',
      width: 150,
      render: (_: any, record: Task) => (
        <Space>
          {record.status === 'new' && (
            <Button size="small" type="primary" onClick={() => handleTaskStatusChange(record.id, 'in_progress')}>
              Принять
            </Button>
          )}
          {(record.status === 'new' || record.status === 'in_progress') && (
            <Button size="small" type="primary" ghost onClick={() => handleTaskStatusChange(record.id, 'done')}>
              Готово
            </Button>
          )}
          <Button size="small" icon={<CommentOutlined />} onClick={() => { setSelectedTask(record); setCommentModalOpen(true); }}>
            Комментарий
          </Button>
        </Space>
      ),
    },
  ];

  const requestsTableColumns = [
    {
      title: 'Тип',
      dataIndex: 'type',
      key: 'type',
      align: 'center',
      width: 150,
      render: (val: RequestType) => {
        const typeMap: Record<RequestType, string> = {
          discount: 'Согласование скидки',
          return: 'Возврат/брак',
          marketing: 'Маркетинговая поддержка',
          other: 'Другое',
        };
        return <Tag>{typeMap[val]}</Tag>;
      },
    },
    {
      title: 'Описание',
      dataIndex: 'description',
      key: 'description',
      align: 'center',
      width: 200,
    },
    {
      title: 'Дата',
      dataIndex: 'sentDate',
      key: 'sentDate',
      align: 'center',
      width: 100,
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      align: 'center',
      width: 150,
      render: (val: RequestStatus) => {
        const statusMap: Record<string, { color: string; text: string }> = {
          pending: { color: 'blue', text: 'На рассмотрении' },
          approved: { color: 'green', text: 'Согласовано' },
          rejected: { color: 'red', text: 'Отклонено' },
          needs_clarification: { color: 'orange', text: 'Требуется уточнение' },
        };
        const s = statusMap[val] || { color: 'default', text: val };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    {
      title: 'Менеджер',
      dataIndex: 'manager',
      key: 'manager',
      align: 'center',
      width: 150,
    },
  ];

  const budgetPercent = marketingBudget ? Math.round((marketingBudget.used / marketingBudget.total) * 100) || 0 : 0;

  const budgetTableColumns = [
    { title: 'Дата', dataIndex: 'date', key: 'date', align: 'center', width: 100 },
    { title: 'Назначение', dataIndex: 'purpose', key: 'purpose', align: 'center', width: 200 },
    { title: 'Сумма', dataIndex: 'amount', key: 'amount', align: 'center', render: (val: number) => <Text>{val.toLocaleString()} ₽</Text> },
    { title: 'Статус', dataIndex: 'status', key: 'status', align: 'center', width: 120, render: (val: string) => { const m: Record<string, string> = { approved: 'Согласовано', pending: 'Ожидает', rejected: 'Отклонено' }; return <Tag color={val === 'approved' ? 'green' : val === 'pending' ? 'orange' : 'red'}>{m[val] || val}</Tag>; } },
  ];

  const interactionColumns = [
    { title: 'Дата', dataIndex: 'date', key: 'date', align: 'center', width: 100 },
    { title: 'Тип', dataIndex: 'type', key: 'type', align: 'center', width: 100, render: (val: string) => { const m: Record<string, string> = { call: 'Звонок', meeting: 'Встреча', email: 'Письмо', task: 'Задача', discount: 'Согласование' }; return <Tag>{m[val] || val}</Tag>; } },
    { title: 'Содержание', dataIndex: 'summary', key: 'summary', align: 'center', width: 200 },
    { title: 'Результат', dataIndex: 'result', key: 'result', align: 'center', width: 150 },
    { title: 'Менеджер', dataIndex: 'managerName', key: 'managerName', align: 'center', width: 130 },
  ];

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 50 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic title="Всего задач" value={tasks.length} valueStyle={{ fontSize: 14 }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic title="Просрочено" value={overdueCount} valueStyle={{ fontSize: 14, color: overdueCount > 0 ? '#ff4d4f' : '#52c41a' }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic title="Запросов на рассмотрении" value={pendingRequests} valueStyle={{ fontSize: 14, color: pendingRequests > 0 ? '#fa8c16' : undefined }} />
          </Card>
        </Col>
        <Col xs={6}>
          <Card size="small" style={{ textAlign: 'center' }}>
            <Statistic title="В сети" prefix={wsConnected ? <Badge status="success" /> : <Badge status="error" />} value={wsConnected ? 'Online' : 'Offline'} valueStyle={{ fontSize: 14 }} />
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <Space>
            <Select value={filterStatus} onChange={setFilterStatus} style={{ width: 150 }}>
              <Option value="all">Все статусы</Option>
              <Option value="new">Новые</Option>
              <Option value="in_progress">В работе</Option>
              <Option value="done">Готово</Option>
              <Option value="overdue">Просроченные</Option>
            </Select>
            <Select value={filterPriority} onChange={setFilterPriority} style={{ width: 150 }}>
              <Option value="all">Все приоритеты</Option>
              <Option value="high">Высокий</Option>
              <Option value="medium">Средний</Option>
              <Option value="low">Низкий</Option>
            </Select>
          </Space>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <Card title="📋 Задачи от франчайзера">
            {filteredTasks.length > 0 ? (
              <Table dataSource={filteredTasks} columns={tasksTableColumns} rowKey="id" pagination={{ pageSize: 10 }} scroll={{ x: 800 }} />
            ) : (
              <Empty description="Нет задач" />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="🍩 Задачи по статусам">
            {tasksByStatus.length > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={tasksByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3}>
                      {tasksByStatus.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip formatter={(value: number, name: string) => [`${value} шт.`, name]} />
                    <Legend verticalAlign="bottom" height={30} formatter={(value: string) => <span style={{ fontSize: 13 }}>{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty description="Нет данных" />
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="🍩 Задачи по приоритетам">
            {tasksByPriority.length > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={tasksByPriority} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3}>
                      {tasksByPriority.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip formatter={(value: number, name: string) => [`${value} шт.`, name]} />
                    <Legend verticalAlign="bottom" height={30} formatter={(value: string) => <span style={{ fontSize: 13 }}>{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty description="Нет данных" />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <Card
            title="📨 Мои запросы к бренду"
            extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => setRequestModalOpen(true)}>Создать запрос</Button>}
          >
            {requests.length > 0 ? (
              <Table dataSource={requests} columns={requestsTableColumns} rowKey="id" pagination={{ pageSize: 10 }} scroll={{ x: 800 }} />
            ) : (
              <Empty description="Нет запросов" />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} md={12}>
          <Card title="🍩 Запросы по статусам">
            {requestsByStatus.length > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={requestsByStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3}>
                      {requestsByStatus.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip formatter={(value: number, name: string) => [`${value} шт.`, name]} />
                    <Legend verticalAlign="bottom" height={30} formatter={(value: string) => <span style={{ fontSize: 13 }}>{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty description="Нет данных" />
            )}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="🍩 Запросы по типам">
            {requestsByType.length > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie data={requestsByType} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3}>
                      {requestsByType.map((_, i) => <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />)}
                    </Pie>
                    <RechartsTooltip formatter={(value: number, name: string) => [`${value} шт.`, name]} />
                    <Legend verticalAlign="bottom" height={30} formatter={(value: string) => <span style={{ fontSize: 13 }}>{value}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <Empty description="Нет данных" />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <Card title="💰 Маркетинговый бюджет">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Row gutter={16}>
                <Col span={8}>
                  <Statistic title="Выделено" value={marketingBudget?.total || 0} prefix="₽ " />
                </Col>
                <Col span={8}>
                  <Statistic title="Использовано" value={marketingBudget?.used || 0} prefix="₽ " valueStyle={{ color: '#fa8c16' }} />
                </Col>
                <Col span={8}>
                  <Statistic title="Остаток" value={marketingBudget?.remaining || 0} prefix="₽ " valueStyle={{ color: '#52c41a' }} />
                </Col>
              </Row>
              <Progress
                percent={budgetPercent}
                status={budgetPercent > 90 ? 'exception' : budgetPercent === 100 ? 'success' : undefined}
                strokeColor={budgetPercent > 90 ? '#ff4d4f' : '#1890ff'}
              />
            </Space>
          </Card>
        </Col>
      </Row>

      {marketingBudget?.items?.length ? (
        <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
          <Col xs={24}>
            <Card title="Детализация трат">
              <Table dataSource={marketingBudget.items} columns={budgetTableColumns} rowKey="id" pagination={{ pageSize: 5 }} />
            </Card>
          </Col>
        </Row>
      ) : null}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24}>
          <Card title="📜 История взаимодействий">
            {interactions.length > 0 ? (
              <Table dataSource={interactions} columns={interactionColumns} rowKey="id" pagination={{ pageSize: 10 }} scroll={{ x: 700 }} />
            ) : (
              <Empty description="Нет взаимодействий" />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title="Создать запрос"
        open={requestModalOpen}
        onCancel={() => setRequestModalOpen(false)}
        onOk={handleCreateRequest}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="type" label="Тип запроса" rules={[{ required: true }]}>
            <Select>
              <Option value="discount">Согласование скидки</Option>
              <Option value="return">Возврат/брак</Option>
              <Option value="marketing">Маркетинговая поддержка</Option>
              <Option value="other">Другое</Option>
            </Select>
          </Form.Item>
          <Form.Item name="amount" label="Сумма (для скидки/возврата)">
            <InputNumber style={{ width: '100%' }} min={0} placeholder="0 ₽" />
          </Form.Item>
          <Form.Item name="description" label="Описание" rules={[{ required: true }]}>
            <TextArea rows={4} placeholder="Опишите ваш запрос..." />
          </Form.Item>
          <Form.Item name="file" label="Прикрепить файл">
            <Button icon={<FileTextOutlined />}>Выбрать файл</Button>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Комментарий к задаче: ${selectedTask?.title}`}
        open={commentModalOpen}
        onCancel={() => { setCommentModalOpen(false); setSelectedTask(null); commentForm.resetFields(); }}
        onOk={() => { commentForm.validateFields().then(() => { message.success('Комментарий добавлен'); setCommentModalOpen(false); }); }}
      >
        <Form form={commentForm} layout="vertical">
          <Form.Item name="comment" label="Ваш комментарий" rules={[{ required: true }]}>
            <TextArea rows={3} placeholder="Введите комментарий..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default CommunicationsTab;
