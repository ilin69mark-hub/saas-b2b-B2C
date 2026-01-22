import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

// Define types
interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed';
  order: number;
  created_at: string;
  updated_at: string;
}

interface Checklist {
  id: string;
  title: string;
  description?: string;
  user_id: string;
  tenant_id: string;
  status: 'pending' | 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
  tasks: Task[];
  kpi_score: number;
}

interface ChecklistState {
  items: Checklist[];
  currentChecklist: Checklist | null;
  loading: boolean;
  error: string | null;
}

// Async thunks
export const fetchChecklists = createAsyncThunk(
  'checklist/fetchChecklists',
  async (_, { rejectWithValue, getState }) => {
    try {
      const state = getState() as any;
      const token = state.auth.token;
      
      const response = await axios.get<Checklist[]>(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/checklists`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Ошибка получения чек-листов');
    }
  }
);

export const fetchChecklistById = createAsyncThunk(
  'checklist/fetchChecklistById',
  async (id: string, { rejectWithValue, getState }) => {
    try {
      const state = getState() as any;
      const token = state.auth.token;
      
      const response = await axios.get<Checklist>(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/checklists/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Ошибка получения чек-листа');
    }
  }
);

export const createChecklist = createAsyncThunk(
  'checklist/createChecklist',
  async (checklistData: Omit<Checklist, 'id' | 'created_at' | 'updated_at' | 'user_id' | 'tenant_id'>, { rejectWithValue, getState }) => {
    try {
      const state = getState() as any;
      const token = state.auth.token;
      const userId = state.auth.user.id;
      const tenantId = state.auth.user.tenant_id;
      
      const response = await axios.post<Checklist>(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/checklists`,
        {
          ...checklistData,
          user_id: userId,
          tenant_id: tenantId,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Ошибка создания чек-листа');
    }
  }
);

export const updateChecklist = createAsyncThunk(
  'checklist/updateChecklist',
  async ({ id, ...updateData }: { id: string } & Partial<Checklist>, { rejectWithValue, getState }) => {
    try {
      const state = getState() as any;
      const token = state.auth.token;
      
      const response = await axios.put<Checklist>(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/checklists/${id}`,
        updateData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Ошибка обновления чек-листа');
    }
  }
);

export const deleteChecklist = createAsyncThunk(
  'checklist/deleteChecklist',
  async (id: string, { rejectWithValue, getState }) => {
    try {
      const state = getState() as any;
      const token = state.auth.token;
      
      await axios.delete(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/checklists/${id}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      return id;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Ошибка удаления чек-листа');
    }
  }
);

export const completeChecklist = createAsyncThunk(
  'checklist/completeChecklist',
  async (id: string, { rejectWithValue, getState }) => {
    try {
      const state = getState() as any;
      const token = state.auth.token;
      
      const response = await axios.post<Checklist>(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/checklists/${id}/complete`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Ошибка завершения чек-листа');
    }
  }
);

const initialState: ChecklistState = {
  items: [],
  currentChecklist: null,
  loading: false,
  error: null,
};

const checklistSlice = createSlice({
  name: 'checklist',
  initialState,
  reducers: {
    setCurrentChecklist: (state, action) => {
      state.currentChecklist = action.payload;
    },
    resetCurrentChecklist: (state) => {
      state.currentChecklist = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Fetch all checklists
      .addCase(fetchChecklists.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchChecklists.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload;
      })
      .addCase(fetchChecklists.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Fetch single checklist
      .addCase(fetchChecklistById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchChecklistById.fulfilled, (state, action) => {
        state.loading = false;
        state.currentChecklist = action.payload;
      })
      .addCase(fetchChecklistById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Create checklist
      .addCase(createChecklist.fulfilled, (state, action) => {
        state.items.push(action.payload);
      })
      .addCase(createChecklist.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      // Update checklist
      .addCase(updateChecklist.fulfilled, (state, action) => {
        const index = state.items.findIndex(item => item.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        
        if (state.currentChecklist && state.currentChecklist.id === action.payload.id) {
          state.currentChecklist = action.payload;
        }
      })
      .addCase(updateChecklist.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      // Delete checklist
      .addCase(deleteChecklist.fulfilled, (state, action) => {
        state.items = state.items.filter(item => item.id !== action.payload);
      })
      .addCase(deleteChecklist.rejected, (state, action) => {
        state.error = action.payload as string;
      })
      // Complete checklist
      .addCase(completeChecklist.fulfilled, (state, action) => {
        const index = state.items.findIndex(item => item.id === action.payload.id);
        if (index !== -1) {
          state.items[index] = action.payload;
        }
        
        if (state.currentChecklist && state.currentChecklist.id === action.payload.id) {
          state.currentChecklist = action.payload;
        }
      })
      .addCase(completeChecklist.rejected, (state, action) => {
        state.error = action.payload as string;
      });
  },
});

export const { setCurrentChecklist, resetCurrentChecklist } = checklistSlice.actions;
export default checklistSlice.reducer;