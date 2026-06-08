-- Фикс manager_id в leads: проставляем случайного salon_manager того же салона
-- В seed лиды создавались с manager_id = dealerID, из-за чего ManagerStats (топ менеджеров)
-- не находил выручку у менеджеров салона.

UPDATE leads l
SET manager_id = sub.sm_id
FROM (
  SELECT
    l.id AS lead_id,
    (
      SELECT u.id FROM users u
      WHERE u.salon_id = l.salon_id AND u.role = 'salon_manager'
      ORDER BY random()
      LIMIT 1
    ) AS sm_id
  FROM leads l
  WHERE l.salon_id IS NOT NULL
    AND l.manager_id IS NOT NULL
) sub
WHERE l.id = sub.lead_id
  AND sub.sm_id IS NOT NULL;
