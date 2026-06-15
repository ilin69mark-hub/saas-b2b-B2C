import React, { useEffect, useState } from 'react';
import {
  Card,
  Row,
  Col,
  Table,
  Input,
  Select,
  Button,
  Tag,
  Space,
  Modal,
  Form,
  Input as InputForm,
  DatePicker,
  Progress,
  Tabs,
  Typography,
  Spin,
  message,
  Drawer,
  Checkbox,
  Statistic,
} from 'antd';
import {
  PlusOutlined,
  SearchOutlined,
  EditOutlined,
  StopOutlined,
  DeleteOutlined,
  UserOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ExportOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import apiClient from '@/api/axiosClient';
import { useTenantsStore } from '@/store/tenantsStore';
import dayjs from 'dayjs';
import PlanList from '../PlanList';

const { Title, Text } = Typography;
const { Option } = Select;

const TenantsSection: React.FC = () => {
  const {
    tenants,
    tenantsLoading,
    selectedTenant,
    showCard,
    filters,
    showCreateModal,
    showSuspendModal,
    showTerminateModal,
    showImpersonateModal,
    selectedTenantForAction,
    onboarding,
    setTenants,
    setSelectedTenant,
    setTenantsLoading,
    setShowCreateModal,
    setShowSuspendModal,
    setShowTerminateModal,
    setShowImpersonateModal,
    setSelectedTenantForAction,
    setShowCard,
    setFilters,
    setOnboarding,
  } = useTenantsStore();

  const [createForm] = Form.useForm();
  const [suspendReason, setSuspendReason] = useState('');
  const [terminateReason, setTerminateReason] = useState('');
  const [exportData, setExportData] = useState(false);
  const [deleteDelay, setDeleteDelay] = useState('30');
  const [selectedRole, setSelectedRole] = useState('');

  useEffect(() => {
    fetchTenants();
    fetchOnboarding();
  }, []);

  const fetchTenants = async () => {
    setTenantsLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.tariff) params.append('tariff', filters.tariff);
      if (filters.hasDebt) params.append('hasDebt', 'true');
      if (filters.search) params.append('search', filters.search);

      const res = await apiClient.get(`/admin/tenants?${params.toString()}`);
      const data = (res.data || []) as Array<Record<string, unknown>>;
      setTenants(data.map((item: any) => ({
        id: String(item.id),
        name: item.name || '',
        legalEntity: item.legal_entity || undefined,
        inn: item.inn || undefined,
        tariff: item.plan_name || '—',
        dealers: item.dealer_count || 0,
        users: item.user_count || 0,
        licenseLimit: item.max_users || 0,
        mrr: item.mrr || 0,
        paymentStatus: item.payment_status || 'pending',
        nextPaymentDate: item.paid_until || '',
        status: item.status || 'active',
      })));
    } catch {
      setTenants([]);
      message.error('Ошибка загрузки тенантов');
    } finally {
      setTenantsLoading(false);
    }
  };

  const fetchOnboarding = async () => {
    try {
      const res = await apiClient.get('/admin/tenants/onboarding');
      setOnboarding(res.data || []);
    } catch {
      setOnboarding([]);
    }
  };

  const handleCreateTenant = async (values: any) => {
    try {
      await apiClient.post('/admin/tenants', {
        name: values.name,
        tariff: values.tariff,
        legal_entity: values.legalEntity,
        inn: values.inn,
        max_users: values.licenseLimit ? parseInt(values.licenseLimit, 10) : 10,
        contact_name: values.contactName,
        contact_email: values.contactEmail,
      });
      message.success('Тенант создан');
      setShowCreateModal(false);
      createForm.resetFields();
      fetchTenants();
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'Ошибка создания');
    }
  };

  const handleSuspend = async () => {
    if (!selectedTenantForAction) return;
    try {
      await apiClient.post(`/admin/tenants/${selectedTenantForAction.id}/block`, {
        reason: suspendReason,
      });
      message.success('Тенант приостановлен');
      setShowSuspendModal(false);
      setSuspendReason('');
      fetchTenants();
    } catch {
      message.error('Ошибка');
    }
  };

  const handleTerminate = async () => {
    if (!selectedTenantForAction) return;
    try {
      await apiClient.delete(`/admin/tenants/${selectedTenantForAction.id}`);
      message.success('Тенант удалён');
      setShowTerminateModal(false);
      fetchTenants();
    } catch {
      message.error('Ошибка');
    }
  };

  const handleImpersonate = async () => {
    if (!selectedTenantForAction) return;
    try {
      const res = await apiClient.post(`/admin/tenants/${selectedTenantForAction.id}/impersonate`, {
        role: selectedRole,
      });
      window.open(`/auth?token=${res.data.token}`, '_blank');
      message.success('Сессия открыта');
      setShowImpersonateModal(false);
    } catch {
      message.error('Ошибка');
    }
  };

  const getPaymentStatusTag = (status: string) => {
    const config = {
      paid: { color: 'green', icon: <CheckCircleOutlined />, text: 'Оплачен' },
      pending: { color: 'gold', icon: <ClockCircleOutlined />, text: 'Ожидается' },
      overdue: { color: 'red', icon: <CloseCircleOutlined />, text: 'Просрочен' },
    };
    const c = config[status as keyof typeof config] || config.pending;
    return (
      <Tag icon={c.icon} color={c.color}>
        {c.text}
      </Tag>
    );
  };

  const getTenantStatusTag = (status: string) => {
    const config = {
      active: { color: 'green', text: 'Активен' },
      blocked: { color: 'red', text: 'Приостановлен' },
      churned: { color: 'default', text: 'Удалён' },
    };
    const c = config[status as keyof typeof config] || config.active;
    return <Tag color={c.color}>{c.text}</Tag>;
  };

  const columns = [
    {
      title: 'Название',
      dataIndex: 'name',
      key: 'name',
      align: 'center',
      sorter: (a: any, b: any) => a.name.localeCompare(b.name),
    },
    {
      title: 'Юрлицо',
      dataIndex: 'legalEntity',
      key: 'legalEntity',
      align: 'center',
    },
    {
      title: 'Тариф',
      dataIndex: 'tariff',
      key: 'tariff',
      align: 'center',
      filters: [
        { text: 'Start', value: 'Start' },
        { text: 'Pro', value: 'Pro' },
        { text: 'Enterprise', value: 'Enterprise' },
      ],
      onFilter: (value: any, record: any) => record.tariff === value,
    },
    {
      title: 'Пользователей',
      dataIndex: 'users',
      key: 'users',
      align: 'center',
      render: (_: number, record: any) => `${record.users || 0}/${record.licenseLimit || 10}`,
      sorter: (a: any, b: any) => (a.users || 0) - (b.users || 0),
    },
    {
      title: 'MRR',
      dataIndex: 'mrr',
      key: 'mrr',
      align: 'center',
      render: (v: number) => v ? `${v.toLocaleString()} ₽` : '-',
      sorter: (a: any, b: any) => (a.mrr || 0) - (b.mrr || 0),
    },
    {
      title: 'Оплата',
      dataIndex: 'paymentStatus',
      key: 'paymentStatus',
      align: 'center',
      render: (v: string) => getPaymentStatusTag(v),
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      align: 'center',
      render: (v: string) => getTenantStatusTag(v),
    },
    {
      title: 'Действия',
      key: 'actions',
      align: 'center',
      render: (_: any, record: any) => (
        <Space>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              setSelectedTenant(record);
              setShowCard(true);
            }}
          />
          {record.status === 'active' && (
            <Button
              size="small"
              icon={<PauseCircleOutlined />}
              onClick={() => {
                setSelectedTenantForAction(record);
                setShowSuspendModal(true);
              }}
            />
          )}
          {record.status === 'suspended' && (
            <Button
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => handleResume(record.id)}
            />
          )}
          {record.status !== 'terminated' && (
            <Button
              size="small"
              danger
              icon={<StopOutlined />}
              onClick={() => {
                setSelectedTenantForAction(record);
                setShowTerminateModal(true);
              }}
            />
          )}
        </Space>
      ),
    },
  ];

  const handleResume = async (id: string) => {
    try {
      await apiClient.post(`/admin/tenants/${id}/unblock`);
      message.success('Возобновлён');
      fetchTenants();
    } catch {
      message.error('Ошибка');
    }
  };

  const handleChangeTariff = async (id: string, tariff: string) => {
    try {
      await apiClient.put(`/admin/tenants/${id}`, { tariff });
      message.success('Тариф изменён');
      fetchTenants();
    } catch {
      message.error('Ошибка');
    }
  };

  const handleChangeLicenses = async (id: string, licenses: number) => {
    try {
      await apiClient.put(`/admin/tenants/${id}`, { licenseLimit: licenses });
      message.success('Лицензии обновлены');
      fetchTenants();
    } catch {
      message.error('Ошибка');
    }
  };

  const filteredTenants = tenants.filter((t) => {
    if (filters.status && t.status !== filters.status) return false;
    if (filters.tariff && t.tariff !== filters.tariff) return false;
    if (filters.hasDebt && t.paymentStatus !== 'overdue') return false;
    if (filters.search && !t.name.toLowerCase().includes(filters.search.toLowerCase()))
      return false;
    return true;
  });

  const getOnboardingStepTag = (step: string) => {
    const steps = {
      account_created: 'Аккаунт создан',
      dealers_added: 'Добавлены дилеры',
      users_added: 'Добавлены пользователи',
      first_sale: 'Первая продажа',
    };
    return steps[step as keyof typeof steps] || step;
  };

  return (
    <div>
      <Title level={3}>Тенанты</Title>

      <Card style={{ marginBottom: 16 }}>
        <Space wrap>
          <Input
            placeholder="Поиск по названию..."
            prefix={<SearchOutlined />}
            value={filters.search}
            onChange={(e) => setFilters({ search: e.target.value })}
            style={{ width: 200 }}
            allowClear
          />
          <Select
            placeholder="Статус"
            value={filters.status || undefined}
            onChange={(v) => setFilters({ status: v || '' })}
            style={{ width: 150 }}
            allowClear
          >
            <Option value="active">Активен</Option>
            <Option value="suspended">Приостановлен</Option>
            <Option value="terminated">Отключён</Option>
          </Select>
          <Select
            placeholder="Тариф"
            value={filters.tariff || undefined}
            onChange={(v) => setFilters({ tariff: v || '' })}
            style={{ width: 150 }}
            allowClear
          >
            <Option value="Start">Start</Option>
            <Option value="Pro">Pro</Option>
            <Option value="Enterprise">Enterprise</Option>
          </Select>
          <Checkbox
            checked={filters.hasDebt}
            onChange={(e) => setFilters({ hasDebt: e.target.checked })}
          >
            Только с долгами
          </Checkbox>
        </Space>
      </Card>

      <Card
        title={
          <Space>
            <span>Список тенантов</span>
            <Text type="secondary">({filteredTenants.length})</Text>
          </Space>
        }
        extra={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setShowCreateModal(true)}
          >
            Добавить тенанта
          </Button>
        }
      >
        <Table
          dataSource={filteredTenants}
          columns={columns}
          rowKey="id"
          loading={tenantsLoading}
          pagination={{ pageSize: 20 }}
        />
      </Card>

      {onboarding.length > 0 && (
        <Card title="Онбординг (новые тенанты)" style={{ marginTop: 16 }}>
          <Table
            dataSource={onboarding}
            columns={[
              { title: 'Название', dataIndex: 'name', key: 'name', align: 'center' },
              { title: 'Создан', dataIndex: 'createdAt', key: 'createdAt', align: 'center', render: (d: string) => dayjs(d).format('DD.MM.YYYY') },
              { title: 'Этап', dataIndex: 'step', key: 'step', align: 'center', render: (s: string) => getOnboardingStepTag(s) },
              {
                title: 'Прогресс',
                dataIndex: 'progress',
                key: 'progress',
                align: 'center',
                render: (p: number) => <Progress percent={p} size="small" />,
              },
              { title: 'Дней до TTV', dataIndex: 'daysToTtv', key: 'daysToTtv', align: 'center' },
            ]}
            rowKey="id"
            pagination={false}
          />
        </Card>
      )}

      <Card title="Тарифы и планы" style={{ marginTop: 16 }}>
        <PlanList />
      </Card>

      <Drawer
        title={selectedTenant?.name || 'Детали тенанта'}
        open={showCard && !!selectedTenant}
        onClose={() => {
          setShowCard(false);
          setSelectedTenant(null);
        }}
        width={600}
      >
        {selectedTenant && (
          <Tabs
            items={[
              {
                key: 'main',
                label: 'Основное',
                children: (
                  <div>
                    <Row gutter={16}>
                      <Col span={12}>
                        <Text type="secondary">Юрлицо</Text>
                        <div>{selectedTenant?.legalEntity || '-'}</div>
                      </Col>
                      <Col span={12}>
                        <Text type="secondary">ИНН</Text>
                        <div>{selectedTenant?.inn || '-'}</div>
                      </Col>
                    </Row>
                    <Row gutter={16} style={{ marginTop: 16 }}>
                      <Col span={12}>
                        <Text type="secondary">Тариф</Text>
                        <div>
                          <Select
                            value={selectedTenant?.tariff || 'Start'}
                            onChange={(v) => handleChangeTariff(selectedTenant!.id, v)}
                            style={{ width: '100%' }}
                          >
                            <Option value="Start">Start</Option>
                            <Option value="Pro">Pro</Option>
                            <Option value="Enterprise">Enterprise</Option>
                          </Select>
                        </div>
                      </Col>
                      <Col span={12}>
                        <Text type="secondary">Лицензии</Text>
                        <div>
                          <InputForm
                            type="number"
                            defaultValue={selectedTenant?.licenseLimit || 10}
                            onPressEnter={(e: any) =>
                              handleChangeLicenses(
                                selectedTenant!.id,
                                parseInt(e.target.value) || 10
                              )
                            }
                          />
                        </div>
                      </Col>
                    </Row>
                    <Row gutter={16} style={{ marginTop: 16 }}>
                      <Col span={12}>
                        <Text type="secondary">След. платёж</Text>
                        <div>
                          {selectedTenant?.nextPaymentDate
                            ? dayjs(selectedTenant.nextPaymentDate).format('DD.MM.YYYY')
                            : 'Не запланирован'}
                        </div>
                      </Col>
                      <Col span={12}>
                        <Text type="secondary">Статус</Text>
                        <div>
                          {getTenantStatusTag(selectedTenant?.status || 'active')}
                        </div>
                      </Col>
                    </Row>
                  </div>
                ),
              },
              {
                key: 'stats',
                label: 'Метрики',
                children: (
                  <Row gutter={16}>
                    <Col span={12}>
                      <Statistic title="Пользователей" value={selectedTenant?.users || 0} />
                    </Col>
                    <Col span={12}>
                      <Statistic title="MRR (ежемесячная выручка)" value={selectedTenant?.mrr || 0} prefix="₽" />
                    </Col>
                  </Row>
                ),
              },
            ]}
          />
        )}
      </Drawer>

      <Modal
        title="Создать тенанта"
        open={showCreateModal}
        onCancel={() => setShowCreateModal(false)}
        onOk={() => createForm.submit()}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateTenant}>
          <Form.Item
            name="name"
            label="Название"
            rules={[{ required: true }]}
          >
            <InputForm />
          </Form.Item>
          <Form.Item name="legalEntity" label="Юрлицо">
            <InputForm />
          </Form.Item>
          <Form.Item name="inn" label="ИНН">
            <InputForm />
          </Form.Item>
          <Form.Item name="tariff" label="Тариф" rules={[{ required: true }]}>
            <Select>
              <Option value="Start">Start</Option>
              <Option value="Pro">Pro</Option>
              <Option value="Enterprise">Enterprise</Option>
            </Select>
          </Form.Item>
          <Form.Item
            name="licenseLimit"
            label="Количество лицензий"
            rules={[{ required: true }]}
          >
            <InputForm type="number" />
          </Form.Item>
          <Form.Item name="contactName" label="Контактное лицо">
            <InputForm />
          </Form.Item>
          <Form.Item name="contactEmail" label="Email">
            <InputForm type="email" />
          </Form.Item>
          <Form.Item name="contractStartDate" label="Дата начала договора">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="subdomain" label="Поддомен">
            <InputForm addonAfter=".example.com" />
          </Form.Item>
        </Form>
      </Modal>

			<Modal
        title="Расторгнуть договор"
        open={showTerminateModal}
        onCancel={() => setShowTerminateModal(false)}
        onOk={handleTerminate}
        okText="Расторгнуть"
        okButtonProps={{ danger: true }}
      >
        <p style={{ color: '#ff4d4f' }}>
          Внимание! Это действие необратимо.
        </p>
        <Form.Item label="Причина расторжения">
          <InputForm
            value={terminateReason}
            onChange={(e) => setTerminateReason(e.target.value)}
          />
        </Form.Item>
        <Checkbox
          checked={exportData}
          onChange={(e) => setExportData(e.target.checked)}
        >
          Экспортировать данные перед удалением
        </Checkbox>
        <div style={{ marginTop: 8 }}>
          <Text>Удалить данные через: </Text>
          <Select
            value={deleteDelay}
            onChange={setDeleteDelay}
            style={{ width: 100 }}
          >
            <Option value="7">7 дней</Option>
            <Option value="30">30 дней</Option>
            <Option value="90">90 дней</Option>
          </Select>
        </div>
      </Modal>

      <Modal
        title="Войти как"
        open={showImpersonateModal}
        onCancel={() => setShowImpersonateModal(false)}
        onOk={handleImpersonate}
        okText="Войти"
      >
        <p>Выберите роль для имперсонации:</p>
        <Select
          value={selectedRole}
          onChange={setSelectedRole}
          style={{ width: '100%' }}
        >
          <Option value="franchiser">Франчайзер</Option>
          <Option value="franchiser_manager">Менеджер франчайзера</Option>
          <Option value="dealer">Дилер</Option>
        </Select>
        <p style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
          Каждое использование будет залогировано в аудит.
        </p>
      </Modal>
    </div>
  );
};

export default TenantsSection;