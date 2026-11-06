import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return null;
};

// Public landing page. App Store apps install from the Shopify App Store, so there is no shop-domain form here.
export default function App() {
  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Zovo Hide Shipping &amp; Payment</h1>
        <p className={styles.text}>
          Hide, rename and sort shipping options and payment methods at Shopify checkout, with rules on cart value,
          country, postal code, weight, tags and B2B buyers.
        </p>
        <ul className={styles.list}>
          <li>Hide Cash on Delivery above a cart value, or for store pickup.</li>
          <li>Hide Express shipping for islands and remote postal codes.</li>
          <li>Show Bank Deposit only to B2B or tagged customers.</li>
        </ul>
        <p className={styles.text}>Free for 3 rules. Install it from the Shopify App Store.</p>
      </div>
    </div>
  );
}
