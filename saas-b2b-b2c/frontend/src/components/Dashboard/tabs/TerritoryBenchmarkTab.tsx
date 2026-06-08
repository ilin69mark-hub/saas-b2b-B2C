import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Typography, Space, Segmented, Spin, Empty, DatePicker } from 'antd';
import { TrophyOutlined, ShopOutlined } from '@ant-design/icons';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend, ResponsiveContainer, LabelList } from 'recharts';
import { useTerritoryManagerStore } from '@/store/territoryManagerStore';
import dayjs from 'dayjs';

const { Text, Title } = Typography;

const PERIOD_OPTIONS = [
  { label: 'Неделя', value: 'week' },
  { label: 'Месяц', value: 'month' },
  { label: 'Квартал', value: 'quarter' },
  { label: 'Год', value: 'year' },
  { label: 'Свой', value: 'custom' },
];

const { RangePicker } = DatePicker;

interface TerritoryBenchmarkTabProps {
  loading?: boolean;
}

const TerritoryBenchmarkTab: React.FC<TerritoryBenchmarkTabProps> = ({ loading }) => {
  const { fetchBenchmarks } = useTerritoryManagerStore();
  const [benchmarkData, setBenchmarkData] = useState<any>(null);
  const [bmLoading, setBmLoading] = useState(false);
  const [bmError, setBmError] = useState(false);
  const [period, setPeriod] = useState<string>('month');
  const [customRange, setCustomRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

  const load = useCallback(async (p: string, custom?: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setBmLoading(true);
    setBmError(false);
    try {
      let startDate: string | undefined;
      let endDate: string | undefined;
      if (p === 'custom' && custom?.[0] && custom?.[1]) {
        startDate = custom[0].format('YYYY-MM-DD');
        endDate = custom[1].format('YYYY-MM-DD');
      }
      const data = await fetchBenchmarks(p, startDate, endDate);
      if (data) {
        setBenchmarkData(data);
      } else {
        setBmError(true);
      }
    } catch {
      setBmError(true);
    }
    setBmLoading(false);
  }, [fetchBenchmarks]);

  useEffect(() => {
    load(period, customRange);
  }, [period, customRange]);

  const territoryConv = benchmarkData?.territory_conversion ?? 0;
  const territoryCheck = benchmarkData?.territory_avg_check ?? 0;
  const networkConv = benchmarkData?.network_avg_conversion ?? 0;
  const networkCheck = benchmarkData?.network_avg_check ?? 0;

  const convGap = territoryConv - networkConv;
  const checkGap = territoryCheck - networkCheck;

  const comparisonData = useMemo(() => [
    { name: 'Конверсия, %', Территория: +territoryConv.toFixed(1), Сеть: +networkConv.toFixed(1) },
    { name: 'Средний чек, тыс ₽', Территория: +(territoryCheck / 1000).toFixed(0), Сеть: +(networkCheck / 1000).toFixed(0) },
  ], [territoryConv, networkConv, territoryCheck, networkCheck]);

  const showRangePicker = period === 'custom';
  const isLoading = loading || bmLoading;

  if (bmError && !benchmarkData) {
    return (
      <div>
        <Card size="small" style={{ marginBottom: 16 }}>
          <Segmented value={period} onChange={(v) => { setPeriod(v as string); if (v !== 'custom') setCustomRange(null); }} options={PERIOD_OPTIONS} />
        </Card>
        <Card><Empty description="Ошибка загрузки данных" /></Card>
      </div>
    );
  }

  return (
    <div>
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Segmented value={period} onChange={(v) => { setPeriod(v as string); if (v !== 'custom') setCustomRange(null); }} options={PERIOD_OPTIONS} />
          {showRangePicker && (
            <RangePicker
              value={customRange as any}
              onChange={(dates: any) => setCustomRange(dates)}
            />
          )}
        </Space>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12}>
          <Card size="small">
            <Spin spinning={isLoading}>
              <Space direction="vertical" size={4} style={{ alignItems: 'center', width: '100%' }}>
                <Text type="secondary">Конверсия территории</Text>
                <Title level={3} style={{ margin: 0, color: convGap >= 0 ? '#52c41a' : '#ff4d4f' }}>
                  {territoryConv.toFixed(1)}%
                </Title>
                <Text type={convGap >= 0 ? 'success' : 'danger'}>
                  {convGap >= 0 ? '+' : ''}{convGap.toFixed(1)}% к сети
                </Text>
              </Space>
            </Spin>
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card size="small">
            <Spin spinning={isLoading}>
              <Space direction="vertical" size={4} style={{ alignItems: 'center', width: '100%' }}>
                <Text type="secondary">Средний чек территории</Text>
                <Title level={3} style={{ margin: 0, color: checkGap >= 0 ? '#52c41a' : '#ff4d4f' }}>
                  {(territoryCheck / 1000).toFixed(0)} тыс ₽
                </Title>
                <Text type={checkGap >= 0 ? 'success' : 'danger'}>
                  {checkGap >= 0 ? '+' : ''}{(checkGap / 1000).toFixed(0)} тыс ₽ к сети
                </Text>
              </Space>
            </Spin>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={12}>
          <Card size="small" style={{ background: '#f6ffed' }}>
            <Spin spinning={isLoading}>
              <Space direction="vertical" size={4} style={{ alignItems: 'center', width: '100%' }}>
                <Text type="secondary"><TrophyOutlined /> Эталон сети (конверсия)</Text>
                <Title level={3} style={{ margin: 0, color: '#52c41a' }}>
                  {networkConv.toFixed(1)}%
                </Title>
              </Space>
            </Spin>
          </Card>
        </Col>
        <Col xs={24} sm={12}>
          <Card size="small" style={{ background: '#f0f5ff' }}>
            <Spin spinning={isLoading}>
              <Space direction="vertical" size={4} style={{ alignItems: 'center', width: '100%' }}>
                <Text type="secondary"><ShopOutlined /> Эталон сети (средний чек)</Text>
                <Title level={3} style={{ margin: 0, color: '#1890ff' }}>
                  {(networkCheck / 1000).toFixed(0)} тыс ₽
                </Title>
              </Space>
            </Spin>
          </Card>
        </Col>
      </Row>

      <Card size="small" title="Сравнение с эталоном сети">
        <Spin spinning={isLoading}>
          {comparisonData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Legend />
                <Bar dataKey="Территория" fill="#1890ff" activeBar={false}>
                  <LabelList dataKey="Территория" position="inside" fill="#fff" fontWeight={600} />
                </Bar>
                <Bar dataKey="Сеть" fill="#52c41a" activeBar={false}>
                  <LabelList dataKey="Сеть" position="inside" fill="#fff" fontWeight={600} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty description="Нет данных" />
          )}
        </Spin>
      </Card>
    </div>
  );
};

export default TerritoryBenchmarkTab;
