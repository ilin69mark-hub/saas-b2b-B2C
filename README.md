# SaaS-платформа управления франчайзинговой сетью

Мультитенантная SaaS-платформа для управления франчайзинговой сетью мебельной компании (на примере divan.ru, но масштабируемо на другие сети). Платформа предназначена для систематизации работы дилеров в регионах, контроля KPI, автоматизации маркетинга и масштабирования лучших практик.

## Архитектура

- **Фронтенд:** Next.js 14 (React 18 + TypeScript), App Router, Redux Toolkit, Ant Design
- **Бэкенд:** Go 1.22+, Gin Framework, PostgreSQL, Redis
- **Инфраструктура:** Docker, Docker Compose, Nginx

## Особенности

- Мультиролевая система (франчайзер, дилеры)
- White-label решение с возможностью смены брендинга
- Адаптивный дизайн для desktop/tablet/mobile
- Модульная архитектура с четким разделением ответственности
- Поддержка мультитенантности
- Интеграции с внешними сервисами (VK, Avito, 2GIS и др.)

## Установка и запуск

1. Установите зависимости:
   ```bash
   # Для фронтенда
   cd frontend
   npm install
   
   # Для бэкенда
   cd ../backend
   go mod init franchise-management-platform
   go get ...
   ```

2. Настройте переменные окружения:
   - Скопируйте `.env.example` в `.env` и укажите нужные значения

3. Запустите приложение:
   ```bash
   # В корне проекта
   docker-compose up --build
   ```

## Структура проекта

```
/workspace/
├── frontend/                 # Next.js приложение
│   ├── src/                  # Исходный код
│   ├── public/               # Статические файлы
│   ├── styles/               # Стили
│   ├── components/           # Компоненты
│   ├── utils/                # Утилиты
│   ├── types/                # Типы TypeScript
│   └── assets/               # Ассеты
├── backend/                  # Go бэкенд
│   ├── cmd/                  # Точка входа
│   ├── internal/             # Внутренние пакеты
│   ├── pkg/                  # Публичные пакеты
│   ├── config/               # Конфигурация
│   ├── migrations/           # Миграции БД
│   ├── handlers/             # HTTP хендлеры
│   ├── services/             # Бизнес-логика
│   ├── models/               # Модели данных
│   ├── middleware/           # Middleware
│   └── utils/                # Утилиты
├── docs/                     # Документация
├── scripts/                  # Скрипты
├── deploy/                   # Файлы деплоя
├── docker-compose.yml        # Docker Compose конфигурация
├── Dockerfile.frontend       # Dockerfile для фронтенда
├── Dockerfile.backend        # Dockerfile для бэкенда
├── nginx.conf                # Конфигурация nginx
└── README.md                 # Этот файл
```

## Модули

### 1. Модуль аутентификации
- Мультиролевая система: superadmin, franchiser, dealer, manager
- JWT с refresh token ротацией
- Подтверждение email при регистрации
- 2FA опционально (Telegram/Google Authenticator)

### 2. Личный кабинет дилера
- KPI-панель с виджетами
- Интерактивный чек-лист
- CRM и воронка продаж
- Маркетинговая автоматизация
- Отчеты и аналитика

### 3. Панель управления франчайзера
- Обзор сети на карте
- Управление дилерами
- Шаблоны и стандарты
- Аналитика и инсайты
- Система оповещений

## Технологии

### Фронтенд:
- **React 18+** с TypeScript
- **Next.js 14** (App Router) для SSR и оптимизации
- **State management:** Redux Toolkit + RTK Query
- **UI библиотека:** Ant Design
- **Графики:** Recharts + Chart.js
- **Формы:** React Hook Form + Zod
- **Таблицы:** TanStack Table
- **Карты:** Yandex Maps React
- **Стили:** Tailwind CSS + CSS Modules

### Бэкенд:
- **Go 1.22+** с чистой архитектурой
- **Фреймворк:** Gin для роутинга
- **База данных:** PostgreSQL + Redis для кэша
- **Миграции:** Goose
- **Аутентификация:** JWT + Refresh tokens
- **Очереди:** NATS для фоновых задач
- **Объекты:** MinIO
- **Документация API:** Swagger/OpenAPI 3.0

## Безопасность
- HTTPS only (TLS 1.3)
- Хеширование паролей (bcrypt)
- Защита от XSS, CSRF, SQL injection
- Rate limiting
- Audit log всех действий
- Соответствие GDPR/152-ФЗ

## Лицензия

MIT