import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { UserProfile, UpdateProfileRequest, CreateEmployeeRequest, EmployeeResponse, Employee, TeamMemberResponse, FranchiserDealersResponse, DealersHealthResponse, DealersMigrationResponse, SystemIssue, DealerGeographyItem, MarketingROIResponse, ReportDataResponse } from '@/types';

export const userApi = createApi({
  reducerPath: 'userApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1`,
    prepareHeaders: (headers) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['UserProfile', 'Employees'],
  endpoints: (builder) => ({
    getMyProfile: builder.query<UserProfile, void>({
      query: () => 'users/me',
      providesTags: (result) => (result ? [{ type: 'UserProfile', id: result.id }] : []),
    }),

    updateProfile: builder.mutation<UserProfile, UpdateProfileRequest>({
      query: (data) => ({
        url: 'users/me',
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: (result) => (result ? [{ type: 'UserProfile', id: result.id }] : []),
    }),

    createEmployee: builder.mutation<EmployeeResponse, CreateEmployeeRequest>({
      query: (data) => ({
        url: 'users',
        method: 'POST',
        body: data,
      }),
      invalidatesTags: [{ type: 'Employees' }],
    }),

    getEmployees: builder.query<EmployeeResponse[], void>({
      query: () => 'users',
      providesTags: (result) =>
        result
          ? [...result.map(({ id }) => ({ type: 'Employees' as const, id })), { type: 'Employees' as const }]
          : [{ type: 'Employees' as const }],
    }),

    getFranchiserTeam: builder.query<{ team_members: TeamMemberResponse[] }, void>({
      query: () => 'franchiser/team',
      providesTags: [{ type: 'Employees' }],
    }),

    getFranchiserDealers: builder.query<FranchiserDealersResponse, void>({
      query: () => 'franchiser/dealers',
    }),

    getDealersHealth: builder.query<DealersHealthResponse, { period?: string; date?: string; start_date?: string; end_date?: string }>({
      query: (params) => {
        const queryParams: Record<string, string> = { period: params.period || 'quarter' };
        if (params.date) queryParams.date = params.date;
        if (params.start_date) queryParams.start_date = params.start_date;
        if (params.end_date) queryParams.end_date = params.end_date;
        return { url: 'franchiser/dealers/health', params: queryParams };
      },
    }),

    getDealersMigration: builder.query<DealersMigrationResponse, { period?: string; date?: string; start_date?: string; end_date?: string }>({
      query: (params) => {
        const queryParams: Record<string, string> = { period: params.period || 'quarter' };
        if (params.date) queryParams.date = params.date;
        if (params.start_date) queryParams.start_date = params.start_date;
        if (params.end_date) queryParams.end_date = params.end_date;
        return { url: 'franchiser/dealers/migration', params: queryParams };
      },
    }),

    getSystemIssues: builder.query<SystemIssue[], { status?: string }>({
      query: (params) => ({
        url: 'franchiser/dealers/system-issues',
        params: params.status ? { status: params.status } : {},
      }),
    }),

    getDealersGeography: builder.query<DealerGeographyItem[], void>({
      query: () => 'franchiser/dealers/geography',
    }),

    getMarketingROI: builder.query<MarketingROIResponse, { period?: string; date?: string; start_date?: string; end_date?: string }>({
      query: (params) => {
        const queryParams: Record<string, string> = { period: params.period || 'quarter' };
        if (params.date) queryParams.date = params.date;
        if (params.start_date) queryParams.start_date = params.start_date;
        if (params.end_date) queryParams.end_date = params.end_date;
        return { url: 'franchiser/dealers/marketing-roi', params: queryParams };
      },
    }),

    getReportData: builder.query<ReportDataResponse, { period: string; date?: string; start_date?: string; end_date?: string }>({
      query: (params) => {
        const queryParams: Record<string, string> = { period: params.period };
        if (params.date) queryParams.date = params.date;
        if (params.start_date) queryParams.start_date = params.start_date;
        if (params.end_date) queryParams.end_date = params.end_date;
        return { url: 'franchiser/report/data', params: queryParams };
      },
    }),

    updateEmployee: builder.mutation<EmployeeResponse, { id: string; data: Partial<Employee> }>({
      query: ({ id, data }) => ({
        url: `users/${id}`,
        method: 'PUT',
        body: data,
      }),
      invalidatesTags: [{ type: 'Employees' }],
    }),

    deleteEmployee: builder.mutation<void, string>({
      query: (id) => ({
        url: `users/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Employees' }],
    }),
  }),
});

export const {
  useGetMyProfileQuery,
  useUpdateProfileMutation,
  useCreateEmployeeMutation,
  useGetEmployeesQuery,
  useUpdateEmployeeMutation,
  useDeleteEmployeeMutation,
  useGetFranchiserTeamQuery,
  useGetFranchiserDealersQuery,
  useGetDealersHealthQuery,
  useGetDealersMigrationQuery,
  useGetSystemIssuesQuery,
  useGetDealersGeographyQuery,
  useGetMarketingROIQuery,
  useGetReportDataQuery,
} = userApi;
