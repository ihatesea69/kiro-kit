---
name: shopify
description: Build Shopify applications, extensions, and themes using GraphQL/REST APIs, Shopify CLI, Polaris UI, and Liquid templating. Use when integrating with Shopify or building e-commerce features.
---

# Shopify

Activate when building Shopify apps, extensions, themes, or integrating with Shopify APIs.

## When to Use

- Building Shopify apps with OAuth authentication
- Creating checkout UI extensions
- Developing themes with Liquid templating
- Integrating Shopify Storefront API with Next.js
- Managing products, orders, and customers via Admin API
- Implementing webhooks for order/inventory events

## Storefront API (Headless)

- Use GraphQL Storefront API for custom storefronts
- Implement cart with Cart API (createCart, addCartLines)
- Handle checkout with Checkout API or Shopify Checkout
- Cache product data with ISR or SWR

## Admin API

- Use GraphQL Admin API for store management
- Authenticate with OAuth 2.0 (app installation flow)
- Handle rate limits (cost-based throttling)
- Use bulk operations for large data sets

## Webhooks

- Register webhooks for order, product, and inventory events
- Verify webhook signatures (HMAC-SHA256)
- Implement idempotent webhook handlers
- Use webhook queues for reliable processing

## Polaris UI

- Use Polaris components for admin app interfaces
- Follow Shopify design patterns for merchant UX
- Use App Bridge for embedded app functionality
