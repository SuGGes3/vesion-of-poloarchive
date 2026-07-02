// netlify/functions/create-checkout.js
// Создаёт Stripe Checkout Session для корзины.
// Цены и скидка считаются ЗДЕСЬ из products.json — клиент подделать не может.
// Скидка: 2 вещи = -10%, 3+ = -20%.
// Требует переменную окружения STRIPE_SECRET_KEY в Netlify.

const PRODUCTS = require("../../products.json");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let indices;
  try {
    indices = JSON.parse(event.body).indices;
  } catch {
    return { statusCode: 400, body: "Bad request" };
  }

  // валидация: массив уникальных индексов существующих непроданных товаров
  if (!Array.isArray(indices) || !indices.length || indices.length > 20) {
    return { statusCode: 400, body: "Bad cart" };
  }
  indices = [...new Set(indices.map(Number))];
  const items = indices.map((i) => PRODUCTS[i]);
  if (items.some((p) => !p || p.sold)) {
    return { statusCode: 400, body: "Item unavailable" };
  }

  const rate = items.length >= 3 ? 0.2 : items.length === 2 ? 0.1 : 0;
  const label = rate ? ` (bundle −${rate * 100}%)` : "";

  const siteUrl = process.env.URL || `https://${event.headers.host}`;

  const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: items.map((p) => ({
        quantity: 1,
        price_data: {
          currency: "eur",
          unit_amount: Math.round(p.priceNum * 100 * (1 - rate)),
          product_data: {
            name: p.title + label,
            description: `Size ${p.size} · ${p.meta}`,
          },
        },
      })),
      shipping_address_collection: {
        allowed_countries: [
          "DE","AT","NL","BE","FR","IT","ES","PT","PL","CZ","DK","SE","FI",
          "IE","LU","SI","SK","HR","EE","LV","LT","GR","HU","RO","BG"
        ],
      },
      success_url: `${siteUrl}/success.html`,
      cancel_url: `${siteUrl}/`,
      metadata: {
        items: items.map((p) => p.title).join(" | "),
        bundle_discount: rate ? `${rate * 100}%` : "none",
      },
    });
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    console.error("Stripe error:", err.message);
    return { statusCode: 500, body: "Stripe error" };
  }
};
