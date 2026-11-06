// Turns the rule editor form into a Rule and back. Pure code, unit tested.
import {
  FIELDS,
  validateRule,
  type Rule,
  type Condition,
} from "../../shared/rules-engine.js";

export const MAX_CONDITIONS = 3;

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export function newRuleId() {
  return `r${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function ruleFromForm(
  form: FormData,
  existingId?: string,
): { rule: Rule; errors: string[] } {
  const conditions: Condition[] = [];
  for (let i = 0; i < MAX_CONDITIONS; i++) {
    const field = s(form, `c${i}_field`);
    if (!field) continue;
    const meta = FIELDS[field];
    const op = s(form, `c${i}_op`) || meta?.ops[0] || "";
    const raw = s(form, `c${i}_value`);
    let value: Condition["value"];
    if (meta?.type === "number")
      value = raw === "" ? NaN : Number(raw.replace(",", "."));
    else if (meta?.type === "list")
      value = raw
        .split(/[,\n]/)
        .map((x) => x.trim())
        .filter(Boolean);
    conditions.push(value === undefined ? { field, op } : { field, op, value });
  }
  const action = s(form, "action") as Rule["action"];
  const rule: Rule = {
    id: existingId || s(form, "id") || newRuleId(),
    label: s(form, "label").slice(0, 80),
    kind: s(form, "kind") as Rule["kind"],
    enabled: s(form, "enabled") !== "off",
    action,
    target: {
      match: s(form, "match") === "equals" ? "equals" : "contains",
      text: s(form, "text").slice(0, 120),
    },
    when: s(form, "when") === "any" ? "any" : "all",
    conditions,
  };
  if (action === "rename") rule.newName = s(form, "newName");
  if (action === "move")
    rule.position = s(form, "position") === "bottom" ? "bottom" : "top";
  return { rule, errors: validateRule(rule) };
}

const OPS: Record<string, string> = {
  gte: "is at least",
  lt: "is less than",
  in: "is one of",
  notIn: "is not one of",
  hasAny: "has any of",
  hasNone: "has none of",
  anyLine: "any item has",
  noLine: "no item has",
  is: "is yes",
  isNot: "is no",
};
const NAMES: Record<string, string> = {
  cartSubtotal: "Cart subtotal",
  itemCount: "Item count",
  weightKg: "Cart weight (kg)",
  country: "Country",
  zipPrefix: "Postal code",
  customerTag: "Customer tag",
  productTag: "Product tag",
  b2b: "B2B company buyer",
  loggedIn: "Logged-in customer",
  deliveryMethod: "Chosen delivery type",
};
export const fieldName = (f: string) => NAMES[f] ?? f;
export const opName = (o: string, field?: string) =>
  field === "zipPrefix"
    ? o === "in"
      ? "starts with one of"
      : "starts with none of"
    : (OPS[o] ?? o);
const FLAGS: Record<string, [string, string]> = {
  b2b: ["the buyer is a B2B company", "the buyer is not a B2B company"],
  loggedIn: ["the customer is logged in", "the customer is not logged in"],
};

/** One-line summary for the rules table, e.g. "Hide 'Cash on Delivery' when Cart subtotal is at least 500". */
export function describeRule(r: Rule) {
  const what = `'${r.target.text}'`;
  const verb =
    r.action === "hide"
      ? `Hide ${what}`
      : r.action === "rename"
        ? `Rename ${what} to '${r.newName}'`
        : `Move ${what} to the ${r.position}`;
  const conds = (r.conditions || []).map((c) => {
    if (FLAGS[c.field]) return FLAGS[c.field][c.op === "is" ? 0 : 1];
    const v = Array.isArray(c.value) ? c.value.join(", ") : c.value;
    return `${fieldName(c.field)} ${opName(c.op, c.field)}${v === undefined ? "" : ` ${v}`}`;
  });
  if (conds.length === 0) return `${verb} always`;
  return `${verb} when ${conds.join(r.when === "any" ? " or " : " and ")}`;
}
