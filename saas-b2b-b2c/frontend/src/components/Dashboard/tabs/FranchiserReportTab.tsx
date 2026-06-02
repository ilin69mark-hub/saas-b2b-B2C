import React, { useState } from 'react';
import { Row, Col, Card, Table, Tag, Typography, Space, Button, Select, Checkbox, Input, Modal, message, Divider, Statistic, DatePicker } from 'antd';
import { 
  DownloadOutlined,
  MailOutlined,
  SaveOutlined,
  HistoryOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import { useGetReportDataQuery } from '@/services/userApi';
import type { ReportDataResponse } from '@/types';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TextArea } = Input;

interface ReportBlock {
  key: string;
  title: string;
  enabled: boolean;
}

const defaultBlocks: ReportBlock[] = [
  { key: 'executive', title: 'Ключевые показатели', enabled: true },
  { key: 'planFact', title: 'График План-Факт', enabled: true },
  { key: 'growth', title: 'Анализ роста сети', enabled: true },
  { key: 'structure', title: 'Структура продаж', enabled: true },
  { key: 'territories', title: 'Рейтинг территорий', enabled: true },
  { key: 'risks', title: 'Ключевые риски', enabled: true },
  { key: 'proposals', title: 'Предложения', enabled: true },
];

const FranchiserReportTab: React.FC = () => {
  const [period, setPeriod] = useState('quarter');
  const [date, setDate] = useState('2026-Q2');
  const [customDates, setCustomDates] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [blocks, setBlocks] = useState<ReportBlock[]>(defaultBlocks);
  const [proposals, setProposals] = useState('');
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [sendReportId, setSendReportId] = useState('');
  const [sendEmails, setSendEmails] = useState('');
  const [selectedBlock, setSelectedBlock] = useState<string | null>(null);
  const [comment, setComment] = useState('');

  const getDateOptions = (p: string) => {
    const y = new Date().getFullYear();
    const years = [y - 1, y, y + 1];

    switch (p) {
      case 'month': {
        const months = [
          'Январь','Февраль','Март','Апрель','Май','Июнь',
          'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'
        ];
        return years.flatMap(yy =>
          months.map((m, i) => ({
            value: `${yy}-${String(i + 1).padStart(2, '0')}`,
            label: `${m} ${yy}`,
          }))
        );
      }
      case 'quarter':
        return years.flatMap(yy =>
          [1, 2, 3, 4].map(q => ({
            value: `${yy}-Q${q}`,
            label: `Q${q} ${yy}`,
          }))
        );
      case 'year':
        return years.map(yy => ({
          value: `${yy}`,
          label: `${yy}`,
        }));
      default:
        return [];
    }
  };

  const handlePeriodChange = (newPeriod: string) => {
    setPeriod(newPeriod);
    if (newPeriod !== 'custom') {
      const opts = getDateOptions(newPeriod);
      if (opts.length > 0) {
        setDate(opts[0].value);
      }
      setCustomDates(null);
    } else {
      setCustomDates([dayjs().subtract(30, 'day'), dayjs()]);
    }
  };

  const queryParams = period === 'custom'
    ? { period, start_date: customDates?.[0]?.format('YYYY-MM-DD') ?? '', end_date: customDates?.[1]?.format('YYYY-MM-DD') ?? '' }
    : { period, date };

  const { data: report, isLoading } = useGetReportDataQuery(queryParams);

  const handleBlockToggle = (key: string) => {
    setBlocks(blocks.map(b => b.key === key ? { ...b, enabled: !b.enabled } : b));
  };

  const handleAddComment = (blockKey: string) => {
    setSelectedBlock(blockKey);
    setCommentModalOpen(true);
  };

  const handleSaveDraft = () => {
    message.success('Черновик сохранён');
  };

  const handleGeneratePdf = async () => {
    const token = localStorage.getItem('accessToken');
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    message.loading({ content: 'Генерация PDF...', key: 'pdf' });

    try {
      const body: Record<string, unknown> = {
        period,
        blocks: enabledBlocks.map(b => b.key),
        comment: proposals,
      };

      if (period === 'custom') {
        body.start_date = customDates?.[0]?.format('YYYY-MM-DD') ?? '';
        body.end_date = customDates?.[1]?.format('YYYY-MM-DD') ?? '';
        body.date = '';
      } else {
        body.date = date;
      }

      const res = await fetch(`${baseUrl}/api/v1/franchiser/report/generate-pdf`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new Error('Ошибка генерации PDF');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-${period}-${date}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      message.success({ content: 'PDF скачан', key: 'pdf' });
    } catch {
      message.error({ content: 'Ошибка генерации PDF', key: 'pdf' });
    }
  };

  const handleSend = async () => {
    const token = localStorage.getItem('accessToken');
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';

    message.loading({ content: 'Генерация PDF...', key: 'send' });

    try {
      const body: Record<string, unknown> = { period, blocks: enabledBlocks.map(b => b.key), comment: proposals };
      if (period === 'custom') {
        body.start_date = customDates?.[0]?.format('YYYY-MM-DD') ?? '';
        body.end_date = customDates?.[1]?.format('YYYY-MM-DD') ?? '';
        body.date = '';
      } else {
        body.date = date;
      }

      const res = await fetch(`${baseUrl}/api/v1/franchiser/report/save-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error('Ошибка сохранения PDF');

      const data = await res.json();
      setSendReportId(data.report_id);
      setSendEmails('');
      setSendModalOpen(true);
      message.success({ content: 'PDF сохранён', key: 'send' });
    } catch {
      message.error({ content: 'Ошибка при подготовке отчёта', key: 'send' });
    }
  };

  const handleConfirmSend = async () => {
    const token = localStorage.getItem('accessToken');
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
    const recipients = sendEmails.split(',').map(e => e.trim()).filter(Boolean);

    if (recipients.length === 0) {
      message.warning('Укажите хотя бы один email');
      return;
    }

    message.loading({ content: 'Отправка...', key: 'send' });

    try {
      const res = await fetch(`${baseUrl}/api/v1/franchiser/report/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ report_id: sendReportId, recipients }),
      });

      if (!res.ok) throw new Error('Ошибка отправки');

      message.success({ content: 'Отчёт отправлен', key: 'send' });
      setSendModalOpen(false);
    } catch {
      message.error({ content: 'Ошибка отправки', key: 'send' });
    }
  };

  const enabledBlocks = blocks.filter(b => b.enabled);

  const territoryColumns = [
    { title: 'Менеджер', dataIndex: 'manager', key: 'manager', align: 'center' },
    { title: '% плана', dataIndex: 'plan_percent', key: 'plan_percent', align: 'center', render: (v: number) => <Tag color={v >= 90 ? 'green' : v >= 70 ? 'orange' : 'red'}>{v}%</Tag> },
    { title: 'Дилеров', dataIndex: 'dealers_count', key: 'dealers_count', align: 'center' },
    { title: 'Прирост', dataIndex: 'growth', key: 'growth', align: 'center', render: (v: number) => <Text type={v >= 0 ? 'success' : 'danger'}>{v > 0 ? '+' : ''}{v}</Text> },
    { title: 'Прогноз', dataIndex: 'forecast', key: 'forecast', align: 'center', render: (v: number) => <Tag color={v >= 90 ? 'green' : v >= 70 ? 'orange' : 'red'}>{v}%</Tag> },
  ];

  const renderBlock = (blockKey: string) => {
    if (!report) return null;
    const { executive_summary, plan_fact_dynamics, network_growth, sales_structure, territory_rating, risks } = report;

    switch (blockKey) {
      case 'executive':
        return (
          <Card size="small" title="Ключевые показатели" extra={<Button size="small" type="link" onClick={() => handleAddComment('executive')}>Комментарий</Button>}>
            <Row gutter={16}>
              <Col span={6}>
                <Statistic title="План сети" value={Math.round(executive_summary.plan_amount)} suffix="₽" valueStyle={{ fontSize: 18 }} />
              </Col>
              <Col span={6}>
                <Statistic title="Факт" value={Math.round(executive_summary.fact_amount)} suffix="₽" valueStyle={{ fontSize: 18 }} />
                <Text type="secondary">{Math.round(executive_summary.fact_amount / executive_summary.plan_amount * 100)}%</Text>
              </Col>
              <Col span={6}>
                <Statistic title="Прогноз" value={Math.round(executive_summary.forecast_amount)} suffix="₽" valueStyle={{ fontSize: 18 }} />
                <Text>{executive_summary.forecast_percent}%</Text>
              </Col>
              <Col span={6}>
                <Space>
                  <Text strong>Тренд:</Text>
                  <Tag color={executive_summary.trend === 'up' ? 'green' : executive_summary.trend === 'down' ? 'red' : 'orange'}>
                    {executive_summary.trend === 'up' ? 'Рост' : executive_summary.trend === 'down' ? 'Падение' : 'Стабильно'}
                  </Tag>
                </Space>
              </Col>
            </Row>
            <Divider />
            <Paragraph>
              <Text strong>Вывод:</Text> {executive_summary.conclusion}
            </Paragraph>
          </Card>
        );
      case 'planFact':
        return (
          <Card size="small" title="График План-Факт динамика" extra={<Button size="small" type="link" onClick={() => handleAddComment('planFact')}>Комментарий</Button>}>
            <Table
              dataSource={plan_fact_dynamics}
              columns={[
                { title: 'Месяц', dataIndex: 'month', key: 'month', align: 'center' },
                { title: 'План', dataIndex: 'plan', key: 'plan', align: 'center', render: (v: number) => Math.round(v).toLocaleString('ru-RU') + ' ₽' },
                { title: 'Факт', dataIndex: 'fact', key: 'fact', align: 'center', render: (v: number) => Math.round(v).toLocaleString('ru-RU') + ' ₽' },
                { title: '%', key: 'pct', align: 'center', render: (_: any, r: typeof plan_fact_dynamics[0]) => r.plan > 0 ? `${Math.round(r.fact / r.plan * 100)}%` : '—' },
              ]}
              rowKey="month"
              pagination={false}
              size="small"
            />
          </Card>
        );
      case 'growth':
        return (
          <Card size="small" title="Анализ роста сети" extra={<Button size="small" type="link" onClick={() => handleAddComment('growth')}>Комментарий</Button>}>
            <Row gutter={16}>
              <Col span={4} style={{ textAlign: 'center' }}>
                <Statistic title="Дилеров на начало" value={network_growth.dealers_start} />
              </Col>
              <Col span={4} style={{ textAlign: 'center' }}>
                <Statistic title="Привлечено новых" value={network_growth.new_dealers} valueStyle={{ color: '#52c41a' }} />
              </Col>
              <Col span={4} style={{ textAlign: 'center' }}>
                <Statistic title="Выбыло" value={network_growth.churned_dealers} valueStyle={{ color: '#ff4d4f' }} />
              </Col>
              <Col span={4} style={{ textAlign: 'center' }}>
                <Statistic title="Дилеров на конец" value={network_growth.dealers_end} />
              </Col>
              <Col span={4} style={{ textAlign: 'center' }}>
                <Statistic title="Средняя выручка" value={Math.round(network_growth.avg_revenue_per_dealer)} suffix="₽" valueStyle={{ fontSize: 18 }} />
                <Text type={network_growth.revenue_dynamics >= 0 ? 'success' : 'danger'}>
                  {network_growth.revenue_dynamics >= 0 ? '+' : ''}{network_growth.revenue_dynamics}%
                </Text>
              </Col>
              <Col span={4} style={{ textAlign: 'center' }}>
                <Statistic title="Прирост сети" value={network_growth.dealers_end - network_growth.dealers_start} suffix="дилеров" valueStyle={{ fontSize: 18 }} />
              </Col>
            </Row>
          </Card>
        );
      case 'structure':
        return (
          <Card size="small" title="Структура продаж" extra={<Button size="small" type="link" onClick={() => handleAddComment('structure')}>Комментарий</Button>}>
            <Table
              dataSource={sales_structure}
              columns={[
                { title: 'Категория', dataIndex: 'category', key: 'category', align: 'center' },
                { title: 'Доля', dataIndex: 'share', key: 'share', align: 'center', render: (v: number) => `${v}%` },
                { title: 'Динамика', dataIndex: 'dynamics', key: 'dynamics', align: 'center', render: (v: number) => <Text type={v > 0 ? 'success' : v < 0 ? 'danger' : 'secondary'}>{v > 0 ? '+' : ''}{v}%</Text> },
              ]}
              rowKey="category"
              pagination={false}
              size="small"
            />
          </Card>
        );
      case 'territories':
        return (
          <Card size="small" title="Рейтинг территорий" extra={<Button size="small" type="link" onClick={() => handleAddComment('territories')}>Комментарий</Button>}>
            <Table
              dataSource={[...territory_rating].sort((a, b) => b.plan_percent - a.plan_percent)}
              columns={territoryColumns}
              rowKey="manager"
              pagination={false}
              size="small"
            />
            <Divider />
            <Space>
              <Tag color="green">Топ-3</Tag>: {territory_rating.slice(0, 3).map(t => t.manager).join(', ')}
            </Space>
          </Card>
        );
      case 'risks':
        return (
          <Card size="small" title="Ключевые риски" extra={<Button size="small" type="link" onClick={() => handleAddComment('risks')}>Комментарий</Button>}>
            <Table
              dataSource={risks}
              columns={[
                { title: 'Проблема', dataIndex: 'issue', key: 'issue' },
                { title: 'Затронуто дилеров', dataIndex: 'affected_dealers', key: 'affected_dealers', align: 'center' },
                { title: 'Упущенная выручка', dataIndex: 'impact', key: 'impact', align: 'center', render: (v: number) => <Text type="danger">{Math.round(v).toLocaleString('ru-RU')} ₽</Text> },
              ]}
              rowKey="issue"
              pagination={false}
              size="small"
            />
          </Card>
        );
      case 'proposals':
        return (
          <Card size="small" title="Предложения и запрос ресурсов" extra={<Button size="small" type="link" onClick={() => handleAddComment('proposals')}>Комментарий</Button>}>
            <TextArea 
              value={proposals} 
              onChange={(e) => setProposals(e.target.value)} 
              placeholder="Что нужно от руководства (бюджет, изменение условий, кадровые решения)..."
              rows={4}
              style={{ width: '100%' }}
            />
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <Title level={4}>Отчёт для B2B</Title>

      <Space style={{ marginBottom: 16 }} wrap>
        <Select value={period} onChange={handlePeriodChange} style={{ width: 140 }}>
          <Option value="month">Месяц</Option>
          <Option value="quarter">Квартал</Option>
          <Option value="year">Год</Option>
          <Option value="custom">Произвольный</Option>
        </Select>

        {period === 'custom' ? (
          <DatePicker.RangePicker
            value={customDates as [dayjs.Dayjs, dayjs.Dayjs]}
            onChange={(dates) => setCustomDates(dates as [dayjs.Dayjs, dayjs.Dayjs])}
            format="DD.MM.YYYY"
            allowClear={false}
          />
        ) : (
          <Select value={date} onChange={setDate} style={{ width: 160 }}>
            {getDateOptions(period).map(opt => (
              <Option key={opt.value} value={opt.value}>{opt.label}</Option>
            ))}
          </Select>
        )}
        <Button icon={<HistoryOutlined />} onClick={() => setHistoryModalOpen(true)}>История</Button>
      </Space>

      <Card style={{ marginBottom: 16 }}>
        <Text strong>Блоки отчёта:</Text>
        <Space style={{ marginLeft: 16 }}>
          {blocks.map(block => (
            <Checkbox key={block.key} checked={block.enabled} onChange={() => handleBlockToggle(block.key)}>
              {block.title}
            </Checkbox>
          ))}
        </Space>
      </Card>

      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<FilePdfOutlined />} onClick={handleGeneratePdf}>Сформировать PDF</Button>
        <Button icon={<MailOutlined />} onClick={handleSend}>Отправить руководителю</Button>
        <Button icon={<SaveOutlined />} onClick={handleSaveDraft}>Сохранить черновик</Button>
      </Space>

      <Divider />

      {isLoading && <Text>Загрузка данных отчёта...</Text>}

      {!isLoading && report && enabledBlocks.map(block => (
        <div key={block.key} style={{ marginBottom: 16 }}>
          {renderBlock(block.key)}
        </div>
      ))}

      {!isLoading && !report && (
        <Text type="secondary">Нет данных для выбранного периода</Text>
      )}

      <Modal
        title="История отчётов"
        open={historyModalOpen}
        onCancel={() => setHistoryModalOpen(false)}
        footer={null}
        width={600}
      >
        <Table
          dataSource={[
            { id: '1', date: '2026-Q1', createdAt: '2026-03-31', sent: true },
            { id: '2', date: '2025-Q4', createdAt: '2025-12-31', sent: true },
            { id: '3', date: '2025-Q3', createdAt: '2025-09-30', sent: true },
          ]}
          columns={[
            { title: 'Период', dataIndex: 'date', key: 'date' },
            { title: 'Создан', dataIndex: 'createdAt', key: 'createdAt' },
            { title: 'Статус', key: 'status', render: () => <Tag color="green">Отправлен</Tag> },
            { title: 'Действие', key: 'action', render: () => <Button size="small">Загрузить</Button> },
          ]}
          rowKey="id"
          pagination={false}
          size="small"
        />
      </Modal>

      <Modal
        title="Отправить руководителю"
        open={sendModalOpen}
        onCancel={() => setSendModalOpen(false)}
        onOk={handleConfirmSend}
        okText="Отправить"
        cancelText="Отмена"
      >
        <Text>Введите email получателей через запятую:</Text>
        <Input
          value={sendEmails}
          onChange={(e) => setSendEmails(e.target.value)}
          placeholder="director@company.ru, manager@company.ru"
          style={{ marginTop: 8, width: '100%' }}
        />
      </Modal>

      <Modal
        title="Добавить комментарий"
        open={commentModalOpen}
        onCancel={() => setCommentModalOpen(false)}
        onOk={() => { message.success('Комментарий сохранён'); setCommentModalOpen(false); }}
      >
        <TextArea 
          value={comment} 
          onChange={(e) => setComment(e.target.value)} 
          placeholder="Комментарий к блоку..."
          rows={3}
          style={{ width: '100%' }}
        />
      </Modal>
    </div>
  );
};

export default FranchiserReportTab;