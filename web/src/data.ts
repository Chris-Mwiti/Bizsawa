import {
  BarChart3,
  Bot,
  CloudOff,
  PackageSearch,
  ReceiptText,
  ScanLine,
  Smartphone,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type Lang = "en" | "sw";

export const strings: Record<
  Lang,
  {
    features: string;
    coach: string;
    offline: string;
    stories: string;
    start: string;
    explore: string;
    heroTitleA: string;
    heroTitleB: string;
    heroEyebrow: string;
    heroSub: string;
    cardTitleA: string;
    cardTitleB: string;
    cardSub: string;
    stripTitle: string;
    stripBody: string;
    stripRight: string;
  }
> = {
  en: {
    features: "Features",
    coach: "AI Coach",
    offline: "Offline",
    stories: "Stories",
    start: "START",
    explore: "Explore Features",
    heroTitleA: "Effortless",
    heroTitleB: "Selling",
    heroEyebrow: "Cutting-edge counter craft.",
    heroSub: "We keep your shop's books.",
    cardTitleA: "Full shop,",
    cardTitleB: "one ledger.",
    cardSub: "From sale to restock.",
    stripTitle: "We work without signal.",
    stripBody: "Sell all day with no bars. Everything syncs when you are back.",
    stripRight: "WE COMBINE COUNTER & CLOUD COMFORT",
  },
  sw: {
    features: "Huduma",
    coach: "Kocha AI",
    offline: "Nje ya mtandao",
    stories: "Hadithi",
    start: "ANZA",
    explore: "Chunguza Huduma",
    heroTitleA: "Mauzo",
    heroTitleB: "Rahisi",
    heroEyebrow: "Ufundi wa kisasa wa kaunta.",
    heroSub: "Tunatunza vitabu vya duka lako.",
    cardTitleA: "Duka zima,",
    cardTitleB: "kitabu kimoja.",
    cardSub: "Kuanzia mauzo hadi kupanga upya.",
    stripTitle: "Tunafanya kazi bila mtandao.",
    stripBody: "Uza siku nzima bila network. Kila kitu kitasawazishwa ukirudi.",
    stripRight: "TUNAUNGANISHA KAUNTA NA WINGU",
  },
};

export type FeatureVisual = "receipt" | "stock" | "chat" | "sync" | "cash";

export interface Feature {
  id: string;
  icon: LucideIcon;
  title: string;
  tagline: string;
  description: string;
  steps: [string, string, string];
  metric: string;
  metricLabel: string;
  visual: FeatureVisual;
}

export const features: Feature[] = [
  {
    id: "pos",
    icon: ScanLine,
    title: "Point of sale",
    tagline: "A sale in under 10 seconds",
    description:
      "One thumb, one task. Record walk-in sales and orders from the shop floor without leaving the customer waiting.",
    steps: ["Pick items from your catalogue", "Take cash or M-Pesa", "Receipt prints, stock drops"],
    metric: "<10s",
    metricLabel: "per sale",
    visual: "receipt",
  },
  {
    id: "inventory",
    icon: PackageSearch,
    title: "Inventory",
    tagline: "Know what to restock",
    description:
      "Every sale moves stock. Low-stock warnings arrive before the shelf goes empty, not after.",
    steps: ["Stock moves with each sale", "Low-stock alerts per item", "Restock list in one tap"],
    metric: "0",
    metricLabel: "empty shelves",
    visual: "stock",
  },
  {
    id: "invoices",
    icon: ReceiptText,
    title: "Invoices + WhatsApp",
    tagline: "Chase overdue over chat",
    description:
      "Send invoices where the conversation already happens. Reminders go out over WhatsApp, payments reconcile on arrival.",
    steps: ["Invoice from an order", "Send over WhatsApp", "Auto-remind when overdue"],
    metric: "2×",
    metricLabel: "faster collection",
    visual: "receipt",
  },
  {
    id: "expenses",
    icon: Wallet,
    title: "Expenses",
    tagline: "Every shilling, accounted",
    description:
      "Rent, stock runs, airtime. Log money-out in seconds and see true profit at night, not wishful profit.",
    steps: ["Log money-out in seconds", "Grouped by category", "True profit nightly"],
    metric: "KES",
    metricLabel: "true profit",
    visual: "cash",
  },
  {
    id: "mpesa",
    icon: Smartphone,
    title: "M-Pesa payments",
    tagline: "The rail you already use",
    description:
      "Daraja-native payments reconcile against invoices automatically. No more matching texts to sales by hand.",
    steps: ["Customer pays by M-Pesa", "Payment matches invoice", "Balance clears itself"],
    metric: "24/7",
    metricLabel: "reconciliation",
    visual: "cash",
  },
  {
    id: "analytics",
    icon: BarChart3,
    title: "Analytics",
    tagline: "Today's cash in one glance",
    description:
      "Pre-computed aggregates, not dashboard toys. Open at 7am, confirm open orders, trust the profit figure at night.",
    steps: ["Today's cash on open", "Trend plus percentage", "Every number links to its rows"],
    metric: "7am",
    metricLabel: "cash glance",
    visual: "cash",
  },
  {
    id: "coach",
    icon: Bot,
    title: "AI Coach",
    tagline: "Ask about your own numbers",
    description:
      "A conversational assistant that acts on your real sales, stock and invoices — in English or Kiswahili.",
    steps: ["Ask in plain words", "It reads your ledger", "Act: remind, restock, explain"],
    metric: "en+sw",
    metricLabel: "bilingual replies",
    visual: "chat",
  },
  {
    id: "offline",
    icon: CloudOff,
    title: "Offline-first",
    tagline: "No bars, no problem",
    description:
      "Your phone is the source of truth. Keep selling with zero signal; everything syncs when connectivity returns.",
    steps: ["Sell fully offline", "Queue syncs itself", "No double-charges, ever"],
    metric: "100%",
    metricLabel: "works offline",
    visual: "sync",
  },
];
