import type { CreateOrderOut, VerifyPaymentIn } from "./types";

// Minimal typing for Razorpay Standard Checkout (checkout.js).
interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}
interface RazorpayFailure {
  error: { code?: string; description?: string; reason?: string };
}
interface RazorpayInstance {
  open: () => void;
  on: (event: "payment.failed", cb: (r: RazorpayFailure) => void) => void;
}
type RazorpayCtor = new (options: Record<string, unknown>) => RazorpayInstance;
declare global {
  interface Window {
    Razorpay?: RazorpayCtor;
  }
}

const SRC = "https://checkout.razorpay.com/v1/checkout.js";
let loading: Promise<RazorpayCtor> | null = null;

export function loadRazorpay(): Promise<RazorpayCtor> {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = SRC;
      s.async = true;
      s.onload = () => (window.Razorpay ? resolve(window.Razorpay) : reject(new Error("Payment window failed to load")));
      s.onerror = () => {
        loading = null;
        reject(new Error("Could not load the payment window. Check your internet and try again."));
      };
      document.body.appendChild(s);
    });
  }
  return loading;
}

export type CheckoutResult = { kind: "success"; payment: VerifyPaymentIn } | { kind: "dismissed"; lastError: string | null };

// Opens the Razorpay modal for a backend-created order. Resolves on success or when the user closes the modal.
// A failed attempt (payment.failed) keeps the modal open so the user can retry; onFailed reports it.
export async function openCheckout(order: CreateOrderOut, onFailed: (message: string) => void): Promise<CheckoutResult> {
  const Razorpay = await loadRazorpay();
  return new Promise((resolve) => {
    let settled = false;
    let lastError: string | null = null;
    const done = (r: CheckoutResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const rzp = new Razorpay({
      key: order.key_id,
      order_id: order.order_id,
      amount: order.amount,
      currency: order.currency,
      name: order.name,
      description: "Wallet top-up",
      prefill: { name: order.prefill_name, contact: order.prefill_contact },
      theme: { color: "#EA580C" },
      handler: (r: RazorpaySuccess) => done({ kind: "success", payment: r }),
      modal: { ondismiss: () => done({ kind: "dismissed", lastError }) },
    });
    rzp.on("payment.failed", (r) => {
      lastError = r.error?.description || "Payment failed. No money was added.";
      onFailed(lastError);
    });
    rzp.open();
  });
}
