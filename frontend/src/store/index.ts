import { configureStore } from '@reduxjs/toolkit';
import authSlice from './authSlice';
import checklistSlice from './checklistSlice';

export const store = configureStore({
  reducer: {
    auth: authSlice,
    checklist: checklistSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export default store;