/**
 * Telegram Bot — opsional, notifikasi & basic commands
 */
let bot = null;

function init(token) {
  if (!token) return;
  try {
    const TG = require('node-telegram-bot-api');
    bot = new TG(token, { polling: !process.env.TELEGRAM_WEBHOOK_URL });
    if (process.env.TELEGRAM_WEBHOOK_URL) bot.setWebHook(process.env.TELEGRAM_WEBHOOK_URL);

    bot.onText(/\/start/, msg => bot.sendMessage(msg.chat.id,
      `⚡ *ARKX Motion Pro V2*\n\nAI Video Generation\n\n/keys — status API keys\n/queue — status queue\n/help — bantuan`,
      { parse_mode:'Markdown' }));

    bot.onText(/\/keys/, msg => {
      const s = require('./keyStore').summary();
      bot.sendMessage(msg.chat.id,
        `🔑 *API Keys*\nTotal: ${s.total} | Aktif: ${s.active} | Mati: ${s.dead}\nRequests: ${s.totalReq} | OK: ${s.totalOk} | Error: ${s.totalErr}`,
        { parse_mode:'Markdown' });
    });

    bot.onText(/\/queue/, msg => {
      const s = require('./queue').status();
      bot.sendMessage(msg.chat.id,
        `📋 *Queue*\nPending: ${s.pending} | Running: ${s.running}`,
        { parse_mode:'Markdown' });
    });

    bot.on('polling_error', () => {});
    console.log('✅ Telegram bot ready');
  } catch (e) {
    console.log('⚠️ Telegram init failed:', e.message);
  }
}

function processUpdate(body) { if (bot) bot.processUpdate(body); }

async function notify(chatId, text, videoUrl) {
  if (!bot || !chatId) return;
  try {
    if (videoUrl) await bot.sendVideo(chatId, videoUrl, { caption: text, parse_mode:'Markdown' });
    else          await bot.sendMessage(chatId, text, { parse_mode:'Markdown' });
  } catch {}
}

module.exports = { init, processUpdate, notify, get bot() { return bot; } };
