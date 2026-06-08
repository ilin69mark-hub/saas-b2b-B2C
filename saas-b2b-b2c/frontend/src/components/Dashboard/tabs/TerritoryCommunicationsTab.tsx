import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Card, Row, Col, Typography, Table, Tag, Space, Input, Button, Select, Modal, Form, DatePicker, Segmented, Timeline, Collapse, message } from 'antd';
import { TeamOutlined, PlusOutlined, SendOutlined, PhoneOutlined, MailOutlined, FileTextOutlined, DollarOutlined, UnorderedListOutlined, ClockCircleOutlined } from '@ant-design/icons';
import apiClient from '@/api/axiosClient';
import dayjs from 'dayjs';

const { Text } = Typography;
const { TextArea } = Input;
const { RangePicker } = DatePicker;

interface Task {
  id: string;
  title: string;
  assignedTo: string;
  assignedAt: string;
  dueDate: string;
  dueDateSort: string;
  status: string;
}

interface Interaction {
  id: string;
  dealer_id: string;
  type: string;
  description: string;
  result: string;
  date: string;
}

interface TerritoryCommunicationsTabProps {
  loading?: boolean;
}

const PERIOD_OPTIONS = [
  { label: 'Неделя', value: 'week' },
  { label: 'Месяц', value: 'month' },
  { label: 'Квартал', value: 'quarter' },
  { label: 'Год', value: 'year' },
  { label: 'Свой', value: 'custom' },
];

const INTERACTION_TYPES = [
  { value: 'call', label: 'Звонок', icon: <PhoneOutlined /> },
  { value: 'meeting', label: 'Встреча', icon: <TeamOutlined /> },
  { value: 'email', label: 'Письмо', icon: <MailOutlined /> },
  { value: 'task', label: 'Задача', icon: <FileTextOutlined /> },
  { value: 'discount', label: 'Согласование', icon: <DollarOutlined /> },
];

const INTERACTION_ICONS: Record<string, React.ReactNode> = {
  call: <PhoneOutlined />,
  meeting: <TeamOutlined />,
  email: <MailOutlined />,
  task: <FileTextOutlined />,
  discount: <DollarOutlined />,
};

const INTERACTION_COLORS: Record<string, string> = {
  call: 'blue',
  meeting: 'green',
  email: 'orange',
  task: 'purple',
  discount: 'red',
};

