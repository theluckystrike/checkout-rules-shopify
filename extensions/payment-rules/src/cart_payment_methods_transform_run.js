// @ts-check
import { paymentOperations } from "../../../shared/rules-engine.js";

/**
 * @param {any} input
 * @returns {{operations: any[]}}
 */
export function cartPaymentMethodsTransformRun(input) {
  return paymentOperations(input);
}
