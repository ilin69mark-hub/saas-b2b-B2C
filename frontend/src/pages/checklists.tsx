import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useRouter } from 'next/router';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Tag,
  Typography,
  Popconfirm,
  message,
  Badge,
  List,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { RootState, AppDispatch } from '../store';
import {
  fetchChecklists,
  createChecklist,
  updateChecklist,
  deleteChecklist,
  completeChecklist,
  setCurrentChecklist,
} from '../store/checklistSlice';
import Head from 'next/head';

const { Title, Text } = Typography;
const { TextArea } = Input;

const ChecklistsPage: React.FC = () => {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { items: checklists, loading, currentChecklist } = useSelector(
    (state: RootState) => state.checklist
  );
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);
  const [form] = Form.useForm();
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [selectedChecklist, setSelectedChecklist] = useState<any>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login');
      return;
    }

    dispatch(fetchChecklists());
  }, [dispatch, isAuthenticated, router]);

  const handleCreate = () => {
    form.resetFields();
    setIsEditing(false);
    setSelectedChecklist(null);
    setModalVisible(true);
  };

  const handleEdit = (record: any) => {
    form.setFieldsValue({
      title: record.title,
      description: record.description,
    });
    setIsEditing(true);
    setSelectedChecklist(record);
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      await dispatch(deleteChecklist(id)).unwrap();
      message.success('Чек-лист удален успешно');
    } catch (err) {
      message.error('Ошибка при удалении чек-листа');
    }
  };

  const handleComplete = async (id: string) => {
    try {
      await dispatch(completeChecklist(id)).unwrap();
      message.success('Чек-лист завершен успешно');
    } catch (err) {
      message.error('Ошибка при завершении чек-листа');
    }
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      
      if (isEditing && selectedChecklist) {
        await dispatch(
          updateChecklist({
            id: selectedChecklist.id,
            ...values,
          })
        ).unwrap();
        message.success('Чек-лист обновлен успешно');
      } else {
        await dispatch(
          createChecklist({
            title: values.title,
            description: values.description,
            status: 'pending',
            tasks: [],
          })
        ).unwrap();
        message.success('Чек-лист создан успешно');
      }

      setModalVisible(false);
      form.resetFields();
    } catch (err) {
      console.error('Validation failed:', err);
    }
  };

  const handleModalCancel = () => {
    setModalVisible(false);
    form.resetFields();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'green';
      case 'in_progress':
        return 'blue';
      case 'pending':
        return 'orange';
      default:
        return 'default';
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

  const columns = [
    {
      title: 'Название',
      dataIndex: 'title',
      key: 'title',
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: 'Описание',
      dataIndex: 'description',
      key: 'description',
      render: (text: string) => text || '-',
    },
    {
      title: 'Статус',
      key: 'status',
      render: (_: any, record: any) => (
        <Tag color={getStatusColor(record.status)}>
          {getStatusText(record.status)}
        </Tag>
      ),
    },
    {
      title: 'KPI',
      dataIndex: 'kpi_score',
      key: 'kpi_score',
      render: (score: number) => `${score.toFixed(1)}%`,
    },
    {
      title: 'Дата создания',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleDateString(),
    },
    {
      title: 'Действия',
      key: 'actions',
      render: (_: any, record: any) => (
        <Space size="middle">
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            Редактировать
          </Button>
          <Popconfirm
            title="Вы уверены, что хотите удалить этот чек-лист?"
            onConfirm={() => handleDelete(record.id)}
            okText="Да"
            cancelText="Нет"
          >
            <Button type="link" danger icon={<DeleteOutlined />}>
              Удалить
            </Button>
          </Popconfirm>
          {record.status !== 'completed' && (
            <Button
              type="link"
              icon={<CheckCircleOutlined />}
              onClick={() => handleComplete(record.id)}
            >
              Завершить
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: '24px' }}>
      <Head>
        <title>Чек-листы | Платформа управления франчайзингом</title>
        <meta name="description" content="Управление чек-листами для дилеров" />
      </Head>

      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title level={2}>Управление чек-листами</Title>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreate}
          >
            Создать чек-лист
          </Button>
        </div>
        <Text type="secondary">
          Здесь вы можете создавать, редактировать и отслеживать выполнение чек-листов
        </Text>
      </div>

      <Card>
        <Table
          dataSource={checklists}
          columns={columns}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `Всего ${total} чек-листов`,
          }}
        />
      </Card>

      <Modal
        title={isEditing ? 'Редактировать чек-лист' : 'Создать чек-лист'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={handleModalCancel}
        okText={isEditing ? 'Сохранить' : 'Создать'}
        cancelText="Отмена"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="title"
            label="Название"
            rules={[{ required: true, message: 'Пожалуйста, введите название!' }]}
          >
            <Input placeholder="Введите название чек-листа" />
          </Form.Item>

          <Form.Item
            name="description"
            label="Описание"
          >
            <TextArea 
              rows={4} 
              placeholder="Введите описание чек-листа" 
              maxLength={500}
              showCount
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ChecklistsPage;