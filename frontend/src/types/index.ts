// Типы для пользователя
export interface User {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  tenantId: string;
  createdAt: string;
  updatedAt: string;
}

export type UserRole = 'superadmin' | 'franchiser' | 'dealer' | 'manager';

// Типы для тенанта
export interface Tenant {
  id: string;
  name: string;
  city: string;
  plan: 'start' | 'business' | 'enterprise';
  settings: TenantSettings;
  createdAt: string;
  updatedAt: string;
}

export interface TenantSettings {
  branding: BrandingSettings;
  features: FeatureSettings;
  limits: TenantLimits;
}

export interface BrandingSettings {
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  companyName: string;
}

export interface FeatureSettings {
  marketingAutomation: boolean;
  crm: boolean;
  reporting: boolean;
  checklist: boolean;
}

export interface TenantLimits {
  maxDealers: number;
  maxUsers: number;
  storageGB: number;
  apiCallsPerMonth: number;
}

// Типы для чек-листа
export interface Checklist {
  id: string;
  tenantId: string;
  userId: string;
  date: string; // ISO string
  tasks: ChecklistTask[];
  status: 'pending' | 'in_progress' | 'completed';
  kpiScore: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChecklistTask {
  id: string;
  title: string;
  description?: string;
  category: TaskCategory;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed' | 'verified';
  deadline?: string; // ISO string
  assignedTo?: string; // user ID
  completedAt?: string; // ISO string
  verificationData?: VerificationData;
  createdAt: string;
  updatedAt: string;
}

export type TaskCategory = 
  | 'calls' 
  | 'social_media' 
  | 'visits' 
  | 'reports' 
  | 'marketing' 
  | 'sales' 
  | 'other';

export interface VerificationData {
  screenshotUrls?: string[];
  links?: string[];
  notes?: string;
}

// Типы для лида
export interface Lead {
  id: string;
  tenantId: string;
  source: LeadSource;
  status: LeadStatus;
  value?: number;
  contact: ContactInfo;
  funnelStage: FunnelStage;
  assignedTo?: string; // user ID
  createdAt: string;
  updatedAt: string;
  history: LeadEvent[];
}

export type LeadSource = 
  | 'vk' 
  | 'avito' 
  | '2gis' 
  | 'google_ads' 
  | 'yandex_direct' 
  | 'recommendation' 
  | 'website' 
  | 'other';

export type LeadStatus = 'new' | 'contacted' | 'meeting' | 'negotiation' | 'deal' | 'lost';

export type FunnelStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

export interface ContactInfo {
  name: string;
  phone?: string;
  email?: string;
  socialMedia?: SocialMediaContact[];
  address?: string;
}

export interface SocialMediaContact {
  platform: 'vk' | 'telegram' | 'whatsapp' | 'instagram' | 'other';
  username: string;
  url?: string;
}

export interface LeadEvent {
  id: string;
  type: LeadEventType;
  description: string;
  timestamp: string; // ISO string
  userId: string; // who performed the action
}

export type LeadEventType = 
  | 'created' 
  | 'contacted' 
  | 'meeting_scheduled' 
  | 'visit_done' 
  | 'call_made' 
  | 'offer_sent' 
  | 'status_changed' 
  | 'note_added' 
  | 'deal_won' 
  | 'deal_lost';

// Типы для маркетингового поста
export interface MarketingPost {
  id: string;
  tenantId: string;
  platform: MarketingPlatform;
  content: PostContent;
  schedule: string; // ISO string
  status: 'draft' | 'scheduled' | 'published' | 'failed';
  analytics?: PostAnalytics;
  createdAt: string;
  updatedAt: string;
}

export type MarketingPlatform = 'vk' | 'telegram' | 'avito' | 'instagram' | 'facebook' | 'youtube';

export interface PostContent {
  title?: string;
  body: string;
  mediaUrls?: string[];
  hashtags?: string[];
  targetAudience?: string;
}

export interface PostAnalytics {
  impressions: number;
  reach: number;
  likes: number;
  shares: number;
  comments: number;
  clicks: number;
  ctr: number; // click through rate
  engagementRate: number;
}

// Типы для дилера
export interface Dealer {
  id: string;
  tenantId: string;
  userId: string;
  businessName: string;
  address: string;
  phone: string;
  email: string;
  managerId?: string;
  kpiMetrics: KPIMetrics;
  status: 'active' | 'inactive' | 'suspended';
  createdAt: string;
  updatedAt: string;
}

export interface KPIMetrics {
  salesVolume: number;
  conversionRate: number;
  customerSatisfaction: number;
  checklistCompletionRate: number;
  leadGeneration: number;
  revenue: number;
  expenses: number;
  profit: number;
}

// Типы для ответов API
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  message?: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

// Типы для аутентификации
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest extends LoginRequest {
  firstName: string;
  lastName: string;
  tenantName: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
  tenant: Tenant;
}

export interface TokenRefreshRequest {
  refreshToken: string;
}

export interface TokenRefreshResponse {
  accessToken: string;
  refreshToken: string;
}

// Типы для фильтров и пагинации
export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface FilterParams {
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  [key: string]: any;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}