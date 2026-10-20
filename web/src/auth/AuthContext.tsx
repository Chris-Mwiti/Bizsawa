import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth as useClerkAuth, useSession } from "@clerk/clerk-react";
import { api } from "./api";

interface User {
  id: string;
  email: string;
  name?: string;
  image?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isSignedIn: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { isSignedIn, isLoaded } = useClerkAuth();
  const { session } = useSession();

  useEffect(() => {
    if (isLoaded && isSignedIn && session) {
      initializeSession();
    } else if (isLoaded && !isSignedIn) {
      setUser(null);
      setIsLoading(false);
    }
  }, [isLoaded, isSignedIn, session]);

  const initializeSession = async () => {
    if (!session) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const token = await session.getToken();
      if (!token) {
        setUser(null);
        setIsLoading(false);
        return;
      }

      const response = await api.post("/auth/clerk", { token });
      const { accessToken, refreshToken, userId } = response.data;

      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("refreshToken", refreshToken);
      localStorage.setItem("userId", userId);

      setUser({
        id: userId,
        email: response.data.email,
        name: response.data.name,
        image: response.data.image,
      });
    } catch (error) {
      console.error("Failed to initialize session:", error);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const refreshSession = async () => {
    if (!session) return;
    const token = await session.getToken();
    if (!token) return;

    try {
      const response = await api.post("/auth/clerk", { token });
      const { accessToken, refreshToken, userId } = response.data;

      localStorage.setItem("accessToken", accessToken);
      localStorage.setItem("refreshToken", refreshToken);
      localStorage.setItem("userId", userId);

      setUser({
        id: userId,
        email: response.data.email,
        name: response.data.name,
        image: response.data.image,
      });
    } catch (error) {
      console.error("Failed to refresh session:", error);
    }
  };

  const signOut = async () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("userId");
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isSignedIn: !!isSignedIn,
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}