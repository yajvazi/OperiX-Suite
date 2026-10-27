import Stripe from "stripe";
import { NextResponse } from "next/server";
import {
  getStripeClient,
  reconcileInvoiceApiAddonSubscription,
  reconcileInvoicePaymentEvent,
  reconcileInvoicePaymentIntentFailure,
  reconcileInvoiceSubscription,
} from "@/lib/billing/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function invoiceSubscriptionId(invoice: Stripe.Invoice) {
  const legacy = invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
  const value = invoice.parent?.subscription_details?.subscription || legacy.subscription;
  return typeof value === "string" ? value : value?.id || null;
}

async function completeEvent(admin: ReturnType<typeof createAdminClient>, eventId: string, error?: string) {
  if (!admin) return;
  await admin.rpc("complete_invoice_webhook_event", {
    p_event_id: eventId,
    p_error_message: error ? error.slice(0, 1000) : null,
  });
}

export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  const stripe = getStripeClient();
  if (!secret || !stripe) return NextResponse.json({ error: "Stripe webhook is not configured." }, { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  const rawBody = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (caught) {
    console.error("Stripe webhook signature validation failed", caught instanceof Error ? caught.message : "unknown error");
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Webhook storage is not configured." }, { status: 503 });
  const { data: claimed, error: claimError } = await admin.rpc("claim_invoice_webhook_event", {
    p_event_id: event.id,
    p_event_type: event.type,
  });
  if (claimError) {
    console.error("Stripe webhook event claim failed", claimError.message);
    return NextResponse.json({ error: "Webhook processing is temporarily unavailable." }, { status: 500 });
  }
  if (claimed !== true) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (session.mode === "subscription" && subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          if (session.metadata?.operix_product === "api_addon" || subscription.metadata?.operix_product === "api_addon") {
            await reconcileInvoiceApiAddonSubscription(subscription, event.type, event.id, event.created);
          } else {
            await reconcileInvoiceSubscription(subscription, event.type, event.id, event.created);
          }
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const subscription = event.data.object as Stripe.Subscription;
        if (subscription.metadata?.operix_product === "api_addon") {
          await reconcileInvoiceApiAddonSubscription(subscription, event.type, event.id, event.created);
        } else {
          await reconcileInvoiceSubscription(subscription, event.type, event.id, event.created);
        }
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoiceSubscriptionId(invoice);
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          if (subscription.metadata?.operix_product === "api_addon") {
            await reconcileInvoiceApiAddonSubscription(subscription, event.type, event.id, event.created);
            break;
          }
        }
        await reconcileInvoicePaymentEvent(invoice, event.type, event.id, event.created);
        break;
      }
      case "payment_intent.payment_failed": {
        await reconcileInvoicePaymentIntentFailure(event.data.object as Stripe.PaymentIntent, event.id);
        break;
      }
      default:
        break;
    }
    await completeEvent(admin, event.id);
    return NextResponse.json({ received: true });
  } catch (caught) {
    const safeMessage = caught instanceof Error ? caught.message : "Webhook handler failed.";
    console.error("Stripe webhook processing failed", safeMessage);
    await completeEvent(admin, event.id, safeMessage).catch((completionError) => console.error("Stripe webhook failure state could not be stored", completionError instanceof Error ? completionError.message : "unknown error"));
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
