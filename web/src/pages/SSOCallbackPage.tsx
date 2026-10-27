import { useEffect } from "react";
import { useClerk } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";

export function SSOCallbackPage() {
  const clerk = useClerk();
  const navigate = useNavigate();

  useEffect(() => {
    void clerk.handleRedirectCallback({
      signInUrl: "/login",
      signUpUrl: "/login?mode=signup",
    });
    const t = setTimeout(() => navigate("/", { replace: true }), 1500);
    return () => clearTimeout(t);
  }, [clerk, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper">
      <p className="text-muted">Completing sign in…</p>
    </div>
  );
}
