'use client';

import React, { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { Layout, Row, Col, Card, Typography, Button, Breadcrumb } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { RootState } from '@/store';

const { Title, Text, Paragraph } = Typography;
const { Content } = Layout;

const SettingsPage: React.FC = () => {
  const router = useRouter();
  const { isAuthenticated } = useSelector((state: RootState) => state.auth);

  useEffect(() => {
    const token = localStorage.getItem('accessToken');
    if (!token && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, router]);

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Head><title>Настройки</title></Head>
      <Content style={{ padding: 24 }}>
        <Row justify="center">
          <Col xs={24} lg={16}>
            <Button
              icon={<ArrowLeftOutlined />}
              onClick={() => router.back()}
              style={{ marginBottom: 16 }}
            >
              Назад
            </Button>
            <Breadcrumb
              style={{ marginBottom: 16 }}
              items={[
                { title: <Link href="/">Главная</Link> },
                { title: 'Настройки' },
              ]}
            />

            <Title level={3}>Настройки</Title>

            <Card title="Оформление">
              <Paragraph>
                Переключение темы (светлая / тёмная) теперь выполняется
                иконкой&nbsp;
                <Text strong>☀️ / 🌙</Text>
                &nbsp;в правом верхнем углу панели управления. Выбранная
                тема сохраняется в браузере и применяется мгновенно.
              </Paragraph>
            </Card>

            <Card title="Дополнительные настройки" style={{ marginTop: 24 }}>
              <Text type="secondary">
                Здесь в будущем появятся оповещения, безопасность и управление
                интеграциями.
              </Text>
            </Card>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
};

export default SettingsPage;
