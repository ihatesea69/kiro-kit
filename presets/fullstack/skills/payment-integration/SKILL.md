---
name: payment-integration
description: Implement payment processing with Stripe, Polar, or SePay. Use when building checkout flows, subscriptions, usage-based billing, or handling payment webhooks.
---

# Payment Integration

Activate when implementing payment processing, subscriptions, or billing systems.

## When to Use

- Integrating Stripe for card payments and subscriptions
- Using Polar for SaaS monetization and automated benefits
- Implementing SePay for Vietnamese bank transfers and VietQR
- Building checkout flows and pricing pages
- Handling payment webhooks and event processing
- Managing subscription lifecycle (create, upgrade, cancel)

## Stripe

- Use Stripe Checkout for hosted payment pages
- Implement Payment Intents for custom flows
- Handle webhooks for payment confirmation (checkout.session.completed)
- Use Stripe Billing for subscriptions (price IDs, metered billing)
- Implement customer portal for self-service management
- Always verify webhook signatures before processing

## Polar

- Use Polar for subscription management and benefit delivery
- Implement OAuth2 for user authentication
- Handle webhooks for subscription events
- Automate benefit delivery (GitHub repo access, Discord roles)
- Use Polar as Merchant of Record for tax compliance

## Webhook Best Practices

- Verify signatures on all incoming webhooks
- Implement idempotency (store processed event IDs)
- Return 200 quickly, process asynchronously
- Handle retries gracefully (events may arrive multiple times)
- Log all webhook events for debugging

## Security

- Never log full card numbers or CVVs
- Use Stripe.js or Elements for PCI compliance
- Store only Stripe customer/subscription IDs in your database
- Use test mode keys in development (sk_test_, pk_test_)
- Rotate API keys periodically
