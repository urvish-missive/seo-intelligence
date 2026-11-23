// frontend/src/app/store.js
import { configureStore } from '@reduxjs/toolkit';
import { baseApi } from '../features/api/baseApi.js';
import authReducer from '../features/auth/authSlice.js';

export const store = configureStore({
  reducer: {
    [baseApi.reducerPath]: baseApi.reducer,
    auth: authReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(baseApi.middleware),
  devTools: import.meta.env.DEV,
});