const TerritoryCommunicationsTab: React.FC<TerritoryCommunicationsTabProps> = ({ loading }) => {
  const [activeBlock, setActiveBlock] = useState<'tasks' | 'history'>('tasks');
  const [taskFilter, setTaskFilter] = useState<string>('all');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [commLoading, setCommLoading] = useState(false);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [interactionModalOpen, setInteractionModalOpen] = useState(false);
  const [dealers, setDealers] = useState<{ id: string; name: string }[]>([]);
  const [creating, setCreating] = useState(false);
  const [savingInteraction, setSavingInteraction] = useState(false);
  const [period, setPeriod] = useState<string>('month');
  const [customRange, setCustomRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [viewMode, setViewMode] = useState<'timeline' | 'list'>('timeline');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [dealerFilter, setDealerFilter] = useState<string>('');

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const loadCommData = useCallback(async (p: string, custom?: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setCommLoading(true);
    try {
      let url = `/territory/communications?period=${p}`;
      if (p === 'custom' && custom?.[0] && custom?.[1]) {
        url += `&start_date=${custom[0].format('YYYY-MM-DD')}&end_date=${custom[1].format('YYYY-MM-DD')}`;
      }
      const [commRes, planRes] = await Promise.all([
        apiClient.get(url),
        apiClient.get('/territory/planfact?period=month').catch(() => null),
      ]);
      const data = commRes.data;
      const dealerMap: Record<string, string> = {};
      if (planRes?.data?.dealers) {
        planRes.data.dealers.forEach((d: any) => {
          dealerMap[d.id] = d.dealer_name;
        });
        setDealers(planRes.data.dealers.map((d: any) => ({ id: d.id, name: d.dealer_name })));
      }

      const mapped: Task[] = (data.tasks || []).map((t: any) => ({
        id: t.id,
        title: t.title,
        assignedTo: dealerMap[t.assigned_to] || t.assigned_to || 'Неизвестно',
        assignedAt: t.created_at ? dayjs(t.created_at).format('DD.MM.YYYY') : '-',
        dueDate: t.due_date ? dayjs(t.due_date).format('DD.MM.YYYY') : '-',
        dueDateSort: t.due_date || '',
        status: t.status || 'pending',
      }));
      setTasks(mapped);
      setInteractions(data.interactions || []);
      setUnreadCount(data.unread_messages || 0);
    } catch (e) {
      console.error('Error fetching communications:', e);
    }
    setCommLoading(false);
  }, []);

  useEffect(() => { loadCommData(period, customRange); }, [period, customRange]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (taskFilter === 'all') return true;
      if (taskFilter === 'overdue') return t.status === 'overdue';
      if (taskFilter === 'active') return t.status !== 'done' && t.status !== 'overdue';
      return true;
    });
  }, [tasks, taskFilter]);

  const statusColors: Record<string, string> = {
    pending: 'default', in_progress: 'processing', done: 'green', overdue: 'red',
  };
  const statusLabels: Record<string, string> = {
    pending: 'Ожидает', in_progress: 'В работе', done: 'Готово', overdue: 'Просрочено',
  };

  const dealerFilters = useMemo(() => {
    const unique = [...new Set(tasks.map(t => t.assignedTo))];
    return unique.map(d => ({ text: d, value: d }));
  }, [tasks]);

  const statusFilters = [
    { text: 'Ожидает', value: 'pending' },
    { text: 'В работе', value: 'in_progress' },
    { text: 'Готово', value: 'done' },
    { text: 'Просрочено', value: 'overdue' },
  ];

  const taskColumns = [
    { title: 'Задача', dataIndex: 'title', key: 'title', align: 'center' as const,
      filters: [...new Set(tasks.map(t => t.title))].map(t => ({ text: t, value: t })),
      onFilter: (value: any, record: Task) => record.title === value,
      filterSearch: true,
    },
    { title: 'Дилер', dataIndex: 'assignedTo', key: 'assignedTo', align: 'center' as const,
      filters: dealerFilters,
      onFilter: (value: any, record: Task) => record.assignedTo === value,
    },
    { title: 'Назначена', dataIndex: 'assignedAt', key: 'assignedAt', align: 'center' as const,
      sorter: (a: Task, b: Task) => dayjs(a.assignedAt, 'DD.MM.YYYY').unix() - dayjs(b.assignedAt, 'DD.MM.YYYY').unix(),
    },
    { title: 'Срок', dataIndex: 'dueDate', key: 'dueDate', align: 'center' as const,
      sorter: (a: Task, b: Task) => {
        if (!a.dueDateSort && !b.dueDateSort) return 0;
        if (!a.dueDateSort) return 1;
        if (!b.dueDateSort) return -1;
        return a.dueDateSort.localeCompare(b.dueDateSort);
      },
    },
    { title: 'Статус', dataIndex: 'status', key: 'status', align: 'center' as const,
      filters: statusFilters,
      onFilter: (value: any, record: Task) => record.status === value,
      render: (s: string) => (
        <Tag color={statusColors[s] || 'default'}>{statusLabels[s] || s}</Tag>
      ),
    },
  ];

  const [taskForm] = Form.useForm();
  const [interactionForm] = Form.useForm();

  const handleCreateTask = async () => {
    try {
      const values = await taskForm.validateFields();
      setCreating(true);
      const dealerId = Array.isArray(values.dealer) ? values.dealer[0] : values.dealer;
      await apiClient.post('/territory/tasks', {
        dealer_id: dealerId,
        title: values.description,
        description: values.description,
        due_date: values.dueDate ? dayjs(values.dueDate).format('YYYY-MM-DD') : '',
      });
      message.success('Задача создана');
      setTaskModalOpen(false);
      taskForm.resetFields();
      loadCommData(period, customRange);
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error('Ошибка создания задачи');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateInteraction = async (values: any) => {
    setSavingInteraction(true);
    try {
      const dealerId = Array.isArray(values.dealer) ? values.dealer[0] : values.dealer;
      const dateStr = values.date ? dayjs(values.date).format('YYYY-MM-DD HH:mm') : '';
      await apiClient.post('/territory/interactions', {
        dealer_id: dealerId,
        type: values.type,
        date: dateStr,
        description: values.description || '',
        result: values.result || '',
      });
      message.success('Контакт сохранён');
      setInteractionModalOpen(false);
      interactionForm.resetFields();
      loadCommData(period, customRange);
    } catch (e: any) {
      message.error('Ошибка сохранения контакта');
    } finally {
      setSavingInteraction(false);
    }
  };

  const dealerNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    dealers.forEach(d => { m[d.id] = d.name; });
    return m;
  }, [dealers]);

  const mergedItems = useMemo(() => {
    const items: { id: string; sortKey: string; isTask: boolean; task?: Task; interaction?: Interaction }[] = [];

    interactions.forEach((ix) => {
      if (dealerFilter && ix.dealer_id !== dealerFilter) return;
      items.push({ id: `ix-${ix.id}`, sortKey: ix.date || '', isTask: false, interaction: ix });
    });

    tasks.forEach((t) => {
      if (dealerFilter && t.assignedTo !== dealerNameMap[dealerFilter] && t.assignedTo !== dealerFilter) return;
      items.push({ id: `task-${t.id}`, sortKey: t.dueDateSort || t.assignedAt, isTask: true, task: t });
    });

    items.sort((a, b) => b.sortKey.localeCompare(a.sortKey));
    return items;
  }, [interactions, tasks, dealerFilter, dealerNameMap]);

  const timelineItems = useMemo(() => {
    return mergedItems.map((item) => {
      const isExpanded = expandedIds.has(item.id);
      let color = 'blue';
      let summary: React.ReactNode = null;
      let details: React.ReactNode = null;

      if (item.isTask && item.task) {
        const t = item.task;
        color = t.status === 'done' ? 'green' : t.status === 'overdue' ? 'red' : 'blue';
        summary = (
          <Space>
            <FileTextOutlined />
            <Text strong>{t.title}</Text>
            <Tag color={statusColors[t.status] || 'default'} style={{ margin: 0 }}>{statusLabels[t.status] || t.status}</Tag>
          </Space>
        );
        details = (
          <div style={{ padding: '8px 0 0 24px' }}>
            {t.dueDate !== '-' && <Text type="secondary" style={{ display: 'block' }}>Срок: {t.dueDate}</Text>}
            <Text type="secondary">Дилер: {t.assignedTo}</Text>
          </div>
        );
      } else if (item.interaction) {
        const ix = item.interaction;
        color = INTERACTION_COLORS[ix.type] || 'blue';
        summary = (
          <Space>
            {INTERACTION_ICONS[ix.type] || <FileTextOutlined />}
            <Text strong>{INTERACTION_TYPES.find(t => t.value === ix.type)?.label || ix.type}</Text>
          </Space>
        );
        details = (
          <div style={{ padding: '8px 0 0 24px' }}>
            {ix.description && <Text style={{ display: 'block' }}>{ix.description}</Text>}
            {ix.result && <Text type="secondary" style={{ display: 'block' }}>Результат: {ix.result}</Text>}
            <Text type="secondary">Дилер: {dealerNameMap[ix.dealer_id] || ix.dealer_id}</Text>
          </div>
        );
      }

      return {
        color,
        children: (
          <div
            onClick={() => toggleExpand(item.id)}
            style={{ cursor: 'pointer' }}
          >
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              {item.isTask && item.task
                ? `${item.task.assignedAt}${item.task.dueDate !== '-' ? ` — срок ${item.task.dueDate}` : ''}`
                : item.interaction?.date
                  ? dayjs(item.interaction.date).format('DD.MM.YYYY HH:mm')
                  : '-'}
            </Text>
            {summary}
            {isExpanded && details}
          </div>
        ),
      };
    });
  }, [mergedItems, expandedIds, dealerNameMap]);

  const collapseItems = useMemo(() => {
    return mergedItems.map((item) => {
      const id = item.id;
      let header: React.ReactNode = null;
      let children: React.ReactNode = null;

      if (item.isTask && item.task) {
        const t = item.task;
        header = (
          <Space>
            <FileTextOutlined />
            <Text strong>{t.title}</Text>
            <Tag color={statusColors[t.status] || 'default'} style={{ margin: 0 }}>{statusLabels[t.status] || t.status}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>{t.assignedAt}</Text>
          </Space>
        );
        children = (
          <div>
            <Text type="secondary" style={{ display: 'block' }}>Дилер: {t.assignedTo}</Text>
            {t.dueDate !== '-' && <Text type="secondary" style={{ display: 'block' }}>Срок: {t.dueDate}</Text>}
          </div>
        );
      } else if (item.interaction) {
        const ix = item.interaction;
        header = (
          <Space>
            {INTERACTION_ICONS[ix.type] || <FileTextOutlined />}
            <Text strong>{INTERACTION_TYPES.find(t => t.value === ix.type)?.label || ix.type}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {ix.date ? dayjs(ix.date).format('DD.MM.YYYY HH:mm') : '-'}
            </Text>
          </Space>
        );
        children = (
          <div>
            {ix.description && <Text style={{ display: 'block' }}>{ix.description}</Text>}
            {ix.result && <Text type="secondary" style={{ display: 'block' }}>Результат: {ix.result}</Text>}
            <Text type="secondary">Дилер: {dealerNameMap[ix.dealer_id] || ix.dealer_id}</Text>
          </div>
        );
      }

      return { key: id, label: header, children };
    });
  }, [mergedItems, dealerNameMap]);

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16}>
          <Col>
            <Segmented value={activeBlock} onChange={(v) => setActiveBlock(v as any)} options={[
              { label: <span>Мои задачи{unreadCount > 0 ? <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, borderRadius: 9, backgroundColor: '#ff4d4f', color: '#fff', fontSize: 11, fontWeight: 600, padding: '0 5px', marginLeft: 5, lineHeight: '18px' }}>{unreadCount}</span> : ''}</span>, value: 'tasks' },
              { label: 'История', value: 'history' },
            ]} />
          </Col>
        </Row>
      </Card>

      {activeBlock === 'tasks' && (
        <>
          <Card size="small" style={{ marginBottom: 16 }}>
            <Space>
              <Select value={taskFilter} onChange={setTaskFilter} style={{ width: 140 }}>
                <Select.Option value="all">Все задачи</Select.Option>
                <Select.Option value="active">Активные</Select.Option>
                <Select.Option value="overdue">Просроченные</Select.Option>
              </Select>
              <Button type="primary" icon={<PlusOutlined />} onClick={() => setTaskModalOpen(true)}>
                Поставить задачу
              </Button>
            </Space>
          </Card>
          <Card size="small" title="Мои задачи дилерам">
            <Table
              dataSource={filteredTasks}
              columns={taskColumns}
              rowKey="id"
              size="small"
              loading={loading || commLoading}
              pagination={{ pageSize: 10 }}
              locale={{ emptyText: 'Нет задач' }}
            />
          </Card>
        </>
      )}

      {activeBlock === 'history' && (
        <>
          <Card size="small" style={{ marginBottom: 16 }}>
            <Space wrap>
              <Segmented
                value={period}
                onChange={(v) => {
                  setPeriod(v as string);
                  if (v !== 'custom') setCustomRange(null);
                }}
                options={PERIOD_OPTIONS}
              />
              {period === 'custom' && (
                <RangePicker
                  value={customRange as any}
                  onChange={(dates) => {
                    setCustomRange(dates as any);
                  }}
                />
              )}
              <Select
                allowClear
                placeholder="Все дилеры"
                style={{ minWidth: 140 }}
                value={dealerFilter || undefined}
                onChange={(v) => setDealerFilter(v || '')}
              >
                {dealers.map(d => (
                  <Select.Option key={d.id} value={d.id}>{d.name}</Select.Option>
                ))}
              </Select>
              <Button icon={<PlusOutlined />} onClick={() => setInteractionModalOpen(true)}>
                Добавить контакт
              </Button>
              <Segmented
                value={viewMode}
                onChange={(v) => setViewMode(v as any)}
                options={[
                  { label: <span><ClockCircleOutlined /> Таймлайн</span>, value: 'timeline' },
                  { label: <span><UnorderedListOutlined /> Список</span>, value: 'list' },
                ]}
              />
            </Space>
          </Card>
          <Card size="small" title="История взаимодействий">
            {viewMode === 'timeline' ? (
              <Timeline items={timelineItems} />
            ) : (
              <Collapse
                ghost
                items={collapseItems}
                onChange={(keys) => setExpandedIds(new Set(keys as string[]))}
                activeKey={Array.from(expandedIds)}
              />
            )}
          </Card>
        </>
      )}

      <Modal
        title="Поставить задачу"
        open={taskModalOpen}
        onCancel={() => setTaskModalOpen(false)}
        onOk={handleCreateTask}
        confirmLoading={creating}
      >
        <Form form={taskForm} layout="vertical">
          <Form.Item name="dealer" label="Дилер" rules={[{ required: true, message: 'Выберите дилера' }]}>
            <Select placeholder="Выберите дилера" showSearch optionFilterProp="label">
              {dealers.map(d => (
                <Select.Option key={d.id} value={d.id} label={d.name}>{d.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="description" label="Описание" rules={[{ required: true, message: 'Введите описание' }]}>
            <TextArea rows={3} placeholder="Описание задачи" />
          </Form.Item>
          <Form.Item name="dueDate" label="Срок выполнения" rules={[{ required: true, message: 'Укажите срок' }]}>
            <DatePicker style={{ width: '100%' }} disabledDate={(d) => d && d.isBefore(dayjs().startOf('day'))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Добавить контакт"
        open={interactionModalOpen}
        onCancel={() => {
          setInteractionModalOpen(false);
          interactionForm.resetFields();
        }}
        footer={null}
      >
        <Form
          form={interactionForm}
          layout="vertical"
          onFinish={handleCreateInteraction}
        >
          <Form.Item name="dealer" label="Дилер" rules={[{ required: true, message: 'Выберите дилера' }]}>
            <Select placeholder="Выберите дилера" showSearch optionFilterProp="label">
              {dealers.map(d => (
                <Select.Option key={d.id} value={d.id} label={d.name}>{d.name}</Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="type" label="Тип контакта" rules={[{ required: true, message: 'Выберите тип' }]}>
            <Select placeholder="Выберите тип">
              {INTERACTION_TYPES.map(t => <Select.Option key={t.value} value={t.value}>{t.icon} {t.label}</Select.Option>)}
            </Select>
          </Form.Item>
          <Form.Item name="date" label="Дата и время">
            <DatePicker showTime={{ format: 'HH:mm' }} format="DD.MM.YYYY HH:mm" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="description" label="Описание">
            <TextArea rows={2} placeholder="Краткое описание" />
          </Form.Item>
          <Form.Item name="result" label="Результат">
            <TextArea rows={2} placeholder="Договорённости" />
          </Form.Item>
          <Button type="primary" block htmlType="submit" icon={<SendOutlined />} loading={savingInteraction}>Сохранить</Button>
        </Form>
      </Modal>
    </div>
  );
};

export default TerritoryCommunicationsTab;
