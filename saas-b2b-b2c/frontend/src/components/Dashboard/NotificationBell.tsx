import React, { useState, useEffect, useCallback } from 'react';
import { Badge, Dropdown, List, Button, Spin, Empty, Tag, Tooltip } from 'antd';
import { BellOutlined, WarningOutlined, ExclamationCircleOutlined, InfoCircleOutlined, CloseOutlined, LinkOutlined } from '@ant-design/icons';
import apiClient from '@/api/axiosClient';
import { useThemeMode } from '@/components/ThemeProvider';
import { useRouter } from 'next/router';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: string;
  is_read: boolean;
  created_at: string;
  data?: string;
  tenant_id?: string;
  user_id?: string | null;
}

type Severity = 'critical' | 'warning' | 'info';

const TYPE_META: Record<string, { label: string; severity: Severity }> = {
  payment:     { label: 'Платёж',     severity: 'warning' },
  system:      { label: 'Система',     severity: 'info' },
  maintenance: { label: 'Техработы',  severity: 'warning' },
  overdue_measurement: { label: 'Замер',     severity: 'critical' },
  abandoned_kp:        { label: 'КП',        severity: 'warning' },
  conversion_drop:     { label: 'Конверсия', severity: 'critical' },
  traffic_drop:        { label: 'Трафик',    severity: 'warning' },
  dealer_no_orders:    { label: 'Заказы',    severity: 'warning' },
  dealer_new_salon:    { label: 'Салон',     severity: 'info' },
  dealer_no_reports:   { label: 'Отчёты',    severity: 'warning' },
  dealer_no_salons:    { label: 'Салоны',    severity: 'critical' },
  territory_weekly_summary: { label: 'Сводка', severity: 'info' },
};

const POLL_INTERVAL = 2 * 60 * 1000;

const NotificationBell: React.FC = () => {
  const router = useRouter();
  const { theme: themeName } = useThemeMode();
  const isDark = themeName === 'dark';

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const ddBg = isDark ? '#1f1f1f' : '#fff';
  const ddBorder = isDark ? '#303030' : '#f0f0f0';
  const textSecondary = isDark ? '#888' : '#999';
  const itemBgRead = isDark ? '#262626' : '#fff';
  const itemBgUnread = isDark ? '#3a2a14' : '#fff7e6';

  const fetchAlerts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/alerts');
      const data = res.data || {};
      setNotifications(Array.isArray(data.alerts) ? data.alerts : []);
      setUnreadCount(data.unread_count || 0);
    } catch (e) {
      console.error('Error fetching alerts:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAlerts();
    const id = setInterval(fetchAlerts, POLL_INTERVAL);
    return () => clearInterval(id);
  }, [fetchAlerts]);

  const handleMarkRead = async (alertId: string) => {
    try {
      await apiClient.patch(`/alerts/${alertId}/read`);
      setNotifications(prev =>
        prev.map(a => (a.id === alertId ? { ...a, is_read: true } : a))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) {
      console.error('Error marking alert as read:', e);
    }
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read);
    await Promise.all(unread.map(n => handleMarkRead(n.id)));
  };

  const getTypeMeta = (type: string) =>
    TYPE_META[type] || { label: type || 'Уведомление', severity: 'info' as Severity };

  const getSeverityColor = (severity: Severity) => {
    switch (severity) {
      case 'critical': return '#ff4d4f';
      case 'warning': return '#faad14';
      default: return '#1890ff';
    }
  };

  const getSeverityIcon = (severity: Severity) => {
    switch (severity) {
      case 'critical': return <WarningOutlined style={{ color: '#ff4d4f' }} />;
      case 'warning': return <ExclamationCircleOutlined style={{ color: '#faad14' }} />;
      default: return <InfoCircleOutlined style={{ color: '#1890ff' }} />;
    }
  };

  const parseLink = (data?: string): string | undefined => {
    if (!data) return undefined;
    try {
      const p = JSON.parse(data);
      if (p.link) return p.link;
      if (p.dealer_id) return `/dealer/${p.dealer_id}`;
      if (p.lead_id) return `/leads/${p.lead_id}`;
    } catch {
      return undefined;
    }
    return undefined;
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Только что';
    if (diffMins < 60) return `${diffMins} мин назад`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} ч назад`;
    return date.toLocaleDateString('ru-RU');
  };

  const renderItem = (item: Notification) => {
    const meta = getTypeMeta(item.type);
    const link = parseLink(item.data);
    return (
      <List.Item
        style={{
          padding: '12px',
          background: item.is_read ? itemBgRead : itemBgUnread,
          borderLeft: `3px solid ${getSeverityColor(meta.severity)}`,
          opacity: item.is_read ? 0.6 : 1,
        }}
      >
        <List.Item.Meta
          avatar={getSeverityIcon(meta.severity)}
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 600 }}>{item.title}</span>
              <Tag color={meta.severity === 'critical' ? 'error' : meta.severity === 'warning' ? 'warning' : 'blue'}>
                {meta.label}
              </Tag>
            </div>
          }
          description={
            <div>
              <div>{item.message}</div>
              <div style={{ fontSize: 11, color: textSecondary, marginTop: 4 }}>
                {formatTime(item.created_at)}
              </div>
            </div>
          }
        />
        <div style={{ display: 'flex', gap: 8 }}>
          {link && (
            <Tooltip title="Перейти">
              <Button
                size="small"
                icon={<LinkOutlined />}
                onClick={() => router.push(link)}
              />
            </Tooltip>
          )}
          {!item.is_read && (
            <Tooltip title="Закрыть">
              <Button
                size="small"
                icon={<CloseOutlined />}
                onClick={() => handleMarkRead(item.id)}
              />
            </Tooltip>
          )}
        </div>
      </List.Item>
    );
  };

  const dropdownContent = (
    <div
      style={{
        width: 360,
        maxHeight: 500,
        overflowY: 'auto',
        background: ddBg,
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        borderRadius: 8,
        color: isDark ? '#e5e5e5' : undefined,
      }}
    >
      <div
        style={{
          padding: '12px 16px',
          fontWeight: 'bold',
          borderBottom: `1px solid ${ddBorder}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span>Уведомления</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {unreadCount > 0 && (
            <Button size="small" type="link" onClick={handleMarkAllRead}>
              Прочитать все
            </Button>
          )}
          <Tag color="red">{unreadCount}</Tag>
        </div>
      </div>
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Spin />
        </div>
      ) : notifications.length === 0 ? (
        <Empty description="Нет уведомлений" style={{ padding: 40 }} />
      ) : (
        <List dataSource={notifications} renderItem={renderItem} />
      )}
    </div>
  );

  return (
    <Dropdown
      popupRender={() => dropdownContent}
      trigger={['click']}
      placement="bottomRight"
    >
      <Badge
        count={unreadCount}
        size="small"
        offset={[-10, -8]}
        style={{ cursor: 'pointer', backgroundColor: unreadCount > 0 ? '#ff4d4f' : undefined }}
      >
        <BellOutlined
          style={{
            fontSize: 18,
            cursor: 'pointer',
            color: unreadCount > 0 ? '#ff4d4f' : undefined,
          }}
        />
      </Badge>
    </Dropdown>
  );
};

export default NotificationBell;
