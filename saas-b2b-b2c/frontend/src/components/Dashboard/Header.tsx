import React from 'react';
import { Layout, Typography } from 'antd';
import Link from 'next/link';
import { useThemeMode } from '@/components/ThemeProvider';

const { Header: AntHeader } = Layout;
const { Text } = Typography;

const Header: React.FC = () => {
  const { theme: themeName } = useThemeMode();
  const isDark = themeName === 'dark';
  return (
    <AntHeader style={{ background: isDark ? '#1f1f1f' : '#fff', padding: '0 24px', display: 'flex', alignItems: 'center', borderBottom: `1px solid ${isDark ? '#303030' : '#f0f0f0'}` }}>
      <Link href="/" style={{ display: 'flex', alignItems: 'center' }}>
        <Text strong style={{ fontSize: '18px', color: '#1890ff' }}>ivan.ru</Text>
      </Link>
    </AntHeader>
  );
};

export default Header;
