"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AlertCircle, Landmark, LogOut, Loader2 } from "lucide-react";
import {
  clearToken,
  fetchMe,
  getToken,
  loginWithGoogle,
  setToken,
  type AuthUser,
} from "@/lib/api";
import { GoogleButton } from "./google-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
const ALLOWED_DOMAIN = "gatpsolutions.com";

type AuthContextValue = { user: AuthUser | null; logout: () => void };
const AuthContext = createContext<AuthContextValue>({ user: null, logout: () => {} });
export const useAuth = () => useContext(AuthContext);

export function AuthGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore an existing session on mount.
  useEffect(() => {
    if (!getToken()) {
      setReady(true);
      return;
    }
    fetchMe()
      .then((r) => setUser(r.user))
      .catch(() => clearToken())
      .finally(() => setReady(true));
  }, []);

  const handleCredential = useCallback(async (credential: string) => {
    setError(null);
    try {
      const { token, user: u } = await loginWithGoogle(credential);
      setToken(token);
      setUser(u);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-svh items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="items-center text-center">
            <div className="mx-auto mb-2 flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Landmark className="size-6" />
            </div>
            <CardTitle>Empire · Month-end close</CardTitle>
            <CardDescription>
              Sign in with your{" "}
              <span className="font-medium text-foreground">@{ALLOWED_DOMAIN}</span> account.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            {CLIENT_ID ? (
              <GoogleButton clientId={CLIENT_ID} onCredential={handleCredential} />
            ) : (
              <p className="text-center text-sm text-muted-foreground">
                Google sign-in isn&apos;t configured. Set{" "}
                <code className="text-xs">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>.
              </p>
            )}
            {error && (
              <div className="flex items-center gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="size-4 shrink-0" />
                {error}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, logout }}>
      <div className="flex min-h-svh flex-col">
        <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 md:px-6">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Landmark className="size-4" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Empire</p>
              <p className="text-xs text-muted-foreground">Month-end close</p>
            </div>
            <div className="ml-auto flex items-center gap-3 text-sm">
              <span className="hidden text-muted-foreground sm:inline">{user.email}</span>
              <Button variant="outline" size="sm" onClick={logout}>
                <LogOut className="size-3.5" />
                Sign out
              </Button>
            </div>
          </div>
        </header>
        <div className="flex-1">{children}</div>
      </div>
    </AuthContext.Provider>
  );
}
