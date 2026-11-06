// Loader and action logic for the admin routes. Server only: routes call these inside loader/action.
import { redirect } from "react-router";
import { activate, loadState, saveRules, usage } from "./rules.server";
import { PRO_PLANS, currentPlan, isTestCharge } from "./plans";
import { describeRule, ruleFromForm } from "./rule-form";
import { parseSample, DEFAULT_SAMPLE, type Fields } from "./sample";
import { MAX_PRODUCT_TAGS, collectTags, simulate, type Rule } from "../../shared/rules-engine.js";

export async function rulesDashboard(admin: any, billing: any, url?: URL) {
  const state = await loadState(admin);
  const { plan } = await currentPlan(
    billing,
    isTestCharge(state.partnerDevelopment),
  );
  return {
    saved: url?.searchParams.get("saved") ?? null,
    plan,
    usage: usage(state.rules, plan),
    functionsReady: Boolean(
      state.functions.payment && state.functions.delivery,
    ),
    active: Boolean(
      state.customizations.payment && state.customizations.delivery,
    ),
    rules: state.rules.map((r) => ({ ...r, summary: describeRule(r) })),
  };
}

export async function rulesAction(admin: any, billing: any, form: FormData) {
  const intent = String(form.get("intent") || "");
  const id = String(form.get("id") || "");
  const state = await loadState(admin);
  const { plan } = await currentPlan(
    billing,
    isTestCharge(state.partnerDevelopment),
  );
  let rules: Rule[] = [...state.rules];
  const at = rules.findIndex((r) => r.id === id);
  if (intent === "activate") {
    const made = await activate(admin, state, plan);
    return {
      ok: true,
      message: made.length
        ? "Checkout rules are on."
        : "Checkout rules were already on.",
    };
  }
  if (at < 0)
    return {
      ok: false,
      message: "That rule no longer exists. Reload the page.",
    };
  if (intent === "toggle") {
    const turningOn = rules[at].enabled === false;
    if (
      turningOn &&
      plan === "free" &&
      usage(rules, plan).enabled >= (usage(rules, plan).limit ?? Infinity)
    ) {
      return {
        ok: false,
        message:
          "The free plan runs 3 rules at a time. Turn one off first, or move to Pro.",
      };
    }
    rules[at] = { ...rules[at], enabled: turningOn };
  } else if (intent === "delete") {
    rules.splice(at, 1);
  } else if (intent === "up" && at > 0) {
    [rules[at - 1], rules[at]] = [rules[at], rules[at - 1]];
  } else if (intent === "down" && at < rules.length - 1) {
    [rules[at + 1], rules[at]] = [rules[at], rules[at + 1]];
  } else {
    return { ok: false, message: "Unknown action." };
  }
  await saveRules(admin, state, rules, plan);
  return {
    ok: true,
    message: "Saved. Checkout uses the new rules within a minute.",
  };
}

export async function editorData(admin: any, url: URL) {
  const state = await loadState(admin);
  const id = url.searchParams.get("rule");
  const rule = id ? (state.rules.find((r) => r.id === id) ?? null) : null;
  const kind =
    url.searchParams.get("kind") === "payment" ? "payment" : "delivery";
  return {
    rule,
    isNew: !rule,
    defaultKind: (rule?.kind ?? kind) as Rule["kind"],
    missing: Boolean(id && !rule),
  };
}

export async function saveRuleAction(admin: any, billing: any, form: FormData) {
  const state = await loadState(admin);
  const { plan } = await currentPlan(
    billing,
    isTestCharge(state.partnerDevelopment),
  );
  const existingId = String(form.get("id") || "") || undefined;
  const { rule, errors } = ruleFromForm(form, existingId);
  if (errors.length) return { errors };
  const rules = [...state.rules];
  const at = rules.findIndex((r) => r.id === rule.id);
  const wasOn = at >= 0 && rules[at].enabled !== false;
  let note = "";
  if (rule.enabled !== false && !wasOn && plan === "free") {
    const u = usage(rules, plan);
    if (u.limit !== null && u.enabled >= u.limit) {
      rule.enabled = false;
      note = "off";
    }
  }
  if (at >= 0) rules[at] = rule;
  else rules.push(rule);
  const productTags = collectTags(rules).productTags;
  if (productTags.length > MAX_PRODUCT_TAGS) {
    return {
      errors: [
        `Rules can use ${MAX_PRODUCT_TAGS} different product tags in total, and this rule would make it ${productTags.length}. Checkout reads each tag on every cart line, so more tags slow it down.`,
      ],
    };
  }
  if (
    state.functions.payment &&
    state.functions.delivery &&
    (!state.customizations.payment || !state.customizations.delivery)
  ) {
    await activate(admin, state, plan);
    Object.assign(state, await loadState(admin));
  }
  await saveRules(admin, state, rules, plan);
  return redirect(`/app?saved=${note || "1"}`);
}

export async function testerData(admin: any, billing: any) {
  const state = await loadState(admin);
  const { plan } = await currentPlan(
    billing,
    isTestCharge(state.partnerDevelopment),
  );
  return { plan, ruleCount: state.rules.length, rules: state.rules };
}

export async function testerAction(admin: any, billing: any, form: FormData) {
  const d = await testerData(admin, billing);
  const fields = Object.fromEntries(
    Object.keys(DEFAULT_SAMPLE).map((k) => [k, String(form.get(k) ?? "")]),
  ) as Fields;
  const result = simulate(d.rules, d.plan, parseSample(fields));
  return { fields, result };
}

export async function planData(admin: any, billing: any) {
  const state = await loadState(admin);
  const test = isTestCharge(state.partnerDevelopment);
  const { plan, subscription } = await currentPlan(billing, test);
  return { plan, subscription, test, ruleCount: state.rules.length };
}

export async function planAction(admin: any, billing: any, form: FormData) {
  const intent = String(form.get("intent") || "");
  const state = await loadState(admin);
  const isTest = isTestCharge(state.partnerDevelopment);
  if (intent === "subscribe") {
    const plan = String(form.get("plan") || "");
    if (!(PRO_PLANS as readonly string[]).includes(plan))
      return { ok: false, message: "Unknown plan." };
    // Throws a redirect to the Shopify approval page. Shopify shows the price, trial and terms there.
    await billing.request({ plan, isTest });
    return { ok: true, message: "" };
  }
  if (intent === "cancel") {
    const { subscription } = await currentPlan(billing, isTest);
    if (!subscription)
      return { ok: false, message: "There is no Pro subscription to cancel." };
    await billing.cancel({
      subscriptionId: subscription.id,
      isTest,
      prorate: true,
    });
    // Checkout falls back to the first 3 enabled rules right away.
    await saveRules(admin, state, state.rules, "free");
    return {
      ok: true,
      message:
        "Pro is cancelled. Your rules are kept, and the first 3 enabled rules keep running.",
    };
  }
  return { ok: false, message: "Unknown action." };
}
