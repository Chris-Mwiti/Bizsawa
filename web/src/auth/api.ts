import axios, { type AxiosResponse, type AxiosError, type InternalAxiosRequestConfig } from "axios";

const BIZSAWA_FRONTEND_HOST = 'bizsawa.chrismwiti.me'
const BIZSAWA_API_HOST = `api.${BIZSAWA_FRONTEND_HOST}`

function normalizeApiHost(host: string): string {
  if (!host || host === BIZSAWA_API_HOST) return host
  const apex = host.replace(/^(app|www)\./, '')
  return apex === BIZSAWA_FRONTEND_HOST ? BIZSAWA_API_HOST : host
}

function normalizeApiUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const fixed = normalizeApiHost(parsed.hostname)
    if (fixed !== parsed.hostname) parsed.hostname = fixed
    return parsed.toString().replace(/\/+$/, '')
  } catch {
    return url.replace(/\/+$/, '')
  }
}

function resolveApiUrl(): string {
  const env = (import.meta.env.VITE_API_URL as string | undefined)?.trim();
  if (env) return normalizeApiUrl(env);
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

type SessionExpiredListener = () => void;

const sessionExpiredListeners = new Set<SessionExpiredListener>();
let sessionExpiredEmitted = false;

export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListeners.add(listener);
  return () => {
    sessionExpiredListeners.delete(listener);
  };
}

export function resetSessionExpired(): void {
  sessionExpiredEmitted = false;
}

function emitSessionExpired(): void {
  if (sessionExpiredEmitted) return;
  sessionExpiredEmitted = true;
  for (const listener of sessionExpiredListeners) {
    try {
      listener();
    } catch {}
  }
}

const UNAUTHENTICATED_ENDPOINTS = [
  "/auth/login",
  "/auth/register",
  "/auth/refresh",
  "/auth/email-otp",
  "/auth/sign-in",
  "/auth/google",
  "/auth/check-email",
  "/auth/otp",
  "/auth/forgot-password",
  "/auth/reset-password-otp",
  "/auth/clerk",
];

function isUnauthenticatedEndpoint(url: string | undefined): boolean {
  if (!url) return false;
  const path = url.split("?")[0];
  return UNAUTHENTICATED_ENDPOINTS.some((endpoint) => path.includes(endpoint));
}

function expireSession(): void {
  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("userId");
  localStorage.removeItem("businessId");
  emitSessionExpired();
}

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
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined;
    const hadAuthorization = Boolean(
      originalRequest?.headers?.Authorization ||
        localStorage.getItem("accessToken"),
    );
    const isSessionRequest =
      error.response?.status === 401 &&
      Boolean(originalRequest) &&
      hadAuthorization &&
      !isUnauthenticatedEndpoint(originalRequest?.url);

    if (isSessionRequest && !originalRequest!._retry) {
      originalRequest!._retry = true;
      const refreshToken = localStorage.getItem("refreshToken");
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
          const { accessToken, refreshToken: newRefreshToken } = response.data;
          localStorage.setItem("accessToken", accessToken);
          localStorage.setItem("refreshToken", newRefreshToken);
          originalRequest!.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest!);
        } catch {}
      }
      expireSession();
    } else if (isSessionRequest) {
      expireSession();
    }
    return Promise.reject(error);
  }
);