// @ts-check
// Rules engine shared by the two Shopify Functions (delivery and payment) and the admin cart tester.
// Pure JavaScript with no dependencies, so it runs inside the Functions wasm runtime and in Node.

/** Active rules allowed on the free plan. The Function enforces this too. */
export const FREE_RULE_LIMIT = 3;
/**
 * Product tags are read on every cart line, and that input is what costs Function instructions.
 * Measured with the Shopify function runner: 50 lines, 10 rules and 3 tags use 7.3M of the 11M limit.
 */
export const MAX_PRODUCT_TAGS = 5;
export const METAFIELD_NAMESPACE = "$app:checkout-rules";
export const METAFIELD_KEY = "function-configuration";

export const ACTIONS = ["hide", "rename", "move"];
export const FIELDS = {
  cartSubtotal: { ops: ["gte", "lt"], type: "number" },
  itemCount: { ops: ["gte", "lt"], type: "number" },
  weightKg: { ops: ["gte", "lt"], type: "number" },
  country: { ops: ["in", "notIn"], type: "list" },
  zipPrefix: { ops: ["in", "notIn"], type: "list" },
  customerTag: { ops: ["hasAny", "hasNone"], type: "list" },
  productTag: { ops: ["anyLine", "noLine"], type: "list" },
  b2b: { ops: ["is", "isNot"], type: "none" },
  loggedIn: { ops: ["is", "isNot"], type: "none" },
  deliveryMethod: { ops: ["in", "notIn"], type: "list", paymentOnly: true },
};

const TO_KG = {
  GRAMS: 0.001,
  KILOGRAMS: 1,
  OUNCES: 0.028349523125,
  POUNDS: 0.45359237,
};

/** @param {unknown} v */
const str = (v) => (typeof v === "string" ? v : "");
/** @param {unknown} v */
const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(str(v));
  return Number.isFinite(n) ? n : NaN;
};
/** @param {unknown} v @returns {string[]} */
const list = (v) =>
  Array.isArray(v) ? v.map((x) => str(x).trim()).filter(Boolean) : [];
const lower = (/** @type {string} */ s) => s.toLowerCase();

/**
 * Check one rule. Returns a list of plain-language problems (empty means valid).
 * @param {any} rule
 * @returns {string[]}
 */
export function validateRule(rule) {
  const errors = [];
  if (!rule || typeof rule !== "object") return ["Rule is missing"];
  if (rule.kind !== "delivery" && rule.kind !== "payment")
    errors.push("Pick shipping or payment");
  if (!ACTIONS.includes(rule.action)) errors.push("Pick hide, rename or move");
  if (!str(rule.target?.text).trim())
    errors.push("Enter the method name to match");
  if (rule.target?.match && !["contains", "equals"].includes(rule.target.match))
    errors.push("Match must be contains or equals");
  if (rule.action === "rename" && !str(rule.newName).trim())
    errors.push("Enter the new name");
  if (rule.action === "rename" && str(rule.newName).length > 255)
    errors.push("The new name is longer than 255 characters");
  if (rule.action === "move" && !["top", "bottom"].includes(rule.position))
    errors.push("Move to top or bottom");
  if (rule.when && !["all", "any"].includes(rule.when))
    errors.push("Match all or any conditions");
  const conds = Array.isArray(rule.conditions) ? rule.conditions : [];
  conds.forEach((c, i) => {
    const f = FIELDS[/** @type {keyof typeof FIELDS} */ (c?.field)];
    const n = i + 1;
    if (!f) return errors.push(`Condition ${n} has an unknown field`);
    if (!f.ops.includes(c.op))
      errors.push(`Condition ${n} has an unknown operator`);
    if (f.paymentOnly && rule.kind !== "payment")
      errors.push(`Condition ${n} works only in payment rules`);
    if (f.type === "number" && !(num(c.value) >= 0))
      errors.push(`Condition ${n} needs a number of 0 or more`);
    if (f.type === "list" && list(c.value).length === 0)
      errors.push(`Condition ${n} needs at least one value`);
  });
  return errors;
}

/**
 * Keep valid, enabled rules of one kind, in order, up to the plan limit.
 * @param {any} config
 * @param {"delivery"|"payment"} kind
 */
export function activeRules(config, kind) {
  const rules = Array.isArray(config?.rules) ? config.rules : [];
  const limit = config?.plan === "pro" ? Infinity : FREE_RULE_LIMIT;
  // The limit counts enabled rules of both kinds together, in saved order.
  const enabled = rules
    .filter((r) => r && r.enabled !== false && validateRule(r).length === 0)
    .slice(0, limit);
  return enabled.filter((r) => r.kind === kind);
}

