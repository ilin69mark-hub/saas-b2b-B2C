-- Migration: 010_normalize_phones
-- Приводит все существующие телефоны к каноническому формату +7XXXXXXXXXX
-- (12 символов: +7 + 10 цифр).
--
-- Поддерживаемые варианты на входе:
--   8XXXXXXXXXX     → +7XXXXXXXXXX
--   +7XXXXXXXXXX    → без изменений (уже нормализован)
--   +7(XXX)-XXX-XX-XX → нормализуется к +7XXXXXXXXXX
--   7XXXXXXXXXX     → +7XXXXXXXXXX
--   пустая строка / мусор → не трогаем (только цифровые 10/11-значные)

-- 1. users.phone
UPDATE users
SET phone = '+7' || substring(regexp_replace(phone, '\D', '', 'g') FROM 2 FOR 10)
WHERE phone IS NOT NULL
  AND phone <> ''
  AND regexp_replace(phone, '\D', '', 'g') ~ '^[87]?\d{10}$'
  AND phone !~ '^\+7\d{10}$';

-- 2. users.contacts_phone
UPDATE users
SET contacts_phone = '+7' || substring(regexp_replace(contacts_phone, '\D', '', 'g') FROM 2 FOR 10)
WHERE contacts_phone IS NOT NULL
  AND contacts_phone <> ''
  AND regexp_replace(contacts_phone, '\D', '', 'g') ~ '^[87]?\d{10}$'
  AND contacts_phone !~ '^\+7\d{10}$';

-- 3. leads.phone
UPDATE leads
SET phone = '+7' || substring(regexp_replace(phone, '\D', '', 'g') FROM 2 FOR 10)
WHERE phone IS NOT NULL
  AND phone <> ''
  AND regexp_replace(phone, '\D', '', 'g') ~ '^[87]?\d{10}$'
  AND phone !~ '^\+7\d{10}$';

-- (contracts.client_phone опущен: таблица contracts пока не auto-мигрируется)
