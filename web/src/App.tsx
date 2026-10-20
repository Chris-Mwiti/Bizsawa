import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ClerkProviderWrapper } from "./auth/ClerkProvider";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import { Features } from "./components/Features";
import { Hero } from "./components/Hero";
import { Footer, Landing } from "./components/Landing";
import { Nav, type View } from "./components/Nav";
import { LoginPage } from "./pages/LoginPage";
import type { Lang } from "./data";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY || "";

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoading } = useAuth();
  if (isLoading) return null;
  return isSignedIn ? <>{children}</> : <Navigate to="/login" />;
}

function App() {
  const [view, setView] = useState<View>("landing");
  const [lang, setLang] = useState<Lang>("en");

  return (
    <ClerkProviderWrapper publishableKey={PUBLISHABLE_KEY}>
      <BrowserRouter>
        <AuthProvider>
          <div id="top" className="min-h-[100dvh] bg-paper font-sans text-ink">
            <Nav lang={lang} setLang={setLang} setView={setView} />
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/*"
                element={
                  <PrivateRoute>
                    {view === "landing" ? (
                      <>
                        <Hero lang={lang} setView={setView} />
                        <Landing lang={lang} setView={setView} />
                      </>
                    ) : (
                      <Features />
                    )}
                  </PrivateRoute>
                }
              />
            </Routes>
            <Footer setView={setView} />
          </div>
        </AuthProvider>
      </BrowserRouter>
    </ClerkProviderWrapper>
  );
}

export default App;