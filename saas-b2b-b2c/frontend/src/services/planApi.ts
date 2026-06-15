// src/services/planApi.ts
import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { Plan } from '@/types';

/* -----------------------------------------------------------------
   1️⃣ Тип аргумента для PATCH /plans/:id
   id – обязателен,
   остальные поля – опциональны (кроме id, created_at, updated_at)
----------------------------------------------------------------- */
type UpdatePlanArg = { id: string } & Partial<
  Omit<Plan, 'id' | 'created_at' | 'updated_at'>
>;

/* -----------------------------------------------------------------
   2️⃣ RTK‑Query‑сервис для тарифных планов
----------------------------------------------------------------- */
export const planApi = createApi({
  reducerPath: 'planApi',
  baseQuery: fetchBaseQuery({
    baseUrl: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1`,
    prepareHeaders: (headers) => {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
      if (token && token !== 'null') {
        headers.set('Authorization', `Bearer ${token}`);
      }
      return headers;
    },
  }),
  tagTypes: ['Plan'],
  endpoints: (builder) => ({
    /* --------------------- GET /admin/plans --------------------- */
    getPlans: builder.query<
      { items: Plan[]; total: number },
      { search?: string; page?: number; size?: number; sort?: string; desc?: boolean } | void
    >({
      query: () => ({
        url: 'admin/plans',
        method: 'GET',
      }),
      transformResponse: (response: Plan[]) => ({
        items: response,
        total: response.length,
      }),
      providesTags: (result) =>
        result
          ? [
              { type: 'Plan', id: 'LIST' },
              ...result.items.map((p) => ({ type: 'Plan' as const, id: p.id })),
            ]
          : [{ type: 'Plan', id: 'LIST' }],
    }),

    /* --------------------- POST /admin/plans --------------------- */
    createPlan: builder.mutation<
      Plan,
      Omit<Plan, 'id' | 'created_at' | 'updated_at'>
    >({
      query: (body) => ({
        url: 'admin/plans',
        method: 'POST',
        body,
      }),
      invalidatesTags: [{ type: 'Plan', id: 'LIST' }],
    }),

    /* --------------------- PATCH /admin/plans/:id --------------------- */
    updatePlan: builder.mutation<Plan, UpdatePlanArg>({
      query: ({ id, ...patch }) => ({
        url: `admin/plans/${id}`,
        method: 'PATCH',
        body: patch,
      }),
      invalidatesTags: (result, _error, arg) => [{ type: 'Plan', id: arg.id }],
    }),

    /* --------------------- DELETE /admin/plans/:id --------------------- */
    deletePlan: builder.mutation<void, string>({
      query: (id) => ({
        url: `admin/plans/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'Plan', id: 'LIST' }],
      transformResponse: () => undefined,
    }),
  }),
});

/* -----------------------------------------------------------------
   3️⃣ Экспорт готовых хуков
----------------------------------------------------------------- */
export const {
  useGetPlansQuery,
  useCreatePlanMutation,
  useUpdatePlanMutation,
  useDeletePlanMutation,
} = planApi;
