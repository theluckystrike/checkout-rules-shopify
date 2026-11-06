// In-memory stand-in for the Shopify Admin GraphQL API. It answers the operations the app sends,
// by operation name, and records every call so tests can check the exact variables.
export type Call = { op: string; variables?: any };

export class FakeShop {
  calls: Call[] = [];
  metafields = new Map<string, any>(); // `${ownerId}|${key}` -> parsed JSON
  payment: { id: string; enabled: boolean; functionId: string }[] = [];
  delivery: { id: string; enabled: boolean; functionId: string }[] = [];
  functionsDeployed = true;
  partnerDevelopment = true;
  failNextSet = false;
  readonly installationId = "gid://shopify/AppInstallation/1";
  readonly apiKey = "test-api-key";

  admin = {
    graphql: async (
      query: string,
      options?: { variables?: Record<string, unknown> },
    ) => {
      const op = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "unknown";
      this.calls.push({ op, variables: options?.variables });
      const data = this.answer(op, options?.variables ?? {});
      return { json: async () => data };
    },
  };

  private answer(op: string, v: any): any {
    switch (op) {
      case "ZovoRulesState":
        return {
          data: {
            shop: { plan: { partnerDevelopment: this.partnerDevelopment } },
            currentAppInstallation: {
              id: this.installationId,
              app: { apiKey: this.apiKey },
              rules: this.metafields.has(`${this.installationId}|rules`)
                ? {
                    jsonValue: this.metafields.get(
                      `${this.installationId}|rules`,
                    ),
                  }
                : null,
            },
            shopifyFunctions: {
              nodes: this.functionsDeployed
                ? [
                    {
                      id: "fn-pay",
                      apiType: "payment_customization",
                      app: { apiKey: this.apiKey },
                    },
                    {
                      id: "fn-del",
                      apiType: "delivery_customization",
                      app: { apiKey: this.apiKey },
                    },
                    {
                      id: "fn-other",
                      apiType: "payment_customization",
                      app: { apiKey: "someone-else" },
                    },
                  ]
                : [],
            },
            paymentCustomizations: {
              nodes: [
                {
                  id: "gid://other/1",
                  title: "Other app",
                  enabled: true,
                  functionId: "fn-other",
                },
                ...this.payment,
              ],
            },
            deliveryCustomizations: { nodes: this.delivery },
          },
        };
      case "ZovoSaveRules": {
        if (this.failNextSet) {
          this.failNextSet = false;
          return {
            data: {
              metafieldsSet: {
                metafields: [],
                userErrors: [
                  {
                    field: ["value"],
                    message: "Value is too long",
                    code: "INVALID",
                  },
                ],
              },
            },
          };
        }
        for (const m of v.metafields) {
          if (m.namespace !== "$app:checkout-rules" || m.type !== "json")
            throw new Error("bad metafield input");
          this.metafields.set(`${m.ownerId}|${m.key}`, JSON.parse(m.value));
        }
        return {
          data: {
            metafieldsSet: {
              metafields: v.metafields.map((m: any) => ({
                id: "mf",
                key: m.key,
              })),
              userErrors: [],
            },
          },
        };
      }
      case "ZovoCreatePayment":
      case "ZovoCreateDelivery": {
        const list = op === "ZovoCreatePayment" ? this.payment : this.delivery;
        const id = `gid://shopify/${op === "ZovoCreatePayment" ? "PaymentCustomization" : "DeliveryCustomization"}/${list.length + 1}`;
        list.push({
          id,
          enabled: v.input.enabled,
          functionId: v.input.functionId,
        });
        for (const m of v.input.metafields || [])
          this.metafields.set(`${id}|${m.key}`, JSON.parse(m.value));
        const key =
          op === "ZovoCreatePayment"
            ? "paymentCustomizationCreate"
            : "deliveryCustomizationCreate";
        const obj =
          op === "ZovoCreatePayment"
            ? "paymentCustomization"
            : "deliveryCustomization";
        return {
          data: { [key]: { [obj]: { id, enabled: true }, userErrors: [] } },
        };
      }
      default:
        return { errors: [{ message: `FakeShop does not know ${op}` }] };
    }
  }

  config(kind: "payment" | "delivery") {
    const c = (kind === "payment" ? this.payment : this.delivery)[0];
    return c
      ? this.metafields.get(`${c.id}|function-configuration`)
      : undefined;
  }
}

/** Stand-in for the Billing API object that authenticate.admin returns. */
export function fakeBilling(
  active: { name: string; id?: string } | null = null,
) {
  const calls: any[] = [];
  let sub = active
    ? {
        id: active.id ?? "gid://shopify/AppSubscription/9",
        name: active.name,
        status: "ACTIVE",
      }
    : null;
  return {
    calls,
    check: async (o: any) => {
      calls.push({ fn: "check", ...o });
      return {
        hasActivePayment: Boolean(sub),
        appSubscriptions: sub ? [sub] : [],
      };
    },
    request: async (o: any) => {
      calls.push({ fn: "request", ...o });
      throw new Response(null, {
        status: 302,
        headers: { Location: "https://admin.shopify.com/charges/confirm" },
      });
    },
    cancel: async (o: any) => {
      calls.push({ fn: "cancel", ...o });
      sub = null;
      return {};
    },
  };
}
