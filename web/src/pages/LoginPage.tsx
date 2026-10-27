import { SignIn, SignUp } from "@clerk/clerk-react";
import { useAuth } from "../auth/AuthContext";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";

const HOME_PATH = "/";

export function LoginPage() {
  const { isSignedIn } = useAuth();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const mode = searchParams.get("mode") === "signup" ? "signup" : "signin";

  // Clerk owns sub-routes of the sign-in path (e.g. /login/sso-callback).
  // Those must keep rendering this page so Clerk can finish the flow.
  const isClerkCallbackRoute =
    location.pathname !== "/login" && location.pathname.startsWith("/login/");

  const setMode = (next: "signin" | "signup") => {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (next === "signup") {
          nextParams.set("mode", "signup");
        } else {
          nextParams.delete("mode");
        }
        return nextParams;
      },
      { replace: true }
    );
  };

  if (isSignedIn && !isClerkCallbackRoute) {
    return <Navigate to={HOME_PATH} replace />;
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
              fallbackRedirectUrl={HOME_PATH}
              signUpFallbackRedirectUrl={HOME_PATH}
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
              fallbackRedirectUrl={HOME_PATH}
              signInFallbackRedirectUrl={HOME_PATH}
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