/**
 * Tags the Function must ask Shopify about. They become input query variables.
 * @param {any[]} rules
 */
export function collectTags(rules) {
  const customerTags = new Set();
  const productTags = new Set();
  for (const r of rules || []) {
    for (const c of r?.conditions || []) {
      if (c?.field === "customerTag")
        list(c.value).forEach((t) => customerTags.add(t));
      if (c?.field === "productTag")
        list(c.value).forEach((t) => productTags.add(t));
    }
  }
  return {
    customerTags: [...customerTags].sort(),
    productTags: [...productTags].sort(),
  };
}

/**
 * Build the metafield JSON that both Functions read. Input variables come from the same object.
 * @param {any[]} rules
 * @param {"free"|"pro"} plan
 */
export function buildConfig(rules, plan) {
  const clean = (rules || []).filter((r) => validateRule(r).length === 0);
  return {
    version: 1,
    plan,
    neverHideAll: true,
    rules: clean,
    ...collectTags(clean),
  };
}

/**
 * Turn Function input (delivery or payment) into flat facts the conditions read.
 * @param {any} input
 */
export function cartFacts(input) {
  const cart = input?.cart || {};
  const rate = num(input?.presentmentCurrencyRate);
  const presentment = num(cart.cost?.subtotalAmount?.amount);
  // Rule amounts are in shop currency. Cart amounts are in the buyer's currency.
  const subtotal =
    rate > 0 && Number.isFinite(presentment) ? presentment / rate : presentment;
  const customerTags = new Set();
  for (const t of cart.buyerIdentity?.customer?.hasTags || [])
    if (t?.hasTag) customerTags.add(lower(str(t.tag)));
  const productTags = new Set();
  let itemCount = 0;
  let weightKg = 0;
  for (const line of cart.lines || []) {
    const q = num(line?.quantity) || 0;
    itemCount += q;
    const m = line?.merchandise || {};
    const w = num(m.weight);
    if (Number.isFinite(w))
      weightKg +=
        w * (TO_KG[/** @type {keyof typeof TO_KG} */ (m.weightUnit)] ?? 0) * q;
    for (const t of m.product?.hasTags || [])
      if (t?.hasTag) productTags.add(lower(str(t.tag)));
  }
  const countries = new Set();
  const zips = [];
  const methods = new Set();
  for (const g of cart.deliveryGroups || []) {
    const a = g?.deliveryAddress;
    if (a?.countryCode) countries.add(str(a.countryCode).toUpperCase());
    if (a?.zip) zips.push(str(a.zip).replace(/\s+/g, "").toUpperCase());
    const sel = g?.selectedDeliveryOption?.deliveryMethodType;
    if (sel) methods.add(str(sel));
  }
  return {
    subtotal,
    itemCount,
    weightKg: Math.round(weightKg * 1000) / 1000,
    countries,
    zips,
    customerTags,
    productTags,
    b2b: Boolean(cart.buyerIdentity?.purchasingCompany),
    loggedIn: Boolean(cart.buyerIdentity?.isAuthenticated),
    methods,
  };
}

/**
 * @param {any} c condition
 * @param {ReturnType<typeof cartFacts>} f facts
 */
export function conditionHolds(c, f) {
  const vals = list(c?.value);
  const n = num(c?.value);
  const cmp = (/** @type {number} */ x) => (c.op === "gte" ? x >= n : x < n);
  switch (c?.field) {
    case "cartSubtotal":
      return Number.isFinite(f.subtotal) && cmp(f.subtotal);
    case "itemCount":
      return cmp(f.itemCount);
    case "weightKg":
      return cmp(f.weightKg);
    case "country": {
      const hit = vals.some((v) => f.countries.has(v.toUpperCase()));
      return c.op === "in" ? hit : f.countries.size > 0 && !hit;
    }
    case "zipPrefix": {
      const hit = vals.some((v) =>
        f.zips.some((z) => z.startsWith(v.replace(/\s+/g, "").toUpperCase())),
      );
      return c.op === "in" ? hit : f.zips.length > 0 && !hit;
    }
    case "customerTag": {
      const hit = vals.some((v) => f.customerTags.has(lower(v)));
      return c.op === "hasAny" ? hit : !hit;
    }
    case "productTag": {
      const hit = vals.some((v) => f.productTags.has(lower(v)));
      return c.op === "anyLine" ? hit : !hit;
    }
    case "b2b":
      return c.op === "is" ? f.b2b : !f.b2b;
    case "loggedIn":
      return c.op === "is" ? f.loggedIn : !f.loggedIn;
    case "deliveryMethod": {
      const hit = vals.some((v) => f.methods.has(v));
      return c.op === "in" ? hit : f.methods.size > 0 && !hit;
    }
    default:
      return false;
  }
}

