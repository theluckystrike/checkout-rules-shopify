import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { rulesAction, rulesDashboard } from "../lib/handlers.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, billing } = await authenticate.admin(request);
  return rulesDashboard(admin, billing, new URL(request.url));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, billing } = await authenticate.admin(request);
  return rulesAction(admin, billing, await request.formData());
};

type Data = Awaited<ReturnType<typeof rulesDashboard>>;

export function RulesView({
  data,
  notice,
}: {
  data: Data;
  notice?: { ok: boolean; message: string };
}) {
  const { plan, usage: u, rules, active, functionsReady } = data;
  return (
    <s-page heading="Shipping and payment rules">
      <s-button slot="primary-action" variant="primary" href="/app/rules">
        Add rule
      </s-button>
      {!notice && data.saved === "1" ? (
        <s-banner tone="success">
          Rule saved. Checkout uses it within a minute.
        </s-banner>
      ) : null}
      {!notice && data.saved === "off" ? (
        <s-banner tone="warning">
          Rule saved and turned off, because the free plan runs 3 rules at a
          time. Turn another rule off, or move to Pro.
        </s-banner>
      ) : null}
      {notice ? (
        <s-banner tone={notice.ok ? "success" : "critical"}>
          {notice.message}
        </s-banner>
      ) : null}
      {!active ? (
        <s-banner
          tone="warning"
          heading="Rules are not running at checkout yet"
        >
          <s-paragraph>
            Turn them on once. The app then adds two checkout customizations to
            this store, one for shipping and one for payment.
          </s-paragraph>
          <Form method="post">
            <input type="hidden" name="intent" value="activate" />
            <s-button type="submit" disabled={!functionsReady}>
              Turn on checkout rules
            </s-button>
          </Form>
        </s-banner>
      ) : null}
      {u.overLimit > 0 ? (
        <s-banner tone="warning">
          {u.overLimit} enabled rule{u.overLimit === 1 ? " is" : "s are"} past
          the free limit of 3, so checkout skips{" "}
          {u.overLimit === 1 ? "it" : "them"}. Rules run from the top of the
          list.
        </s-banner>
      ) : null}
      <s-section
        heading={`Rules (${u.enabled} on${u.limit ? ` of ${u.limit} on the free plan` : ", Pro plan"})`}
      >
        {rules.length === 0 ? (
          <s-stack gap="base">
            <s-paragraph>
              No rules yet. Common first rules are hiding Cash on Delivery above
              a cart value, hiding Express shipping for remote postal codes, and
              showing Bank Deposit only to B2B buyers.
            </s-paragraph>
            <s-button href="/app/rules" variant="primary">
              Add your first rule
            </s-button>
          </s-stack>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>Order</s-table-header>
              <s-table-header>Type</s-table-header>
              <s-table-header listSlot="primary">Rule</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Actions</s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rules.map((r, i) => (
                <s-table-row key={r.id}>
                  <s-table-cell>{i + 1}</s-table-cell>
                  <s-table-cell>
                    {r.kind === "payment" ? "Payment" : "Shipping"}
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack gap="small-200">
                      {r.label ? (
                        <s-text type="strong">{r.label}</s-text>
                      ) : null}
                      <s-text>{r.summary}</s-text>
                    </s-stack>
                  </s-table-cell>
                  <s-table-cell>
                    {r.enabled === false ? (
                      <s-badge>Off</s-badge>
                    ) : (
                      <s-badge tone="success">On</s-badge>
                    )}
                  </s-table-cell>
                  <s-table-cell>
                    <s-stack direction="inline" gap="small-200">
                      <s-button
                        href={`/app/rules?rule=${encodeURIComponent(r.id)}`}
                        variant="tertiary"
                      >
                        Edit
                      </s-button>
                      {(["toggle", "up", "down", "delete"] as const).map(
                        (intent) => (
                          <Form method="post" key={intent}>
                            <input type="hidden" name="intent" value={intent} />
                            <input type="hidden" name="id" value={r.id} />
                            <s-button
                              type="submit"
                              variant="tertiary"
                              tone={intent === "delete" ? "critical" : "auto"}
                              accessibilityLabel={`${intent} rule ${i + 1}`}
                            >
                              {intent === "toggle"
                                ? r.enabled === false
                                  ? "Turn on"
                                  : "Turn off"
                                : intent === "up"
                                  ? "Up"
                                  : intent === "down"
                                    ? "Down"
                                    : "Delete"}
                            </s-button>
                          </Form>
                        ),
                      )}
                    </s-stack>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
      <s-section slot="aside" heading="How rules run">
        <s-unordered-list>
          <s-list-item>
            Rules run from top to bottom. Hide wins over rename and move.
          </s-list-item>
          <s-list-item>
            The app never hides every option. If a rule would, the cheapest one
            stays.
          </s-list-item>
          <s-list-item>
            Cart amounts use your store currency, also when the buyer pays in
            another one.
          </s-list-item>
          <s-list-item>
            Try a rule on a sample cart in the Cart tester before a sale.
          </s-list-item>
        </s-unordered-list>
      </s-section>
      <s-section slot="aside" heading="Plan">
        <s-paragraph>
          {plan === "pro"
            ? "Pro, with no rule limit."
            : "Free, with 3 rules on at a time. Pro removes the limit for $4.99 a month."}
        </s-paragraph>
        <s-link href="/app/plan">See plans</s-link>
      </s-section>
    </s-page>
  );
}

export default function Index() {
  const data = useLoaderData<typeof loader>();
  const notice = useActionData<typeof action>();
  return <RulesView data={data} notice={notice} />;
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
