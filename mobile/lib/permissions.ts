import type { Role } from "./api-dtos";

type Action = "read" | "write" | "delete" | "configure" | "generate";

const ownerResources = [
  "businesses",
  "members",
  "products",
  "customers",
  "orders",
  "sales",
  "inventory",
  "expenses",
  "taxes",
  "invoices",
  "payments",
  "reports",
  "visualizations",
  "insights",
  "ai",
  "whatsapp",
];

const managerResources = ownerResources.filter((resource) => resource !== "payments");

const policy: Record<Role, Record<string, Action[]>> = {
  OWNER: Object.fromEntries(ownerResources.map((resource) => [resource, ["read", "write", "delete", "configure", "generate"]])) as Record<string, Action[]>,
  MANAGER: Object.fromEntries(managerResources.map((resource) => [resource, ["read", "write", "configure", "generate"]])) as Record<string, Action[]>,
  CASHIER: {
    products: ["read"],
    customers: ["read", "write"],
    orders: ["read", "write"],
    sales: ["read", "write"],
    inventory: ["read"],
    expenses: ["read", "write"],
    invoices: ["read"],
    insights: ["read"],
    visualizations: ["read"],
  },
  VIEWER: {
    products: ["read"],
    customers: ["read"],
    orders: ["read"],
    sales: ["read"],
    inventory: ["read"],
    reports: ["read"],
    visualizations: ["read"],
    insights: ["read"],
  },
};

export function canRole(role: Role | null | undefined, resource: string, action: Action): boolean {
  if (!role) return false;
  return policy[role]?.[resource]?.includes(action) ?? false;
}
