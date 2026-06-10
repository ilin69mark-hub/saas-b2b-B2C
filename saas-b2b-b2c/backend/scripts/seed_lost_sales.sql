-- Заполняем disqualify_reason и interest_product для "зависших" лидов (>60 дней)
-- только для лидов, где эти поля ещё пустые

WITH product_list AS (
  SELECT array_agg(DISTINCT collection ORDER BY collection) AS names FROM product_inventory
),
numbered AS (
  SELECT id,
    ROW_NUMBER() OVER (ORDER BY created_at) AS rn,
    (SELECT COUNT(*) FROM leads WHERE status NOT IN ('sale', 'paid') AND created_at < NOW() - INTERVAL '60 days' AND (disqualify_reason IS NULL OR disqualify_reason = '')) AS total
  FROM leads
  WHERE status NOT IN ('sale', 'paid')
    AND created_at < NOW() - INTERVAL '60 days'
    AND (disqualify_reason IS NULL OR disqualify_reason = '')
),
assignments AS (
  SELECT
    n.id,
    pl.names[1 + ((n.rn - 1) % array_length(pl.names, 1))] AS assigned_product,
    CASE
      WHEN n.rn <= ROUND(n.total * 0.30) THEN 'Нет в наличии'
      WHEN n.rn <= ROUND(n.total * 0.55) THEN 'Не устроила цена'
      WHEN n.rn <= ROUND(n.total * 0.75) THEN 'Долгий срок производства'
      WHEN n.rn <= ROUND(n.total * 0.90) THEN 'Не подошёл дизайн'
      ELSE 'Другое'
    END AS assigned_reason
  FROM numbered n, product_list pl
)
UPDATE leads l SET
  interest_product = a.assigned_product,
  disqualify_reason = a.assigned_reason
FROM assignments a
WHERE l.id = a.id;

-- Проверка результата
SELECT disqualify_reason, COUNT(*) as cnt FROM leads WHERE disqualify_reason IS NOT NULL AND disqualify_reason != '' GROUP BY disqualify_reason ORDER BY cnt DESC;
