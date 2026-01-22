import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import axios from 'axios';

// Define types
interface User {
  id: string;
  email: string;
  role: string;
  tenant_id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  avatar?: string;
  created_at: string;
  updated_at: string;
}

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

interface LoginCredentials {
  email: string;
  password: string;
}

interface RegisterData {
  email: string;
  password: string;
  role: string;
  tenant_id: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

interface LoginResponse {
  user: User;
  token: string;
  refresh_token: string;
}

// Async thunks
export const login = createAsyncThunk(
  'auth/login',
  async ({ email, password }: LoginCredentials, { rejectWithValue }) => {
    try {
      const response = await axios.post<LoginResponse>(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/login`,
        { email, password }
      );
      
      // Store tokens in localStorage
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('refreshToken', response.data.refresh_token);
      
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Ошибка входа');
    }
  }
);

export const register = createAsyncThunk(
  'auth/register',
  async (userData: RegisterData, { rejectWithValue }) => {
    try {
      const response = await axios.post<LoginResponse>(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/register`,
        userData
      );
      
      // Store tokens in localStorage
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('refreshToken', response.data.refresh_token);
      
      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Ошибка регистрации');
    }
  }
);

export const logout = createAsyncThunk(
  'auth/logout',
  async (_, { dispatch }) => {
    try {
      // Remove tokens from localStorage
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      
      // Optionally notify backend about logout
      const token = localStorage.getItem('token');
      if (token) {
        await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/logout`,
          {},
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      dispatch(clearAuthState());
    }
  }
);

const initialState: AuthState = {
  user: null,
  token: typeof window !== 'undefined' ? localStorage.getItem('token') : null,
  refreshToken: typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null,
  isAuthenticated: false,
  loading: false,
  error: null,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearAuthState: (state) => {
      state.user = null;
      state.token = null;
      state.refreshToken = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.error = null;
    },
    setCredentials: (state, action: PayloadAction<{ user: User; token: string; refreshToken: string }>) => {
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.refreshToken = action.payload.refreshToken;
      state.isAuthenticated = true;
      state.loading = false;
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      // Login cases
      .addCase(login.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.refreshToken = action.payload.refresh_token;
        state.isAuthenticated = true;
      })
      .addCase(login.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Register cases
      .addCase(register.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(register.fulfilled, (state, action) => {
        state.loading = false;
        state.user = action.payload.user;
        state.token = action.payload.token;
        state.refreshToken = action.payload.refresh_token;
        state.isAuthenticated = true;
      })
      .addCase(register.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearAuthState, setCredentials } = authSlice.actions;
export default authSlice.reducer;