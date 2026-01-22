import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { User, Checklist, Lead, Dealer, AuthResponse, LoginRequest, RegisterRequest } from '@/types';

// Определение сервиса API
export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ 
    baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080/api/v1',
    prepareHeaders: (headers, { getState }) => {
      // Получаем токен из состояния (предполагается, что он хранится в Redux)
      const token = (getState() as any).auth.accessToken; // типизация будет зависеть от вашей структуры состояния
      
      if (token) {
        headers.set('authorization', `Bearer ${token}`);
        headers.set('Content-Type', 'application/json');
      }
      
      return headers;
    },
  }),
  tagTypes: ['User', 'Checklist', 'Lead', 'Dealer', 'Auth'],
  endpoints: (builder) => ({
    // Аутентификация
    login: builder.mutation<AuthResponse, LoginRequest>({
      query: (credentials) => ({
        url: '/auth/login',
        method: 'POST',
        body: credentials,
      }),
      invalidatesTags: ['Auth'],
    }),
    
    register: builder.mutation<AuthResponse, RegisterRequest>({
      query: (userData) => ({
        url: '/auth/register',
        method: 'POST',
        body: userData,
      }),
      invalidatesTags: ['Auth'],
    }),
    
    logout: builder.mutation<void, void>({
      query: () => ({
        url: '/auth/logout',
        method: 'POST',
      }),
      invalidatesTags: ['Auth'],
    }),
    
    refreshToken: builder.query<AuthResponse, void>({
      query: () => '/auth/refresh',
      providesTags: ['Auth'],
    }),
    
    // Пользователи
    getProfile: builder.query<User, void>({
      query: () => '/users/profile',
      providesTags: ['User'],
    }),
    
    updateProfile: builder.mutation<User, Partial<User>>({
      query: (profileData) => ({
        url: '/users/profile',
        method: 'PUT',
        body: profileData,
      }),
      invalidatesTags: ['User'],
    }),
    
    // Чек-листы
    getChecklist: builder.query<Checklist[], void>({
      query: () => '/checklists',
      providesTags: ['Checklist'],
    }),
    
    getChecklistById: builder.query<Checklist, string>({
      query: (id) => `/checklists/${id}`,
      providesTags: (result, error, id) => [{ type: 'Checklist', id }],
    }),
    
    createChecklist: builder.mutation<Checklist, Omit<Checklist, 'id'>>({
      query: (newChecklist) => ({
        url: '/checklists',
        method: 'POST',
        body: newChecklist,
      }),
      invalidatesTags: ['Checklist'],
    }),
    
    updateChecklist: builder.mutation<Checklist, Checklist>({
      query: ({ id, ...patch }) => ({
        url: `/checklists/${id}`,
        method: 'PUT',
        body: patch,
      }),
      invalidatesTags: ['Checklist'],
    }),
    
    deleteChecklist: builder.mutation<{ success: boolean; id: string }, string>({
      query: (id) => ({
        url: `/checklists/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Checklist'],
    }),
    
    // Лиды
    getLeads: builder.query<Lead[], void>({
      query: () => '/leads',
      providesTags: ['Lead'],
    }),
    
    getLeadById: builder.query<Lead, string>({
      query: (id) => `/leads/${id}`,
      providesTags: (result, error, id) => [{ type: 'Lead', id }],
    }),
    
    createLead: builder.mutation<Lead, Omit<Lead, 'id'>>({
      query: (newLead) => ({
        url: '/leads',
        method: 'POST',
        body: newLead,
      }),
      invalidatesTags: ['Lead'],
    }),
    
    updateLead: builder.mutation<Lead, Lead>({
      query: ({ id, ...patch }) => ({
        url: `/leads/${id}`,
        method: 'PUT',
        body: patch,
      }),
      invalidatesTags: ['Lead'],
    }),
    
    // Дилеры (доступно только франчайзеру)
    getDealers: builder.query<Dealer[], void>({
      query: () => '/dealers',
      providesTags: ['Dealer'],
    }),
    
    getDealerById: builder.query<Dealer, string>({
      query: (id) => `/dealers/${id}`,
      providesTags: (result, error, id) => [{ type: 'Dealer', id }],
    }),
    
    createDealer: builder.mutation<Dealer, Omit<Dealer, 'id'>>({
      query: (newDealer) => ({
        url: '/dealers',
        method: 'POST',
        body: newDealer,
      }),
      invalidatesTags: ['Dealer'],
    }),
    
    updateDealer: builder.mutation<Dealer, Dealer>({
      query: ({ id, ...patch }) => ({
        url: `/dealers/${id}`,
        method: 'PUT',
        body: patch,
      }),
      invalidatesTags: ['Dealer'],
    }),
  }),
});

// Генерация хуков
export const {
  // Аутентификация
  useLoginMutation,
  useRegisterMutation,
  useLogoutMutation,
  useRefreshTokenQuery,
  
  // Пользователи
  useGetProfileQuery,
  useUpdateProfileMutation,
  
  // Чек-листы
  useGetChecklistQuery,
  useGetChecklistByIdQuery,
  useCreateChecklistMutation,
  useUpdateChecklistMutation,
  useDeleteChecklistMutation,
  
  // Лиды
  useGetLeadsQuery,
  useGetLeadByIdQuery,
  useCreateLeadMutation,
  useUpdateLeadMutation,
  
  // Дилеры
  useGetDealersQuery,
  useGetDealerByIdQuery,
  useCreateDealerMutation,
  useUpdateDealerMutation,
} = apiSlice;