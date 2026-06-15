import React, { useState } from 'react';
import { Table, Button, Space, Modal, Form, Input, Select, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { useGetEmployeesQuery, useCreateEmployeeMutation, useUpdateEmployeeMutation, useDeleteEmployeeMutation } from '@/services/userApi';
import { Employee } from '@/types';
import PhoneInput from '@/components/common/PhoneInput';
import { normalizeForApi } from '@/utils/phone';

const { Option } = Select;

const EmployeesPage: React.FC = () => {
  const { data: employees, isLoading, refetch } = useGetEmployeesQuery();
  const [createEmployee, { isLoading: isCreating }] = useCreateEmployeeMutation();
  const [updateEmployee, { isLoading: isUpdating }] = useUpdateEmployeeMutation();
  const [deleteEmployee] = useDeleteEmployeeMutation();
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form] = Form.useForm();

  const showCreateModal = () => {
    setEditingEmployee(null);
    form.resetFields();
    setIsModalVisible(true);
  };

  const showEditModal = (record: Employee) => {
    setEditingEmployee(record);
    form.setFieldsValue(record);
    setIsModalVisible(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const normalized = { ...values, phone: normalizeForApi(String(values.phone || '')) };
      if (editingEmployee) {
        await updateEmployee({ id: editingEmployee.id, data: normalized }).unwrap();
        message.success('Сотрудник обновлен');
      } else {
        await createEmployee(normalized).unwrap();
        message.success('Сотрудник создан');
      }
      setIsModalVisible(false);
    } catch (error) {
      message.error('Ошибка при сохранении');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteEmployee(id).unwrap();
      message.success('Сотрудник удален');
    } catch (error) {
      message.error('Ошибка при удалении');
    }
  };

  const columns = [
    { title: 'Имя', dataIndex: 'first_name', key: 'first_name' },
    { title: 'Фамилия', dataIndex: 'last_name', key: 'last_name' },
    { title: 'Email', dataIndex: 'email', key: 'email' },
    { title: 'Телефон', dataIndex: 'phone', key: 'phone' },
    {
      title: 'Роль',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => {
        const roleMap: Record<string, string> = {
          'franchiser_manager': 'Менеджер Франшизы',
          'dealer': 'Дилер',
          'salon_manager': 'Управляющий Салоном',
          'admin': 'Администратор'
        };
        return roleMap[role] || role;
      }
    },
    {
      title: 'Действия',
      key: 'actions',
      render: (_: any, record: Employee) => (
        <Space>
          <Button
            icon={<EditOutlined />}
            onClick={() => showEditModal(record)}
          />
          <Popconfirm
            title="Вы уверены, что хотите удалить сотрудника?"
            onConfirm={() => handleDelete(record.id)}
            okText="Да"
            cancelText="Нет"
          >
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
        <h1>Управление Сотрудниками</h1>
        <Button type="primary" icon={<PlusOutlined />} onClick={showCreateModal}>
          Добавить сотрудника
        </Button>
      </div>

      <Table
        dataSource={employees}
        columns={columns}
        rowKey="id"
        loading={isLoading}
      />

      <Modal
        title={editingEmployee ? "Редактировать сотрудника" : "Новый сотрудник"}
        visible={isModalVisible}
        onOk={handleOk}
        onCancel={() => setIsModalVisible(false)}
        confirmLoading={isCreating || isUpdating}
        okText="Сохранить"
        cancelText="Отмена"
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="first_name"
            label="Имя"
            rules={[{ required: true, message: 'Введите имя' }]}
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="last_name"
            label="Фамилия"
          >
            <Input />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[{ required: true, type: 'email', message: 'Введите корректный email' }]}
          >
            <Input disabled={!!editingEmployee} />
          </Form.Item>

          {!editingEmployee && (
            <Form.Item
              name="password"
              label="Пароль"
              rules={[{ required: true, message: 'Введите пароль' }]}
            >
              <Input.Password />
            </Form.Item>
          )}

          <Form.Item
            name="role"
            label="Роль"
            rules={[{ required: true, message: 'Выберите роль' }]}
          >
            <Select placeholder="Выберите роль">
              <Option value="franchiser_manager">Менеджер Франшизы</Option>
              <Option value="dealer">Дилер</Option>
              <Option value="salon_manager">Управляющий Салоном</Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="phone"
            label="Телефон"
          >
            <PhoneInput />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default EmployeesPage;