/**
 * @param {any} rule
 * @param {ReturnType<typeof cartFacts>} facts
 */
export function ruleApplies(rule, facts) {
  const conds = Array.isArray(rule.conditions) ? rule.conditions : [];
  if (conds.length === 0) return true;
  return rule.when === "any"
    ? conds.some((c) => conditionHolds(c, facts))
    : conds.every((c) => conditionHolds(c, facts));
}

/**
 * @param {any} rule
 * @param {string} name
 */
export function nameMatches(rule, name) {
  const want = lower(str(rule.target?.text).trim());
  const have = lower(str(name).trim());
  if (!want) return false;
  return rule.target?.match === "equals" ? have === want : have.includes(want);
}

/**
 * Core planner. Items are { id, name, cost? }. Returns hide, rename and move decisions.
 * Hide wins over rename and move. The first rename for an item wins.
 * @param {any[]} rules
 * @param {{id:string,name:string,cost?:number}[]} items
 * @param {ReturnType<typeof cartFacts>} facts
 * @param {boolean} neverHideAll
 */
export function plan(rules, items, facts, neverHideAll) {
  const hidden = new Set();
  /** @type {Map<string,string>} */
  const renamed = new Map();
  /** @type {{id:string,index:"top"|"bottom"}[]} */
  const moves = [];
  /** @type {{ruleId:string,itemId:string,action:string}[]} */
  const trace = [];
  for (const rule of rules) {
    if (!ruleApplies(rule, facts)) continue;
    for (const it of items) {
      if (!nameMatches(rule, it.name)) continue;
      if (rule.action === "hide") hidden.add(it.id);
      else if (rule.action === "rename" && !renamed.has(it.id))
        renamed.set(it.id, str(rule.newName).trim().slice(0, 255));
      else if (rule.action === "move")
        moves.push({ id: it.id, index: rule.position });
      trace.push({ ruleId: str(rule.id), itemId: it.id, action: rule.action });
    }
  }
  let keptBack = null;
  if (
    neverHideAll &&
    items.length > 0 &&
    items.every((it) => hidden.has(it.id))
  ) {
    // Never leave the buyer with no way to pay or ship. Keep the cheapest (or first) one.
    const sorted = [...items].sort((a, b) => (a.cost ?? 0) - (b.cost ?? 0));
    keptBack = sorted[0].id;
    hidden.delete(keptBack);
  }
  return {
    hidden,
    renamed,
    moves: moves.filter((m) => !hidden.has(m.id)),
    trace,
    keptBack,
  };
}

/**
 * Delivery Function body. Returns { operations } for cart.delivery-options.transform.run.
 * @param {any} input
 */
export function deliveryOperations(input) {
  const config = input?.deliveryCustomization?.metafield?.jsonValue;
  const rules = activeRules(config, "delivery");
  if (rules.length === 0) return { operations: [] };
  const facts = cartFacts(input);
  const operations = [];
  for (const g of input?.cart?.deliveryGroups || []) {
    const items = (g?.deliveryOptions || []).map((/** @type {any} */ o) => ({
      id: str(o.handle),
      name: str(o.title),
      cost: num(o.cost?.amount) || 0,
    }));
    const p = plan(rules, items, facts, config?.neverHideAll !== false);
    for (const it of items) {
      if (p.hidden.has(it.id))
        operations.push({
          deliveryOptionHide: { deliveryOptionHandle: it.id },
        });
    }
    for (const [id, title] of p.renamed) {
      if (!p.hidden.has(id))
        operations.push({
          deliveryOptionRename: { deliveryOptionHandle: id, title },
        });
    }
    for (const m of p.moves) {
      operations.push({
        deliveryOptionMove: {
          deliveryOptionHandle: m.id,
          index: m.index === "top" ? 0 : Math.max(items.length - 1, 0),
        },
      });
    }
  }
  return { operations };
}

/**
 * Payment Function body. Returns { operations } for cart.payment-methods.transform.run.
 * @param {any} input
 */
export function paymentOperations(input) {
  const config = input?.paymentCustomization?.metafield?.jsonValue;
  const rules = activeRules(config, "payment");
  if (rules.length === 0) return { operations: [] };
  const facts = cartFacts(input);
  const items = (input?.paymentMethods || []).map((/** @type {any} */ m) => ({
    id: str(m.id),
    name: str(m.name),
  }));
  const p = plan(rules, items, facts, config?.neverHideAll !== false);
  const operations = [];
  for (const it of items)
    if (p.hidden.has(it.id))
      operations.push({ paymentMethodHide: { paymentMethodId: it.id } });
  for (const [id, name] of p.renamed)
    if (!p.hidden.has(id))
      operations.push({ paymentMethodRename: { paymentMethodId: id, name } });
  for (const m of p.moves)
    operations.push({
      paymentMethodMove: {
        paymentMethodId: m.id,
        index: m.index === "top" ? 0 : Math.max(items.length - 1, 0),
      },
    });
  return { operations };
}

