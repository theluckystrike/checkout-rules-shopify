// Sample cart for the cart tester. Client-safe.
import type { Sample } from "../../shared/rules-engine.js";

export const DEFAULT_SAMPLE = {
  subtotal: "120",
  country: "DE",
  zip: "10115",
  customerTags: "",
  productTags: "",
  itemCount: "2",
  weightKg: "1.5",
  b2b: "no",
  loggedIn: "no",
  deliveryMethod: "SHIPPING",
  shipping:
    "Standard Shipping: 4.90\nExpress Shipping: 14.90\nFree Shipping: 0",
  payments: "Credit card\nPayPal\nCash on Delivery (COD)\nBank Deposit",
};
export type Fields = typeof DEFAULT_SAMPLE;

export function parseSample(f: Fields): Sample {
  const list = (s: string) =>
    s
      .split(/[,\n]/)
      .map((x) => x.trim())
      .filter(Boolean);
  const n = (s: string) => {
    const v = Number(String(s).replace(",", "."));
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };
  return {
    subtotal: n(f.subtotal),
    country: f.country.trim().toUpperCase().slice(0, 2),
    zip: f.zip.trim(),
    customerTags: list(f.customerTags),
    productTags: list(f.productTags),
    itemCount: Math.max(1, Math.round(n(f.itemCount))),
    weightKg: n(f.weightKg),
    b2b: f.b2b === "yes",
    loggedIn: f.loggedIn === "yes",
    deliveryMethod: f.deliveryMethod || undefined,
    shipping: f.shipping
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((l) => {
        const m = l.match(/^(.*?)(?::\s*([\d.,]+))?$/);
        return { title: (m?.[1] ?? l).trim(), cost: n(m?.[2] ?? "0") };
      }),
    payments: list(f.payments).slice(0, 20),
  };
}
