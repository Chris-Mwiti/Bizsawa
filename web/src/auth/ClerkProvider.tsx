import { ClerkProvider } from "@clerk/clerk-react";
import { useEffect, useState } from "react";

interface ClerkProviderProps {
  children: React.ReactNode;
  publishableKey: string;
}

export function ClerkProviderWrapper({ children, publishableKey }: ClerkProviderProps) {
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
    <ClerkProvider publishableKey={publishableKey}>
      {children}
    </ClerkProvider>
  );
}