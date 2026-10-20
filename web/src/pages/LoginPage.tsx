import { SignIn, SignUp } from "@clerk/clerk-react";
import { useAuth } from "../auth/AuthContext";
import { useState } from "react";

export function LoginPage() {
  const { isSignedIn, user, signOut } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  if (isSignedIn && user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="text-center p-8">
          <h1 className="text-3xl font-bold text-ink mb-4">Welcome, {user.name || user.email}!</h1>
          <p className="text-muted mb-8">You are signed in.</p>
          <button
            onClick={() => signOut()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-ink text-paper rounded-lg hover:bg-ink/80 transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-ink mb-2">Welcome to BizWorth</h1>
          <p className="text-muted">Sign in to continue</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 border border-gray-200 dark:border-gray-700">
          <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setMode("signin")}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                mode === "signin"
                  ? "bg-ink text-paper"
                  : "text-muted hover:text-ink"
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => setMode("signup")}
              className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                mode === "signup"
                  ? "bg-ink text-paper"
                  : "text-muted hover:text-ink"
              }`}
            >
              Sign Up
            </button>
          </div>

          {mode === "signin" ? (
            <SignIn
              routing="path"
              path="/login"
              signUpUrl="/login?mode=signup"
              appearance={{
                elements: {
                  formButtonPrimary: "bg-ink hover:bg-ink/80 text-paper",
                  card: "shadow-none border-none bg-transparent",
                  headerTitle: "text-2xl font-bold text-ink",
                  headerSubtitle: "text-muted",
                  dividerLine: "bg-gray-200 dark:bg-gray-700",
                  socialButtonsBlockButton: "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800",
                },
              }}
            />
          ) : (
            <SignUp
              routing="path"
              path="/login"
              signInUrl="/login?mode=signin"
              appearance={{
                elements: {
                  formButtonPrimary: "bg-ink hover:bg-ink/80 text-paper",
                  card: "shadow-none border-none bg-transparent",
                  headerTitle: "text-2xl font-bold text-ink",
                  headerSubtitle: "text-muted",
                  dividerLine: "bg-gray-200 dark:bg-gray-700",
                  socialButtonsBlockButton: "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800",
                },
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}