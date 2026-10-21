import { ClerkProvider } from "@clerk/clerk-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

interface ClerkProviderProps {
  children: React.ReactNode;
  publishableKey: string;
}

export function ClerkProviderWrapper({ children, publishableKey }: ClerkProviderProps) {
  const navigate = useNavigate();
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setIsLoaded(true);
    }
  }, []);

  if (!isLoaded) {
    return null;
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
    >
      {children}
    </ClerkProvider>
  );
}
