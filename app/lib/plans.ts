// Plan names used by the Shopify Billing API config in shopify.server.ts and by the routes.
export const PRO_MONTHLY = "Pro Monthly";
export const PRO_ANNUAL = "Pro Annual";
export const PRO_PLANS = [PRO_MONTHLY, PRO_ANNUAL] as const;
export const PRICES = { [PRO_MONTHLY]: 4.99, [PRO_ANNUAL]: 49 } as const;
export const TRIAL_DAYS = 7;
export const SPONSORS_URL = "https://github.com/sponsors/theluckystrike";

/**
 * Development stores can only take test charges. Real stores get real charges.
 * SHOPIFY_BILLING_TEST=1 forces test charges everywhere (use it on a staging host).
 */
export const isTestCharge = (partnerDevelopment: boolean) =>
  partnerDevelopment || process.env.SHOPIFY_BILLING_TEST === "1";

type BillingLike = {
  check: (o: {
    plans: string[];
    isTest: boolean;
  }) => Promise<{
    hasActivePayment: boolean;
    appSubscriptions: {
      id: string;
      name: string;
      test?: boolean;
      status?: string;
    }[];
  }>;
};

/** Ask Shopify which plan this store pays for. No local copy, so it cannot drift. */
export async function currentPlan(billing: BillingLike, isTest: boolean) {
  const r = await billing.check({ plans: [...PRO_PLANS], isTest });
  const sub = r.appSubscriptions?.[0] ?? null;
  return {
    plan: (r.hasActivePayment ? "pro" : "free") as "pro" | "free",
    subscription: sub,
  };
}
