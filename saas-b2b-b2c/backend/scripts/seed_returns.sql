-- Очищаем старые возвраты
DELETE FROM dealer_requests WHERE type = 'return';

-- Генерируем 90 возвратов напрямую (9 дилеров × 10 шт)
INSERT INTO dealer_requests (id, dealer_id, type, description, amount, status, reason, created_at, updated_at)
SELECT
  gen_random_uuid(),
  u.id,
  'return',
  CASE ((row_number() OVER ()) % 12)
    WHEN 0 THEN 'Кухня «Классика»'
    WHEN 1 THEN 'Диван «Престиж»'
    WHEN 2 THEN 'Матрас «Ортопед»'
    WHEN 3 THEN 'Кухня «Лофт»'
    WHEN 4 THEN 'Шкаф «Гармония»'
    WHEN 5 THEN 'Стол «Стиль»'
    WHEN 6 THEN 'Диван «Комфорт»'
    WHEN 7 THEN 'Матрас «Дуо»'
    WHEN 8 THEN 'Кухня «Модерн»'
    WHEN 9 THEN 'Кресло «Эко»'
    WHEN 10 THEN 'Стенка «Практик»'
    WHEN 11 THEN 'Матрас «Релакс»'
  END,
  CASE ((row_number() OVER ()) % 6)
    WHEN 0 THEN (RANDOM() * 150000 + 50000)::numeric(15,2)
    WHEN 1 THEN (RANDOM() * 100000 + 30000)::numeric(15,2)
    WHEN 2 THEN (RANDOM() * 80000 + 20000)::numeric(15,2)
    WHEN 3 THEN (RANDOM() * 50000 + 10000)::numeric(15,2)
    WHEN 4 THEN (RANDOM() * 40000 + 15000)::numeric(15,2)
    WHEN 5 THEN (RANDOM() * 60000 + 20000)::numeric(15,2)
  END,
  (ARRAY['approved', 'approved', 'approved', 'approved', 'pending', 'pending', 'pending', 'rejected', 'rejected'])[1 + (RANDOM() * 8)::int],
  CASE
    WHEN RANDOM() < 0.30 THEN 'Брак производства'
    WHEN RANDOM() < 0.55 THEN 'Повреждение при доставке'
    WHEN RANDOM() < 0.75 THEN 'Несоответствие заказу'
    WHEN RANDOM() < 0.90 THEN 'Гарантийный случай'
    ELSE 'Другое'
  END,
  NOW() - (RANDOM() * INTERVAL '180 days'),
  NOW() - (RANDOM() * INTERVAL '180 days')
FROM users u
CROSS JOIN generate_series(1, 10)
WHERE u.role = 'dealer';

-- Проверка
SELECT reason, COUNT(*) AS cnt FROM dealer_requests WHERE type='return' GROUP BY reason ORDER BY cnt DESC;
SELECT status, COUNT(*) AS cnt FROM dealer_requests WHERE type='return' GROUP BY status ORDER BY cnt DESC;
SELECT u.email AS dealer, COUNT(*) AS cnt, ROUND(SUM(dr.amount)::numeric, 0) AS total
FROM dealer_requests dr JOIN users u ON u.id=dr.dealer_id WHERE dr.type='return' GROUP BY u.email ORDER BY u.email;
