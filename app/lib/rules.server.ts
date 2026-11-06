// Admin API calls for rules. Every call goes through `admin.graphql`, so tests can pass a fake.
import {
  buildConfig,
  validateRule,
  FREE_RULE_LIMIT,
  type PlanName,
  type Rule,
} from "../../shared/rules-engine.js";

export type GraphqlClient = (
  query: string,
  options?: { variables?: Record<string, unknown> },
) => Promise<{ json: () => Promise<any> }>;
export type AdminLike = { graphql: GraphqlClient };

export const NS = "$app:checkout-rules";
export const CONFIG_KEY = "function-configuration";
export const RULES_KEY = "rules";
export const PAYMENT_TITLE = "Zovo payment rules";
export const DELIVERY_TITLE = "Zovo shipping rules";

export type Customization = { id: string; enabled: boolean } | null;
export type State = {
  rules: Rule[];
  installationId: string;
  partnerDevelopment: boolean;
  functions: { payment: string | null; delivery: string | null };
  customizations: { payment: Customization; delivery: Customization };
};

async function gql(
  admin: AdminLike,
  query: string,
  variables?: Record<string, unknown>,
) {
  const res = await admin.graphql(query, variables ? { variables } : undefined);
  const body = await res.json();
  if (body.errors?.length)
    throw new Error(
      `Admin API error: ${body.errors.map((e: any) => e.message).join("; ")}`,
    );
  return body.data;
}

const STATE_QUERY = `#graphql
  query ZovoRulesState {
    shop { plan { partnerDevelopment } }
    currentAppInstallation {
      id
      app { apiKey }
      rules: metafield(namespace: "$app:checkout-rules", key: "rules") { jsonValue }
    }
    shopifyFunctions(first: 50) { nodes { id apiType app { apiKey } } }
    paymentCustomizations(first: 50) { nodes { id title enabled functionId } }
    deliveryCustomizations(first: 50) { nodes { id title enabled functionId } }
  }`;

export async function loadState(admin: AdminLike): Promise<State> {
  const d = await gql(admin, STATE_QUERY);
  const apiKey = d.currentAppInstallation?.app?.apiKey;
  const ours = (d.shopifyFunctions?.nodes || []).filter(
    (f: any) => !apiKey || f.app?.apiKey === apiKey,
  );
  const fn = (t: string) =>
    ours.find((f: any) => String(f.apiType).toLowerCase() === t)?.id ?? null;
  const functions = {
    payment: fn("payment_customization"),
    delivery: fn("delivery_customization"),
  };
  const pick = (nodes: any[], functionId: string | null): Customization => {
    const c = (nodes || []).find(
      (n) => functionId && n.functionId === functionId,
    );
    return c ? { id: c.id, enabled: Boolean(c.enabled) } : null;
  };
  const raw = d.currentAppInstallation?.rules?.jsonValue;
  const rules: Rule[] = Array.isArray(raw)
    ? raw.filter((r) => validateRule(r).length === 0)
    : [];
  return {
    rules,
    installationId: d.currentAppInstallation?.id,
    partnerDevelopment: Boolean(d.shop?.plan?.partnerDevelopment),
    functions,
    customizations: {
      payment: pick(d.paymentCustomizations?.nodes, functions.payment),
      delivery: pick(d.deliveryCustomizations?.nodes, functions.delivery),
    },
  };
}

const SET_MUTATION = `#graphql
  mutation ZovoSaveRules($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id key }
      userErrors { field message code }
    }
  }`;

/** Save the rule list on the app installation and the Function config on each customization. */
export async function saveRules(
  admin: AdminLike,
  state: State,
  rules: Rule[],
  plan: PlanName,
) {
  const config = JSON.stringify(buildConfig(rules, plan));
  const metafields: Record<string, string>[] = [
    {
      ownerId: state.installationId,
      namespace: NS,
      key: RULES_KEY,
      type: "json",
      value: JSON.stringify(rules),
    },
  ];
  for (const c of [
    state.customizations.payment,
    state.customizations.delivery,
  ]) {
    if (c)
      metafields.push({
        ownerId: c.id,
        namespace: NS,
        key: CONFIG_KEY,
        type: "json",
        value: config,
      });
  }
  const d = await gql(admin, SET_MUTATION, { metafields });
  const errs = d.metafieldsSet?.userErrors || [];
  if (errs.length) throw new Error(errs.map((e: any) => e.message).join("; "));
  return { saved: metafields.length };
}

const CREATE_PAYMENT = `#graphql
  mutation ZovoCreatePayment($input: PaymentCustomizationInput!) {
    paymentCustomizationCreate(paymentCustomization: $input) {
      paymentCustomization { id enabled }
      userErrors { field message }
    }
  }`;
const CREATE_DELIVERY = `#graphql
  mutation ZovoCreateDelivery($input: DeliveryCustomizationInput!) {
    deliveryCustomizationCreate(deliveryCustomization: $input) {
      deliveryCustomization { id enabled }
      userErrors { field message }
    }
  }`;

/** Create the two checkout customizations that run our Functions. Safe to call twice. */
export async function activate(admin: AdminLike, state: State, plan: PlanName) {
  const config = JSON.stringify(buildConfig(state.rules, plan));
  const metafields = [
    { namespace: NS, key: CONFIG_KEY, type: "json", value: config },
  ];
  const out: string[] = [];
  if (!state.functions.payment || !state.functions.delivery) {
    throw new Error(
      "The app Functions are not deployed to this store yet. Run `shopify app deploy` first.",
    );
  }
  if (!state.customizations.payment) {
    const d = await gql(admin, CREATE_PAYMENT, {
      input: {
        functionId: state.functions.payment,
        title: PAYMENT_TITLE,
        enabled: true,
        metafields,
      },
    });
    const e = d.paymentCustomizationCreate?.userErrors || [];
    if (e.length) throw new Error(e.map((x: any) => x.message).join("; "));
    out.push("payment");
  }
  if (!state.customizations.delivery) {
    const d = await gql(admin, CREATE_DELIVERY, {
      input: {
        functionId: state.functions.delivery,
        title: DELIVERY_TITLE,
        enabled: true,
        metafields,
      },
    });
    const e = d.deliveryCustomizationCreate?.userErrors || [];
    if (e.length) throw new Error(e.map((x: any) => x.message).join("; "));
    out.push("delivery");
  }
  return out;
}

/** How many saved rules checkout will apply on this plan. */
export function usage(rules: Rule[], plan: PlanName) {
  const enabled = rules.filter((r) => r.enabled !== false).length;
  const limit = plan === "pro" ? null : FREE_RULE_LIMIT;
  return {
    enabled,
    limit,
    overLimit: limit === null ? 0 : Math.max(0, enabled - limit),
  };
}
