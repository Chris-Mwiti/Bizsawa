import axios, { type AxiosResponse, type AxiosError, type InternalAxiosRequestConfig } from "axios";

function resolveApiUrl(): string {
  const env = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (env) return env.replace(/\/+$/, '');
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      // Deployed hosts are static-only: posting to bizsawa.chrismwiti.me or
      // app.bizsawa.chrismwiti.me returns 405. The API always lives on the
      // api.<apex-domain> subdomain.
      const apiHost = host.startsWith('api.')
        ? host
        : `api.${host.replace(/^(app|www)\./, '')}`;
      return `https://${apiHost}/api/v1`;
    }
  }
  return 'http://localhost:5564/api/v1';
}
const API_URL = resolveApiUrl();

export const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem("accessToken");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // The backend scopes the session to a business and returns its id on
  // login. Send it on every request so tenant-scoped data resolves the
  // same way for every sign-in method.
  const businessId = localStorage.getItem("businessId");
  if (businessId) {
    config.headers["X-Business-ID"] = businessId;
  }
  return config;
});

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const refreshToken = localStorage.getItem("refreshToken");
        if (refreshToken) {
          const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
          const { accessToken, refreshToken: newRefreshToken } = response.data;
          localStorage.setItem("accessToken", accessToken);
          localStorage.setItem("refreshToken", newRefreshToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        localStorage.removeItem("accessToken");
        localStorage.removeItem("refreshToken");
        localStorage.removeItem("userId");
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);