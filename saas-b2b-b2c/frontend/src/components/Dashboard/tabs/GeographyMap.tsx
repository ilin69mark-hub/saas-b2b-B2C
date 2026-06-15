import React from 'react';
import { Card, Table, Typography } from 'antd';
import { GlobalOutlined } from '@ant-design/icons';
import type { DealerGeographyItem } from '@/types';

const { Text } = Typography;

interface GeographyMapProps {
  geography?: DealerGeographyItem[];
}

const GeographyMap: React.FC<GeographyMapProps> = ({ geography = [] }) => {
  const columns = [
    {
      title: 'Город / Адрес',
      dataIndex: 'city',
      key: 'city',
      align: 'center',
      render: (c: string) => (
        <Text>
          <GlobalOutlined /> {c}
        </Text>
      ),
    },
    {
      title: 'Дилеров',
      dataIndex: 'dealers_count',
      key: 'dealers_count',
      align: 'center',
    },
    {
      title: 'Салоны',
      dataIndex: 'salons_count',
      key: 'salons_count',
      align: 'center',
    },
    {
      title: 'Выручка',
      dataIndex: 'total_revenue',
      key: 'total_revenue',
      align: 'center',
      render: (v: number) => Math.round(v).toLocaleString('ru-RU') + ' ₽',
    },
  ];

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Text type="secondary">
          {geography.length > 0 ? `${geography.length} городов/адресов присутствия` : 'Нет данных о географии'}
        </Text>
      </Card>
      <Table
        dataSource={geography}
        columns={columns}
        rowKey="city"
        pagination={false}
        size="small"
      />
    </div>
  );
};

export default GeographyMap;