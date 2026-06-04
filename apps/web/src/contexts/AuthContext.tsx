"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import axios from "axios";
import api, { setToken } from "@/lib/api";
import type { User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Rotas públicas — não tentam refresh (evita 401 no console na landing). */
function isPublicRoute(path: string): boolean {
  if (path === "/") return true;
  const prefixes = [
    "/login",
    "/register",
    "/forgot-password",
    "/solucao",
  ];
  return prefixes.some((p) => path === p || path.startsWith(`${p}/`));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      // Use plain axios (bypasses the retry interceptor) so we don't loop
      const { data } = await axios.post(
        "/api/v1/auth/refresh",
        {},
        { withCredentials: true }
      );
      setToken(data.access_token);
      const { data: me } = await api.get<User>("/auth/me");
      setUser(me);
    } catch {
      // No valid session — stay on whatever page we're on (auth pages handle this)
      setUser(null);
      setToken(null);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined" && isPublicRoute(window.location.pathname)) {
      setLoading(false);
      return;
    }
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const { data } = await api.post("/auth/login", { email, password });
    setToken(data.access_token);
    const { data: me } = await api.get<User>("/auth/me");
    setUser(me);
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      setToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
