/* ==============================
   Общие типы, используемые в фронтенде
   ============================== */

/* ---------- Пользователь и аутентификация ---------- */
export interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: string;
  phone?: string;
  managed_by?: string;
  tenant_id?: string;
}

/* ---------- Запросы аутентификации ---------- */
export interface LoginRequest {
  email: string;
  password: string;
}
export interface RegisterRequest {
  email: string;
  password: string;
  role?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  managed_by?: string;
}

/* ---------- Ответ после логина/регистрации ---------- */
export interface AuthResponse {
  user: User;
  token: string;
  refresh_token?: string;
}

/* ---------- Член команды (франчайзер → менеджеры) ---------- */
export interface TeamMemberResponse {
  id: string;
  name: string;
  territory: string;
  dealers_count: number;
  role: string;
  plan_percent: number;
  red_dealers_pct: number;
  sla: number;
  dealer_growth: number;
  churn_rate: number;
  forecast_percent: number;
  integral_kpi: number;
  bonus_forecast: number;
}

/* ---------- Франчайзер → дилеры ---------- */
export interface FranchiserDealerItem {
  id: string;
  name: string;
  email: string;
  plan: number;
  fact: number;
  plan_percent: number;
  status: string;
  manager_name: string;
  manager_id: string | null;
}

export interface FranchiserDealersResponse {
  dealers: FranchiserDealerItem[];
  total: number;
}

/* ---------- Здоровье сети ---------- */
export interface HealthSegmentMember {
  id: string;
  name: string;
  plan: number;
  fact: number;
  plan_percent: number;
  status: string;
  manager_name: string;
}

export interface DealersHealthResponse {
  segments: {
    a: HealthSegmentMember[];
    b: HealthSegmentMember[];
    c: HealthSegmentMember[];
    d: HealthSegmentMember[];
  };
  metrics: {
    total_dealers: number;
    active_dealers: number;
    avg_plan_percent: number;
    segment_counts: { a: number; b: number; c: number; d: number };
    segment_revenue_share: { a: number; b: number; c: number; d: number };
  };
}

export interface DealerMigration {
  dealer_id: string;
  dealer_name: string;
  from_segment: string;
  to_segment: string;
}

export interface DealersMigrationResponse {
  migrations: DealerMigration[];
}

export interface SystemIssue {
  id: string;
  title: string;
  description: string;
  status: string;
  severity: string;
  dealer_id: string;
  dealer_name: string;
  affected_dealers: number;
  lost_revenue: number;
  created_at: string;
}

export interface DealerGeographyItem {
  city: string;
  dealers_count: number;
  salons_count: number;
  total_revenue: number;
}

export interface MarketingROIResponse {
  roi: number;
  marketing_spent: number;
  revenue_attributed: number;
  period: string;
  avg_dealer_revenue: number;
}

/* ---------- Сотрудники (Employee) ---------- */
export interface Employee {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  phone?: string;
  created_at?: string;
  managed_by?: string;
}

/* ---------- Чек‑листы ---------- */
export interface Checklist {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'waiting' | 'completed' | string;
  priority?: 'urgent' | 'important' | 'normal' | string;
  created_at?: string;
  updated_at?: string;
  assigned_to?: string; // id сотрудника
  start_date?: string;
  end_date?: string;
  user_id?: string;
  tenant_id?: string;
  is_overdue?: boolean;
}

/* ---------- Лиды и активности ---------- */
export interface Lead {
  id: string;
  salon_id: string;
  manager_id: string;
  full_name: string;
  phone?: string;
  email?: string;
  interest_product?: string;
  budget?: number;
  status: 'new' | 'contact' | 'meeting' | 'sale' | 'archive' | string;
  created_at?: string;
  updated_at?: string;
}
export interface LeadActivity {
  id: string;
  lead_id: string;
  user_id: string;
  type: 'call' | 'meeting' | 'note' | string;
  description: string;
  created_at: string;
}
export interface CreateLeadRequest {
  full_name: string;
  phone?: string;
  email?: string;
  interest_product?: string;
  budget?: number;
}

/* ---------- Дилеры ---------- */
export interface Dealer {
  id: string;
  businessName: string;
  address?: string;
  status: 'active' | 'inactive' | 'suspended';
}

/* ---------- Тарифные планы (Plan) ---------- */
export interface Plan {
  id: string;
  name: string;
  price: number;
  max_salons: number;
  max_users: number;
  created_at?: string;
  updated_at?: string;
}

