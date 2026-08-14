import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { api, AUTH_STORAGE_KEYS, clearAuthStorage, persistAuthResponse } from "../lib/api";
import type { AuthResponse, Business, LoginRequest, RegisterRequest, UUID } from "../lib/api-dtos";

interface UserData {
  id: UUID;
  ownerName?: string;
  ownerEmail?: string;
  name?: string;
}

interface AuthTokens {
  access: string;
  refresh: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  userId: UUID | null;
  userData: UserData | null;
  authTokens: AuthTokens | null;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (data: RegisterRequest & Record<string, unknown>) => Promise<AuthResponse>;
  setSelectedBusinessAuth: (business: Business, role?: string | null) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userId, setUserId] = useState<UUID | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [authTokens, setAuthTokens] = useState<AuthTokens | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    void checkAuthStatus();
  }, []);

  const loadBusinessBackCompat = async (storedUserId: UUID): Promise<UserData> => {
    const savedBusiness = await AsyncStorage.getItem(AUTH_STORAGE_KEYS.business);
    if (savedBusiness) {
      const business = JSON.parse(savedBusiness) as Business;
      return {
        id: storedUserId,
        name: business.name,
        ownerEmail: business.email,
      };
    }
    return { id: storedUserId };
  };

  const checkAuthStatus = async () => {
    try {
      const access =
        (await AsyncStorage.getItem(AUTH_STORAGE_KEYS.accessToken)) ||
        (await AsyncStorage.getItem(AUTH_STORAGE_KEYS.legacyToken));
      const refresh = await AsyncStorage.getItem(AUTH_STORAGE_KEYS.refreshToken);
      const storedUserId = await AsyncStorage.getItem(AUTH_STORAGE_KEYS.userId);

      if (access && refresh && storedUserId) {
        setUserId(storedUserId);
        setAuthTokens({ access, refresh });
        setUserData(await loadBusinessBackCompat(storedUserId));
        setIsAuthenticated(true);
      }
    } catch (error) {
      console.error("Error checking auth status:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyAuth = async (data: AuthResponse) => {
    await persistAuthResponse(data);
    setUserId(data.userId);
    setAuthTokens({ access: data.accessToken, refresh: data.refreshToken });
    setUserData({ id: data.userId });
    setIsAuthenticated(true);
  };

  const login = async (credentials: LoginRequest) => {
    try {
      const response = await api.post<AuthResponse>("/auth/login", credentials);
      await applyAuth(response.data);
    } catch (error: any) {
      throw new Error(error.friendlyMessage || "Login failed. Please check your credentials.");
    }
  };

  const loginWithGoogle = async () => {
    throw new Error("Google login is not available until the backend exposes /auth/google.");
  };

  const register = async (data: RegisterRequest & Record<string, unknown>) => {
    try {
      const payload: RegisterRequest = {
        email: String(data.email ?? data.ownerEmail ?? ""),
        password: String(data.password ?? ""),
      };
      const response = await api.post<AuthResponse>("/auth/register", payload);
      await applyAuth(response.data);
      return response.data;
    } catch (error: any) {
      throw new Error(error.friendlyMessage || "Registration failed. Please try again.");
    }
  };

  const setSelectedBusinessAuth = async (business: Business, role?: string | null) => {
    await AsyncStorage.multiSet([
      [AUTH_STORAGE_KEYS.businessId, business.id],
      [AUTH_STORAGE_KEYS.business, JSON.stringify(business)],
      [AUTH_STORAGE_KEYS.userData, JSON.stringify(business)],
    ]);
    if (role) await AsyncStorage.setItem(AUTH_STORAGE_KEYS.role, role);
    setUserData((prev) => ({
      id: prev?.id || userId || business.ownerId,
      name: business.name,
      ownerEmail: business.email,
    }));
  };

  const logout = async () => {
    try {
      await clearAuthStorage();
      await AsyncStorage.removeItem("HAS_FINISHED_ONBOARDING");
      setIsAuthenticated(false);
      setUserId(null);
      setUserData(null);
      setAuthTokens(null);
      router.replace("/onboarding");
    } catch (error) {
      console.error("Error during logout:", error);
    }
  };

  const value = useMemo<AuthContextType>(
    () => ({
      isAuthenticated,
      userId,
      userData,
      authTokens,
      isLoading,
      login,
      loginWithGoogle,
      register,
      setSelectedBusinessAuth,
      logout,
    }),
    [isAuthenticated, userId, userData, authTokens, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
