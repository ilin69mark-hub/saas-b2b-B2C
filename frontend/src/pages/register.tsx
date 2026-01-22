import React from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useRouter } from 'next/router';
import { Card, Form, Input, Button, Select, Alert, Spin } from 'antd';
import { UserOutlined, MailOutlined, LockOutlined, ShopOutlined } from '@ant-design/icons';
import { RootState, AppDispatch } from '../store';
import { register } from '../store/authSlice';
import Head from 'next/head';

const { Option } = Select;

const RegisterPage: React.FC = () => {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { loading, error, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const [form] = Form.useForm();

  const onFinish = async (values: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    tenantId: string;
    role: string;
  }) => {
    try {
      const registerData = {
        email: values.email,
        password: values.password,
        first_name: values.firstName,
        last_name: values.lastName,
        tenant_id: values.tenantId,
        role: values.role,
      };
      
      await dispatch(register(registerData)).unwrap();
      // Redirect to login after successful registration
      router.push('/login');
    } catch (err) {
      console.error('Registration failed:', err);
    }
  };

  // If already authenticated, redirect to dashboard
  React.useEffect(() => {
    if (isAuthenticated) {
      router.push('/');
    }
  }, [isAuthenticated, router]);

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)'
    }}>
      <Head>
        <title>Регистрация | Платформа управления франчайзингом</title>
        <meta name="description" content="Регистрация в системе управления франчайзингом" />
      </Head>

      <Card 
        title="Создать аккаунт" 
        style={{ width: 450, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
      >
        <Form
          form={form}
          name="register_form"
          initialValues={{ role: 'dealer', tenantId: 'main-network' }}
          onFinish={onFinish}
          labelCol={{ span: 24 }}
          wrapperCol={{ span: 24 }}
        >
          {error && (
            <Form.Item>
              <Alert message="Ошибка" description={error} type="error" showIcon />
            </Form.Item>
          )}

          <Form.Item
            name="firstName"
            label="Имя"
            rules={[{ required: true, message: 'Пожалуйста, введите ваше имя!' }]}
          >
            <Input 
              prefix={<UserOutlined />} 
              placeholder="Ваше имя" 
              disabled={loading}
            />
          </Form.Item>

          <Form.Item
            name="lastName"
            label="Фамилия"
            rules={[{ required: true, message: 'Пожалуйста, введите вашу фамилию!' }]}
          >
            <Input 
              prefix={<UserOutlined />} 
              placeholder="Ваша фамилия" 
              disabled={loading}
            />
          </Form.Item>

          <Form.Item
            name="email"
            label="Email"
            rules={[
              { 
                required: true, 
                message: 'Пожалуйста, введите ваш email!' 
              },
              { 
                type: 'email', 
                message: 'Введите корректный email адрес!' 
              }
            ]}
          >
            <Input 
              prefix={<MailOutlined />} 
              placeholder="Email" 
              disabled={loading}
            />
          </Form.Item>

          <Form.Item
            name="password"
            label="Пароль"
            rules={[{ required: true, message: 'Пожалуйста, введите ваш пароль!' }]}
          >
            <Input.Password 
              prefix={<LockOutlined />} 
              placeholder="Пароль" 
              disabled={loading}
            />
          </Form.Item>

          <Form.Item
            name="tenantId"
            label="ID сети"
            rules={[{ required: true, message: 'Пожалуйста, введите ID сети!' }]}
          >
            <Input 
              prefix={<ShopOutlined />} 
              placeholder="ID франчайзинговой сети" 
              disabled={loading}
            />
          </Form.Item>

          <Form.Item
            name="role"
            label="Роль"
            rules={[{ required: true, message: 'Пожалуйста, выберите вашу роль!' }]}
          >
            <Select disabled={loading}>
              <Option value="dealer">Дилер</Option>
              <Option value="franchiser">Франчайзер</Option>
              <Option value="manager">Менеджер</Option>
            </Select>
          </Form.Item>

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              block 
              loading={loading}
              icon={loading ? <Spin size="small" /> : null}
            >
              {loading ? 'Регистрация...' : 'Зарегистрироваться'}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <p>
            Уже есть аккаунт?{' '}
            <Button 
              type="link" 
              onClick={() => router.push('/login')}
              style={{ padding: 0 }}
            >
              Войти
            </Button>
          </p>
        </div>
      </Card>
    </div>
  );
};

export default RegisterPage;