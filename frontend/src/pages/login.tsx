import React, { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useRouter } from 'next/router';
import { Card, Form, Input, Button, Checkbox, Alert, Spin } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { RootState, AppDispatch } from '../store';
import { login } from '../store/authSlice';
import Head from 'next/head';

const LoginPage: React.FC = () => {
  const router = useRouter();
  const dispatch = useDispatch<AppDispatch>();
  const { loading, error, isAuthenticated } = useSelector((state: RootState) => state.auth);
  const [form] = Form.useForm();

  const onFinish = async (values: { email: string; password: string }) => {
    try {
      await dispatch(login(values)).unwrap();
      // Redirect based on user role
      router.push('/');
    } catch (err) {
      console.error('Login failed:', err);
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
        <title>Вход | Платформа управления франчайзингом</title>
        <meta name="description" content="Вход в систему управления франчайзингом" />
      </Head>

      <Card 
        title="Вход в систему" 
        style={{ width: 400, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
      >
        <Form
          form={form}
          name="login_form"
          initialValues={{ remember: true }}
          onFinish={onFinish}
        >
          {error && (
            <Form.Item>
              <Alert message="Ошибка" description={error} type="error" showIcon />
            </Form.Item>
          )}

          <Form.Item
            name="email"
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
              prefix={<UserOutlined />} 
              placeholder="Email" 
              disabled={loading}
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: 'Пожалуйста, введите ваш пароль!' }]}
          >
            <Input.Password 
              prefix={<LockOutlined />} 
              placeholder="Пароль" 
              disabled={loading}
            />
          </Form.Item>

          <Form.Item name="remember" valuePropName="checked">
            <Checkbox>Запомнить меня</Checkbox>
          </Form.Item>

          <Form.Item>
            <Button 
              type="primary" 
              htmlType="submit" 
              block 
              loading={loading}
              icon={loading ? <Spin size="small" /> : null}
            >
              {loading ? 'Вход...' : 'Войти'}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: '16px' }}>
          <p>
            Нет аккаунта?{' '}
            <Button 
              type="link" 
              onClick={() => router.push('/register')}
              style={{ padding: 0 }}
            >
              Зарегистрироваться
            </Button>
          </p>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;