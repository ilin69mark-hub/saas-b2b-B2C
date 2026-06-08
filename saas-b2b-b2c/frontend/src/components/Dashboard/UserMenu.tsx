'use client';

import React, { useMemo } from 'react';
import { Dropdown, Avatar, theme as antdTheme } from 'antd';
import type { MenuProps } from 'antd';
import { useRouter } from 'next/router';
import { useDispatch, useSelector } from 'react-redux';
import {
  UserOutlined,
  SettingOutlined,
  LogoutOutlined,
  ProfileOutlined,
} from '@ant-design/icons';
import { logout } from '@/store/authSlice';
import { useThemeMode } from '@/components/ThemeProvider';
import type { RootState } from '@/store';
import type { User } from '@/types';

interface UserMenuProps {
  user?: User | null;
}

const getInitials = (user: User | null | undefined): string => {
  if (!user) return '?';
  const f = (user.first_name || '').trim();
  const l = (user.last_name || '').trim();
  if (f || l) {
    return ((f[0] || '') + (l[0] || '')).toUpperCase() || '?';
  }
  if (user.email) {
    return user.email[0].toUpperCase();
  }
  return '?';
};

const UserMenu: React.FC<UserMenuProps> = ({ user }) => {
  const router = useRouter();
  const dispatch = useDispatch();
  const { token } = antdTheme.useToken();
  const { theme: themeName } = useThemeMode();
  const authUser = useSelector((state: RootState) => state.auth.user);
  const currentUser = user ?? authUser ?? null;

  const handleProfile = () => {
    router.push('/profile');
  };

  const handleSettings = () => {
    router.push('/settings');
  };

  const handleLogout = () => {
    dispatch(logout());
    router.push('/login');
  };

  const items: MenuProps['items'] = useMemo(
    () => [
      {
        key: 'profile',
        icon: <ProfileOutlined />,
        label: 'Профиль',
        onClick: handleProfile,
      },
      {
        key: 'settings',
        icon: <SettingOutlined />,
        label: 'Настройки',
        onClick: handleSettings,
      },
      { type: 'divider' },
      {
        key: 'logout',
        icon: <LogoutOutlined />,
        label: 'Выйти',
        onClick: handleLogout,
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, dispatch]
  );

  const initials = getInitials(currentUser);
  const hasName = Boolean(currentUser?.first_name || currentUser?.last_name);

  return (
    <Dropdown menu={{ items }} placement="bottomRight" trigger={['click']}>
      <div
        role="button"
        aria-label="Меню пользователя"
        style={{
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          color: themeName === 'dark' ? '#fff' : undefined,
        }}
      >
        <Avatar
          style={{
            backgroundColor: token.colorPrimary,
            color: '#fff',
            fontWeight: 600,
          }}
        >
          {hasName ? initials : <UserOutlined />}
        </Avatar>
      </div>
    </Dropdown>
  );
};

export default UserMenu;
