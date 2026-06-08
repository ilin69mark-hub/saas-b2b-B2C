import axios from 'axios';

const apiClient = axios.create({
  baseURL: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

/* ----- Добавляем токен к каждому запросу ----- */
apiClient.interceptors.request.use(
  (config) => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken');
      // Если токен пустой либо строка "null" – не отправляем заголовок
      if (token && token !== 'null') {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Автоматический logout при 401 (пользователь удалён или токен протух)
// Не срабатывает на /auth/login и /auth/register (неверный пароль и т.п.)
apiClient.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthEndpoint = err.config?.url?.startsWith('/auth/');
    if (err.response?.status === 401 && !isAuthEndpoint && typeof window !== 'undefined') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('user');
      localStorage.removeItem('id');
      localStorage.removeItem('role');
      localStorage.removeItem('reduxState');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);

export default apiClient;