/**
 * Admin cart tester. Takes a simple sample cart and returns what checkout would show.
 * @param {any[]} rules
 * @param {"free"|"pro"} planName
 * @param {{subtotal:number,currencyRate?:number,country:string,zip?:string,customerTags?:string[],productTags?:string[],b2b?:boolean,loggedIn?:boolean,itemCount?:number,weightKg?:number,deliveryMethod?:string,shipping:{title:string,cost:number}[],payments:string[]}} sample
 */
export function simulate(rules, planName, sample) {
  const config = buildConfig(rules, planName);
  const rate = sample.currencyRate || 1;
  const base = {
    presentmentCurrencyRate: String(rate),
    cart: {
      cost: { subtotalAmount: { amount: String(sample.subtotal * rate) } },
      buyerIdentity: {
        isAuthenticated: Boolean(sample.loggedIn),
        purchasingCompany: sample.b2b
          ? { company: { id: "gid://shopify/Company/1" } }
          : null,
        customer: {
          hasTags: config.customerTags.map((t) => ({
            tag: t,
            hasTag: (sample.customerTags || []).map(lower).includes(lower(t)),
          })),
        },
      },
      lines: [
        {
          quantity: sample.itemCount || 1,
          merchandise: {
            __typename: "ProductVariant",
            weight: (sample.weightKg || 0) / (sample.itemCount || 1),
            weightUnit: "KILOGRAMS",
            product: {
              hasTags: config.productTags.map((t) => ({
                tag: t,
                hasTag: (sample.productTags || [])
                  .map(lower)
                  .includes(lower(t)),
              })),
            },
          },
        },
      ],
      deliveryGroups: [
        {
          deliveryAddress: {
            countryCode: sample.country,
            zip: sample.zip || null,
          },
          selectedDeliveryOption: sample.deliveryMethod
            ? { deliveryMethodType: sample.deliveryMethod }
            : null,
          deliveryOptions: sample.shipping.map((s, i) => ({
            handle: `ship-${i}`,
            title: s.title,
            cost: { amount: String(s.cost) },
            deliveryMethodType: "SHIPPING",
          })),
        },
      ],
    },
  };
  const d = deliveryOperations({
    ...base,
    deliveryCustomization: { metafield: { jsonValue: config } },
  });
  const p = paymentOperations({
    ...base,
    paymentMethods: sample.payments.map((n, i) => ({
      id: `pay-${i}`,
      name: n,
    })),
    paymentCustomization: { metafield: { jsonValue: config } },
  });
  /** @param {{id:string,name:string}[]} items @param {any[]} ops @param {string} k */
  const apply = (items, ops, k) => {
    const idKey = k === "delivery" ? "deliveryOptionHandle" : "paymentMethodId";
    const hide = new Set(
      ops
        .filter((o) => o[`${k}${k === "delivery" ? "Option" : "Method"}Hide`])
        .map(
          (o) => o[`${k}${k === "delivery" ? "Option" : "Method"}Hide`][idKey],
        ),
    );
    let out = items.filter((i) => !hide.has(i.id)).map((i) => ({ ...i }));
    for (const o of ops) {
      const r = o.deliveryOptionRename || o.paymentMethodRename;
      if (r)
        out = out.map((i) =>
          i.id === r[idKey] ? { ...i, name: r.title ?? r.name } : i,
        );
    }
    for (const o of ops) {
      const m = o.deliveryOptionMove || o.paymentMethodMove;
      if (!m) continue;
      const at = out.findIndex((i) => i.id === m[idKey]);
      if (at < 0) continue;
      const [x] = out.splice(at, 1);
      out.splice(Math.min(m.index, out.length), 0, x);
    }
    return {
      visible: out.map((i) => i.name),
      hidden: items.filter((i) => hide.has(i.id)).map((i) => i.name),
    };
  };
  return {
    shipping: apply(
      sample.shipping.map((s, i) => ({ id: `ship-${i}`, name: s.title })),
      d.operations,
      "delivery",
    ),
    payment: apply(
      sample.payments.map((n, i) => ({ id: `pay-${i}`, name: n })),
      p.operations,
      "payment",
    ),
    deliveryOperations: d.operations,
    paymentOperations: p.operations,
    ignoredByPlan: Math.max(
      0,
      (rules || []).filter(
        (r) => r.enabled !== false && validateRule(r).length === 0,
      ).length - (planName === "pro" ? Infinity : FREE_RULE_LIMIT),
    ),
  };
}
