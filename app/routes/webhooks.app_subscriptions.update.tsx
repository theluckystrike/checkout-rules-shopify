import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { loadState, saveRules } from "../lib/rules.server";
import { PRO_PLANS } from "../lib/plans";

/** Plan from an app_subscriptions/update payload. Only an ACTIVE Pro subscription counts. */
export function planFromPayload(payload: any): "pro" | "free" {
  const s = payload?.app_subscription;
  return s &&
    s.status === "ACTIVE" &&
    (PRO_PLANS as readonly string[]).includes(s.name)
    ? "pro"
    : "free";
}

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  if (admin) {
    const state = await loadState(admin as any);
    await saveRules(admin as any, state, state.rules, planFromPayload(payload));
  }
  return new Response();
};
