import axios, { type AxiosInstance, type InternalAxiosRequestConfig, type AxiosError } from 'axios';

const api: AxiosInstance = axios.create({ baseURL: '/api' });

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('haha_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Surface a clean, user-facing error message
api.interceptors.response.use(
  (r) => r,
  (err: AxiosError<{ error?: string }>) => {
    const msg = err.response?.data?.error || err.message || '网络开小差了，请稍后重试';
    const e = new Error(msg);
    // 保留状态码：调用方据此区分 404(内容不存在/已删除) vs 网络/5xx(可重试)。
    (e as Error & { status?: number }).status = err.response?.status;
    return Promise.reject(e);
  },
);

export default api;
