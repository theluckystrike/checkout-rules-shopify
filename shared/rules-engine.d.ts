export type Kind = "delivery" | "payment";
export type Condition = { field: string; op: string; value?: number | string | string[] };
export type Rule = {
  id: string;
  kind: Kind;
  enabled?: boolean;
  action: "hide" | "rename" | "move";
  target: { match?: "contains" | "equals"; text: string };
  newName?: string;
  position?: "top" | "bottom";
  when?: "all" | "any";
  conditions?: Condition[];
  label?: string;
};
export type PlanName = "free" | "pro";
export const FREE_RULE_LIMIT: number;
export const MAX_PRODUCT_TAGS: number;
export const METAFIELD_NAMESPACE: string;
export const METAFIELD_KEY: string;
export const ACTIONS: string[];
export const FIELDS: Record<string, { ops: string[]; type: "number" | "list" | "none"; paymentOnly?: boolean }>;
export function validateRule(rule: unknown): string[];
export function activeRules(config: unknown, kind: Kind): Rule[];
export function collectTags(rules: Rule[]): { customerTags: string[]; productTags: string[] };
export function buildConfig(rules: Rule[], plan: PlanName): { version: number; plan: PlanName; neverHideAll: boolean; rules: Rule[]; customerTags: string[]; productTags: string[] };
export function deliveryOperations(input: unknown): { operations: any[] };
export function paymentOperations(input: unknown): { operations: any[] };
export type Sample = {
  subtotal: number; currencyRate?: number; country: string; zip?: string; customerTags?: string[]; productTags?: string[];
  b2b?: boolean; loggedIn?: boolean; itemCount?: number; weightKg?: number; deliveryMethod?: string;
  shipping: { title: string; cost: number }[]; payments: string[];
};
export function simulate(rules: Rule[], plan: PlanName, sample: Sample): {
  shipping: { visible: string[]; hidden: string[] };
  payment: { visible: string[]; hidden: string[] };
  deliveryOperations: any[]; paymentOperations: any[]; ignoredByPlan: number;
};
export type Facts = {
  subtotal: number; itemCount: number; weightKg: number; countries: Set<string>; zips: string[];
  customerTags: Set<string>; productTags: Set<string>; b2b: boolean; loggedIn: boolean; methods: Set<string>;
};
export function cartFacts(input: unknown): Facts;
export function conditionHolds(c: Condition, f: Facts): boolean;
