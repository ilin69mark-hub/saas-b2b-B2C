# Franchise SaaS Platform

[![Go Version](https://img.shields.io/badge/Go-1.24.0-00ADD8?logo=go)](https://golang.org)
[![Next.js](https://img.shields.io/badge/Next.js-14.0.0-black?logo=next.js)](https://nextjs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-336791?logo=postgresql)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis)](https://redis.io)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker)](https://docker.com)
[![License](https://img.shields.io/badge/License-Private-red)](#)

> **Многопользовательская SaaS-платформа для управления франчайзинговыми сетями**  
> B2B2C-решение с поддержкой многоуровневой иерархии: Super Admin → Франчайзер → Дилер → Салон

---

## 📋 Оглавление

- [Обзор](#-обзор)
- [Архитектура](#-архитектура)
- [Технологический стек](#-технологический-стек)
- [Быстрый старт](#-быстрый-старт)
- [Разработка](#-разработка)
- [API Документация](#-api-документация)
- [Структура проекта](#-структура-проекта)
- [База данных](#-база-данных)
- [Тестирование](#-тестирование)
- [Деплой](#-деплой)
- [Troubleshooting](#-troubleshooting)

---

## 🎯 Обзор

Платформа предоставляет полный цикл управления франчайзинговой сетью:

| Роль | Возможности |
|------|-------------|
| **Super Admin** | Управление тенантами, тарифными планами, мониторинг платформы |
| **Франчайзер** | Создание шаблонов чек-листов, управление дилерами, аналитика сети |
| **Дилер** | Управление салонами, назначение задач, контроль KPI |
| **Салон-менеджер** | Выполнение чек-листов, ведение заказов, отчетность |

### Ключевые функции

- ✅ **Multi-tenancy архитектура** — изоляция данных между франчайзинговыми сетями
- ✅ **Гибкая система ролей** — 5 уровней доступа с наследованием прав
- ✅ **Чек-листы и задачи** — ежедневные/еженедельные шаблоны с автоматизацией
- ✅ **KPI и аналитика** — трекинг показателей эффективности в реальном времени
- ✅ **Уведомления** — email и push-оповещения о событиях
- ✅ **Фоновые задания** — Cron-задачи для проверки оплат и генерации отчетов

---

## 🏗 Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │   Browser   │  │   Mobile    │  │      Postman/API        │ │
│  └──────┬──────┘  └──────┬──────┘  └────────────┬────────────┘ │
└─────────┼────────────────┼──────────────────────┼──────────────┘
          │                │                      │
          ▼                ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Frontend (Next.js 14)                      │
│  React 18 • Redux Toolkit • Ant Design • TailwindCSS • Axios   │
│                    Port: 3000                                   │
└─────────────────────────────┬───────────────────────────────────┘
                              │ REST API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Go 1.24)                          │
│  Gin Gonic • GORM • JWT Auth • Redis Cache • Cron Jobs         │
│                    Port: 8080                                   │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │   Handlers   │  │  Services    │  │     Repository       │  │
│  │   (Router)   │  │  (Business)  │  │      (Data)          │  │
│  └──────────────┘  └──────────────┘  └──────────────────────┘  │
└─────────┬───────────────────┬───────────────────┬───────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
┌──────────────────┐ ┌──────────────────┐ ┌─────────────────────┐
│   PostgreSQL 15  │ │    Redis 7       │ │   Background Jobs   │
│   (Primary DB)   │ │   (Cache/Sess)   │ │   (Cron Scheduler)  │
│   Port: 5432     │ │   Port: 6379     │ │                     │
└──────────────────┘ └──────────────────┘ └─────────────────────┘
```

---

## 🛠 Технологический стек

### Backend

| Компонент | Версия | Назначение |
|-----------|--------|------------|
| **Go** | 1.24.0 | Язык программирования |
| **Gin Gonic** | latest | HTTP-роутинг и middleware |
| **GORM** | v1.31.1 | ORM для работы с БД |
| **PostgreSQL** | 15 | Основная база данных |
| **Redis** | 7 | Кэширование и сессии |
| **JWT** | - | Аутентификация и авторизация |
| **Viper** | latest | Управление конфигурацией |
| **Air** | v1.52.3 | Hot-reload для разработки |
| **Cron** | robfig/cron/v3 | Планировщик фоновых задач |

### Frontend

| Компонент | Версия | Назначение |
|-----------|--------|------------|
| **Next.js** | 14.0.0 | React-фреймворк |
| **React** | 18.2.0 | UI-библиотека |
| **Redux Toolkit** | 1.9.7 | State management |
| **Ant Design** | 5.10.0 | Компоненты UI |
| **TailwindCSS** | 3.3.3 | Утилитарные стили |
| **TypeScript** | 5.2.2 | Типизация |
| **Axios** | 1.13.4 | HTTP-клиент |
| **React Hook Form** | 7.47.0 | Управление формами |
| **Zod** | 3.22.4 | Валидация схем |
| **Jest** | 29.7.0 | Тестирование |

### DevOps

| Инструмент | Назначение |
|------------|------------|
| **Docker** | Контейнеризация приложений |
| **Docker Compose** | Оркестрация сервисов |
| **Make** | Автоматизация команд |
| **Husky** | Git hooks |

---

## 🚀 Быстрый старт

### Предварительные требования

- Docker ≥ 24.0
- Docker Compose ≥ 2.20
- Go 1.24+ (для локальной разработки)
- Node.js 20+ (для локальной разработки)

### Вариант 1: Docker Compose (Рекомендуется)

```bash
# Клонировать репозиторий
git clone <repository-url>
cd saas-b2b-b2c

# Создать файл окружения
cp .env.example .env
# Отредактировать .env при необходимости

# Запустить все сервисы
make up

# Проверить статус
make ps

# Просмотр логов
make logs
```

Сервисы будут доступны по адресам:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8080
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

### Вариант 2: Development режим (Hot-reload)

```bash
# Запуск с hot-reload для бэкенда
make dev

# Бэкенд автоматически перезагружается при изменении кода
# Фронтенд использует Fast Refresh Next.js
```

### Вариант 3: Локальная разработка

```bash
# Установка зависимостей
make install

# Запуск базы данных и Redis
docker-compose up -d postgres redis

# Запуск бэкенда (из директории backend)
cd backend
air -c .air.toml

# Запуск фронтенда (в новом терминале)
cd frontend
npm run dev
```

### Первая настройка

После первого запуска автоматически создается учетная запись Super Admin:

| Параметр | Значение |
|----------|----------|
| Email | `admin@admin.ru` |
| Пароль | `qwerty` |

> ⚠️ **Важно:** Смените пароль после первого входа!

---

## 💻 Разработка

### Основные команды Makefile

| Команда | Описание |
|---------|----------|
| `make help` | Показать все доступные команды |
| `make install` | Установить зависимости (Go + npm) |
| `make up` | Запуск production-сборки |
| `make dev` | Запуск development-режима с hot-reload |
| `make down` | Остановка всех сервисов |
| `make build` | Сборка Docker-образов |
| `make rebuild` | Пересборка без кэша |
| `make logs` | Просмотр логов всех сервисов |
| `make logs-back` | Логи только бэкенда |
| `make logs-front` | Логи только фронтенда |
| `make ps` | Статус контейнеров |
| `make shell-backend` | Войти в консоль бэкенда |
| `make shell-front` | Войти в консоль фронтенда |
| `make shell-db` | Подключиться к PostgreSQL |
| `make clean` | Полная очистка (контейнеры, тома, кэш) |
| `make test` | Запустить все тесты |
| `make lint` | Проверка кода линтерами |
| `make deploy` | Деплой (сборка + запуск) |

### Git Workflow

```bash
# Создание новой фичи
git checkout -b feature/your-feature-name

# Коммиты с префиксами
git commit -m "feat: add checklist recurrence"
git commit -m "fix: resolve user auth bug"
git commit -m "docs: update API documentation"
git commit -m "refactor: optimize database queries"
git commit -m "test: add unit tests for service"

# Push и создание PR
git push origin feature/your-feature-name
```

### Стандарты кода

#### Backend (Go)

```bash
# Форматирование и проверка
make lint-back

# Ручное форматирование
go fmt ./...
go vet ./...
```

#### Frontend (TypeScript/React)

```bash
# Линтинг
make lint-front

# Исправление авто-ошибок
cd frontend && npm run lint -- --fix
```

---

## 📖 API Документация

### Аутентификация

Все запросы к защищенным эндпоинтам требуют JWT-токен в заголовке:

```http
Authorization: Bearer <your-jwt-token>
```

### Основные эндпоинты

#### Auth

| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/auth/login` | Вход пользователя |
| POST | `/api/auth/register` | Регистрация нового пользователя |
| POST | `/api/auth/refresh` | Обновление токена |
| POST | `/api/auth/logout` | Выход из системы |

#### Admin (Super Admin)

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/admin/dashboard` | Статистика платформы |
| GET | `/api/admin/tenants` | Список всех тенантов |
| POST | `/api/admin/tenants` | Создать тенанта |
| PUT | `/api/admin/tenants/:id` | Обновить тенанта |
| DELETE | `/api/admin/tenants/:id` | Удалить тенанта |
| GET | `/api/admin/plans` | Список тарифов |
| POST | `/api/admin/plans` | Создать тариф |

#### Checklists

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/checklists` | Получить список чек-листов |
| POST | `/api/checklists` | Создать чек-лист |
| PUT | `/api/checklists/:id` | Обновить чек-лист |
| DELETE | `/api/checklists/:id` | Удалить чек-лист |
| POST | `/api/checklists/:id/complete` | Завершить чек-лист |

#### Users

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/users` | Список пользователей |
| GET | `/api/users/:id` | Данные пользователя |
| PUT | `/api/users/:id` | Обновить профиль |
| DELETE | `/api/users/:id` | Удалить пользователя |

### Пример запроса

```bash
# Логин
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@admin.ru","password":"qwerty"}'

# Получение чек-листов
curl -X GET http://localhost:8080/api/checklists \
  -H "Authorization: Bearer <token>"
```

### Postman коллекции

В репозитории доступны готовые коллекции для тестирования:

- `postman-collection_admin.json` — эндпоинты администратора
- `postman-collection_Franchiser.json` — эндпоинты франчайзера
- `Франчайзер (Клиент).postman_test_run.json` — клиентские сценарии

Импортируйте их в Postman для быстрого начала работы с API.

---

## 📁 Структура проекта

```
saas-b2b-b2c/
├── backend/                    # Go бэкенд
│   ├── cmd/
│   │   └── server/
│   │       └── main.go         # Точка входа
│   ├── config/
│   │   └── config.go           # Конфигурация
│   ├── internal/
│   │   ├── handlers/           # HTTP обработчики
│   │   ├── services/           # Бизнес-логика
│   │   ├── repository/         # Доступ к данным
│   │   ├── models/             # Модели данных
│   │   ├── middleware/         # Middleware (auth, cors)
│   │   ├── database/           # Подключение к БД
│   │   └── jobs/               # Фоновые задачи
│   ├── migrations/             # SQL миграции
│   │   ├── 001_init_schema.up.sql
│   │   ├── 002_add_analytics.up.sql
│   │   └── ...
│   ├── go.mod
│   ├── go.sum
│   └── .air.toml               # Конфиг hot-reload
│
├── frontend/                   # Next.js фронтенд
│   ├── src/
│   │   ├── pages/              # Страницы (роутинг)
│   │   │   ├── _app.tsx
│   │   │   ├── index.tsx
│   │   │   ├── login.tsx
│   │   │   ├── register.tsx
│   │   │   ├── admin/
│   │   │   ├── checklists.tsx
│   │   │   ├── employees/
│   │   │   └── salons/
│   │   ├── components/         # React компоненты
│   │   │   └── Dashboard/
│   │   ├── store/              # Redux store
│   │   │   ├── index.ts
│   │   │   ├── authSlice.ts
│   │   │   └── checklistSlice.ts
│   │   ├── api/                # API клиенты
│   │   │   ├── axiosClient.ts
│   │   │   ├── leads.ts
│   │   │   └── kpi.ts
│   │   ├── services/           # Сервисный слой
│   │   │   └── api.ts
│   │   └── types/              # TypeScript типы
│   │       └── index.ts
│   ├── public/                 # Статические файлы
│   ├── package.json
│   └── next.config.js
│
├── docker-compose.yml          # Production compose
├── docker-compose.dev.yml      # Development compose
├── Dockerfile.backend          # Бэкенд образ
├── Dockerfile.frontend         # Фронтенд образ
├── Makefile                    # Автоматизация
├── config.yaml                 # Конфиг приложения
├── nginx.conf                  # Nginx конфигурация
└── README.md                   # Эта документация
```

---

## 🗄 База данных

### Схема данных

Основные сущности:

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Tenants   │───────│    Plans    │       │   Users     │
│  (Сети)     │       │  (Тарифы)   │       │ (Пользов.)  │
└──────┬──────┘       └─────────────┘       └──────┬──────┘
       │                                            │
       │┌────────────┐                    ┌─────────┴─────────┐
       ├│   Salons   │                    │   Checklists      │
       ││ (Салоны)   │                    │   (Задачи)        │
       │└────────────┘                    └───────────────────┘
       │
       │┌────────────┐       ┌────────────┐
       ├│ Templates  │───────│   Items    │
       ││ (Шаблоны)  │       │ (Пункты)   │
       │└────────────┘       └────────────┘
```

### Миграции

Миграции расположены в `backend/migrations/`:

| Файл | Описание |
|------|----------|
| `001_init_schema.up.sql` | Инициализация основных таблиц |
| `002_add_analytics.up.sql` | Таблицы аналитики и KPI |
| `003_add_stage4_fields.up.sql` | Дополнительные поля |
| `004_add_settings.up.sql` | Таблица настроек |
| `005_franchise_manager_foundations.up.sql` | Расширения для менеджеров |

### Применение миграций

```bash
# Подключение к БД
make shell-db

# Миграции применяются автоматически при старте через GORM AutoMigrate
# Для ручного применения используйте goose или golang-migrate
```

---

## 🧪 Тестирование

### Запуск тестов

```bash
# Все тесты
make test

# Только бэкенд
make test-back

# Только фронтенд
make test-front
```

### Backend тесты

```bash
cd backend
go test ./... -v -cover
```

### Frontend тесты

```bash
cd frontend
npm test
npm run test:watch  # Watch mode
```

---

## 🚢 Деплой

### Production сборка

```bash
# Полная пересборка без кэша
make rebuild

# Или пошагово
make build
make up
```

### Переменные окружения

Создайте `.env` файл на основе `.env.example`:

```env
# Database
DB_NAME=franchise_db
DB_USER=postgres
DB_PASSWORD=your_secure_password
DB_HOST=postgres
DB_PORT=5432

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars

# Redis
REDIS_ADDR=redis:6379

# App
PORT=8080
NODE_ENV=production
```

### Docker volumes

Данные PostgreSQL сохраняются в volume `postgres_data`:

```bash
# Просмотр объема
docker volume inspect saas-b2b-b2c_postgres_data

# Бэкап
docker run --rm -v saas-b2b-b2c_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/db-backup.tar.gz -C /data .
```

---

## 🔧 Troubleshooting

### Частые проблемы

#### 1. Контейнер не запускается

```bash
# Проверить логи
make logs

# Пересоздать контейнер
docker-compose up -d --force-recreate <service-name>
```

#### 2. Ошибка подключения к БД

```bash
# Проверить health БД
docker-compose exec postgres pg_isready -U postgres

# Перезапустить PostgreSQL
docker-compose restart postgres
```

#### 3. Проблемы с миграциями

```bash
# Очистить volume и запустить заново (⚠️ данные будут удалены!)
make clean
make up
```

#### 4. Frontend не видит бэкенд

Проверьте `NEXT_PUBLIC_API_URL` в `docker-compose.yml`:

```yaml
environment:
  - NEXT_PUBLIC_API_URL=http://localhost:8080
```

#### 5. Hot-reload не работает

Убедитесь, что используется `docker-compose.dev.yml`:

```bash
make dev
```

### Логи

```bash
# Все сервисы
make logs

# Отдельный сервис
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f postgres
```

### Сброс состояния

```bash
# Полная очистка (удалит все данные!)
make clean

# Перезапуск с чистой БД
make up
```

---

## 📝 Лицензия

© 2024 Franchise SaaS Platform. Все права защищены.

---

## 👥 Контакты

По вопросам обращайтесь к команде разработки.

---

<div align="center">

**Franchise SaaS Platform** • Built with Go & Next.js

[⬆ Вернуться к началу](#franchise-saas-platform)

</div>
