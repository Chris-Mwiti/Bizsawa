import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";

export type DataQuality = "full" | "partial" | "none";

export interface TrustComponent {
  id: string;
  label: string;
  score: number;
  weight: number;
  contribution: number;
  dataQuality: DataQuality;
  detail: string;
}

export interface WeightExplained {
  id: string;
  label: string;
  description: string;
}

export interface ActionableInsight {
  title: string;
  detail: string;
}

export interface LoanProduct {
  id: string;
  institution: string;
  logo: string;
  product: string;
  type: "bank" | "sacco" | "government";
  maxAmount: number;
  interestRate: string;
  term: string;
  requirements: string[];
  applyUrl: string;
  tag: string;
  tagColor: string;
  suitedFor: string[];
}

export interface CreditTrustPreview {
  success: boolean;
  generatedAt: string;
  language: string;
  trustScore: number;
  ratingLabel: string;
  illustrativeLoanCeiling: number;
  components: TrustComponent[];
  weightsExplained: WeightExplained[];
  strings: { headline: string; summary: string };
  actionableInsights: ActionableInsight[];
  disclaimer: string;
  loanProviders: LoanProduct[];
  signals: {
    totalSales90d: number;
    paidOrders90d: number;
    totalOrders90d: number;
    productCount: number;
    monthsTenure: number;
  };
}

export function useCreditTrustPreview(language: "en" | "sw" = "en", enabled = true) {
  return useQuery({
    queryKey: ["credit", "trust-preview", language],
    queryFn: async () => {
      const response = await api.get<CreditTrustPreview>("/credit/trust-preview", {
        params: { language },
      });
      return response.data;
    },
    enabled,
  });
}
