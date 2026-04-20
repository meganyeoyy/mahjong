// scripts/setup-telegram.js
// Run once after deploying to Vercel:
//   node scripts/setup-telegram.js

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const VERCEL_URL = process.env.VERCEL_URL; // e.g. mahjong-tracker.vercel.app

if (!TOKEN || !VERCEL_URL) {
  console.error("❌ Set TELEGRAM_BOT_TOKEN and VERCEL_URL before running this script.");
  process.exit(1);
}

const webhookUrl = `https://${VERCEL_URL}/api/telegram`;

fetch(`https://api.telegram.org/bot${TOKEN}/setWebhook`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ url: webhookUrl }),
})
  .then(r => r.json())
  .then(data => {
    if (data.ok) console.log(`✅ Webhook set to: ${webhookUrl}`);
    else console.error("❌ Failed:", data.description);
  });
