import axios, { AxiosError } from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import type { AuthResponse } from "./api-dtos";
import { createIdempotencyKey } from "./idempotency";

const DEFAULT_API_PORT = 5504;

export const AUTH_STORAGE_KEYS = {
  accessToken: "bizsawa_access_token",
  refreshToken: "bizsawa_refresh_token",
  legacyToken: "bizsawa_token",
  userId: "bizsawa_user_id",
  userData: "bizsawa_userdata",
  businessId: "bizsawa_business_id",
  business: "bizsawa_business",
  role: "bizsawa_role",
};

function parseHostFromHostUri(hostUri: string | undefined): string | null {
  if (!hostUri?.trim()) return null;
  const host = hostUri.split(":")[0];
  return host || null;
}

function getExpoDevHost(): string | null {
  return parseHostFromHostUri(Constants.expoConfig?.hostUri);
}

export function getApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");

  if (Platform.OS === "web") return `http://localhost:${DEFAULT_API_PORT}`;

  const expoHost = getExpoDevHost();
  if (Platform.OS === "android") {
    if (!Device.isDevice) return `http://10.0.2.2:${DEFAULT_API_PORT}`;
    if (expoHost) return `http://${expoHost}:${DEFAULT_API_PORT}`;
  }
  if (Platform.OS === "ios") {
    if (!Device.isDevice) return `http://localhost:${DEFAULT_API_PORT}`;
    if (expoHost) return `http://${expoHost}:${DEFAULT_API_PORT}`;
  }
  if (expoHost) return `http://${expoHost}:${DEFAULT_API_PORT}`;

  if (__DEV__) {
    console.warn("[api] EXPO_PUBLIC_API_URL is unset and Expo hostUri is missing; API calls may fail.");
  }
  return `http://localhost:${DEFAULT_API_PORT}`;
}

function withApiPrefix(hostRoot: string): string {
  const trimmed = hostRoot.replace(/\/+$/, "");
  if (trimmed.endsWith("/api/v1")) return trimmed;
  if (trimmed.endsWith("/api")) return `${trimmed}/v1`;
  return `${trimmed}/api/v1`;
}

const apiRoot = withApiPrefix(getApiUrl());

export const api = axios.create({
  baseURL: apiRoot,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

export async function persistAuthResponse(data: AuthResponse): Promise<void> {
  await AsyncStorage.multiSet([
    [AUTH_STORAGE_KEYS.accessToken, data.accessToken],
    [AUTH_STORAGE_KEYS.refreshToken, data.refreshToken],
    [AUTH_STORAGE_KEYS.userId, data.userId],
  ]);
  await AsyncStorage.removeItem(AUTH_STORAGE_KEYS.legacyToken);
}

export async function clearAuthStorage(): Promise<void> {
  await AsyncStorage.multiRemove([
    AUTH_STORAGE_KEYS.accessToken,
    AUTH_STORAGE_KEYS.refreshToken,
    AUTH_STORAGE_KEYS.legacyToken,
    AUTH_STORAGE_KEYS.userId,
    AUTH_STORAGE_KEYS.userData,
    AUTH_STORAGE_KEYS.businessId,
    AUTH_STORAGE_KEYS.business,
    AUTH_STORAGE_KEYS.role,
  ]);
}

function isMutatingMethod(method?: string): boolean {
  return ["post", "put", "patch", "delete"].includes((method || "get").toLowerCase());
}

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const refreshToken = await AsyncStorage.getItem(AUTH_STORAGE_KEYS.refreshToken);
      if (!refreshToken) return null;
      const response = await axios.post<AuthResponse>(`${apiRoot}/auth/refresh`, { refreshToken });
      await persistAuthResponse(response.data);
      return response.data.accessToken;
    })().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

api.interceptors.request.use(
  async (config) => {
    const token =
      (await AsyncStorage.getItem(AUTH_STORAGE_KEYS.accessToken)) ||
      (await AsyncStorage.getItem(AUTH_STORAGE_KEYS.legacyToken));
    const businessId = await AsyncStorage.getItem(AUTH_STORAGE_KEYS.businessId);

    config.headers = config.headers || {};
    if (token) config.headers.Authorization = `Bearer ${token}`;
    if (businessId) config.headers["X-Business-ID"] = businessId;
    // Idempotency keys should be explicitly set by the caller via generateIdempotencyKey()
    // The interceptor only attaches keys that were already set on the request config
    // This prevents generating new keys on every retry attempt

    console.debug("API Request:", config.method?.toUpperCase(), config.url, config.baseURL);
    return config;
  },
  (error) => Promise.reject(error),
);

export interface ApiError extends AxiosError {
  friendlyMessage?: string;
}

export function standardizeApiError(error: any): string {
  if (error.response) {
    const status = error.response.status;
    const data = error.response.data;
    if (status === 401) return "Session expired. Please log in again.";
    if (status === 403) return "You don't have permission to do this.";
    if (status === 404) return "The requested information was not found.";
    if (status >= 500) return "Something went wrong on our end. Please try again in a moment.";

    const message = data?.message || data?.error?.message || data?.error;
    if (message && typeof message === "string") {
      if (message.includes("Prisma") || message.includes("database") || message.includes("invocation")) {
        return "A database error occurred. Please try again.";
      }
      return message;
    }
  } else if (error.request) {
    return "Connection failed. Please check your internet and try again.";
  }
  return "An unexpected error occurred. Please try again.";
}

api.interceptors.response.use(
  (response) => {
    console.log("API Response:", response.status, response.config.url);
    return response;
  },
  async (error: ApiError & { config?: any }) => {
    error.friendlyMessage = standardizeApiError(error);
    console.error(`[API ERROR] ${error.config?.url}:`, {
      status: error.response?.status,
      message: error.message,
      data: error.response?.data,
    });

    const originalRequest = error.config;
    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const accessToken = await refreshAccessToken();
        if (accessToken) {
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch {
        await clearAuthStorage();
      }
    } else if (error.response?.status === 401) {
      await clearAuthStorage();
    }

    return Promise.reject(error);
  },
);