/* ---------- Салоны ---------- */
export interface Salon {
  id: string;
  name: string;
  address: string;
  tenant_id: string;
  created_at?: string;
  manager?: Employee;
}

/* ---------- Goal (цель / план) ---------- */
export interface Goal {
  id: string;
  assigner_id: string;
  assignee_id: string;
  role: string;
  sales_plan: number;
  leads_plan: number;
  calls_plan: number;
  meetings_plan: number;
  period: string;
  start_date: string;
  end_date: string;
  target_date: string;
  sales_fact?: number;
  leads_fact?: number;
  calls_fact?: number;
  meetings_fact?: number;
  forecast?: number;
  created_at: string;
  updated_at: string;
}

/* ---------- Unit-экономика (калькулятор) ---------- */
export interface UnitEconomyInput {
  salePrice: number;
  purchasePrice: number;
  managerPercent: number;
  deliveryCost: number;
  acquiringPercent: number;
  rentAmortization: number;
  additionalServices: number;
}

export interface UnitEconomyResult {
  marginalProfit: number;
  netProfit: number;
  profitability: number;
  priceAfterDiscount: number;
}

export interface UnitTemplate {
  id?: string;
  name: string;
  category: 'sofa' | 'kitchen' | 'wardrobe' | 'other';
  input: UnitEconomyInput;
  created_at?: string;
}

/* ---------- Профиль пользователя ---------- */
export type UserStatus = 'online' | 'office' | 'meeting' | 'vacation' | 'dnd';

export interface UserContacts {
  email_visible: boolean;
  phone_visible: boolean;
  phone?: string;
  telegram?: string;
  whatsapp?: string;
  working_hours?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  position?: string;
  bio?: string;
  quote?: string;
  avatar_url?: string;
  status?: UserStatus;
  available_for_questions?: boolean;
  achievements?: string[];
  contacts?: UserContacts;
}

export interface UpdateProfileRequest {
  first_name?: string;
  last_name?: string;
  display_name?: string;
  position?: string;
  bio?: string;
  quote?: string;
  status?: UserStatus;
  available_for_questions?: boolean;
  contacts?: Partial<UserContacts>;
}

/* ---------- Создание сотрудника (для HR-модуля) ---------- */
export interface CreateEmployeeRequest {
  email: string;
  password: string;
  first_name: string;
  last_name?: string;
  phone?: string;
  role: string;
  managed_by?: string;
}

export interface EmployeeResponse {
  id: string;
  email: string;
  first_name: string;
  last_name?: string;
  phone?: string;
  role: string;
  managed_by?: string;
  created_at?: string;
}

/* ---------- Отчёт B2B ---------- */
export interface ReportExecutiveSummary {
  plan_amount: number;
  fact_amount: number;
  forecast_amount: number;
  forecast_percent: number;
  conclusion: string;
  trend: 'up' | 'stable' | 'down';
}

export interface ReportPlanFactItem {
  month: string;
  plan: number;
  fact: number;
}

export interface ReportNetworkGrowth {
  dealers_start: number;
  dealers_end: number;
  new_dealers: number;
  churned_dealers: number;
  avg_revenue_per_dealer: number;
  revenue_dynamics: number;
}

export interface ReportSalesStructureItem {
  category: string;
  share: number;
  dynamics: number;
}

export interface ReportTerritoryRatingItem {
  manager: string;
  plan_percent: number;
  dealers_count: number;
  growth: number;
  forecast: number;
}

export interface ReportRiskItem {
  issue: string;
  affected_dealers: number;
  impact: number;
}

export interface ReportDataResponse {
  executive_summary: ReportExecutiveSummary;
  plan_fact_dynamics: ReportPlanFactItem[];
  network_growth: ReportNetworkGrowth;
  sales_structure: ReportSalesStructureItem[];
  territory_rating: ReportTerritoryRatingItem[];
  risks: ReportRiskItem[];
}

/* -------------------------------------------------
   Всё готово к импорту:
   import type {
     User, AuthResponse, Employee, Checklist, Lead, LeadActivity,
     CreateLeadRequest, Dealer, Plan, Salon, Goal,
     UnitEconomyInput, UnitEconomyResult, UnitTemplate,
     UserProfile, UserStatus, UserContacts, UpdateProfileRequest
   } from '@/types';
   ------------------------------------------------- */
