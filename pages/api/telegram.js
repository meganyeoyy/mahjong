import { getDb } from "../../lib/db";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

// ── Telegram helpers ──────────────────────────────────────
async function sendMessage(chat_id, text, extra = {}) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text, parse_mode: "Markdown", ...extra }),
  });
}

async function editMessage(chat_id, message_id, text, extra = {}) {
  await fetch(`${TELEGRAM_API}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, message_id, text, parse_mode: "Markdown", ...extra }),
  });
}

async function answerCallback(callback_query_id, text = "") {
  await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callback_query_id, text }),
  });
}

// ── Session store ─────────────────────────────────────────
// Stored in module-level memory (persists across requests on same instance)
const sessions = {};

function getSession(chat_id) {
  if (!sessions[chat_id]) resetSession(chat_id);
  return sessions[chat_id];
}

function resetSession(chat_id) {
  sessions[chat_id] = {
    step: "idle",       // idle | selecting_players | entering_score | fixing_score
    allPlayers: [],     // all players from DB
    selectedIds: [],    // player ids chosen for this game
    scores: {},         // { player_id: score }
    currentPlayerId: null, // which player we're currently asking about
    scoreMessageId: null,  // message id to edit in place
  };
}

// ── UI builders ───────────────────────────────────────────
function playerSelectKeyboard(allPlayers, selectedIds) {
  // Each player is a toggle button, 2 per row
  const buttons = allPlayers.map(p => {
    const isSelected = selectedIds.includes(p.id);
    return { text: `${isSelected ? "✅ " : ""}${p.name}`, callback_data: `toggle_${p.id}` };
  });

  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));

  // Done button only enabled when 2-4 selected
  const canConfirm = selectedIds.length >= 2;
  rows.push([{ text: canConfirm ? `▶️ Start (${selectedIds.length} players)` : `Select 2–4 players`, callback_data: canConfirm ? "confirm_players" : "noop" }]);

  return { inline_keyboard: rows };
}

function fixScoreKeyboard(players, scores) {
  // Show each scored player as a button to re-enter their score
  const buttons = players.map(p => ({
    text: `${p.name}: ${scores[p.id] !== undefined ? (scores[p.id] > 0 ? "+" : "") + scores[p.id] : "—"}`,
    callback_data: `fix_${p.id}`,
  }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) rows.push(buttons.slice(i, i + 2));
  rows.push([{ text: "❌ Cancel", callback_data: "cancel" }]);
  return { inline_keyboard: rows };
}

function scoresSummaryText(players, scores) {
  const entries = players.map(p => ({
    name: p.name,
    score: scores[p.id] !== undefined ? scores[p.id] : null,
  }));
  const sum = entries.reduce((s, e) => s + (e.score ?? 0), 0);
  const lines = entries.map(e =>
    e.score !== null ? `  ${e.name}: ${e.score > 0 ? "+" : ""}${e.score}` : `  ${e.name}: —`
  ).join("\n");
  const sumLine = sum === 0 ? "Sum: ✅ 0" : `Sum: ❌ ${sum > 0 ? "+" : ""}${sum}`;
  return `*Scores:*\n${lines}\n\n${sumLine}`;
}

// ── Main handler ──────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const sql = getDb();
  const body = req.body;

  // ── Callback query (button press) ────────────────────────
  if (body.callback_query) {
    const cq = body.callback_query;
    const chat_id = cq.message.chat.id;
    const message_id = cq.message.message_id;
    const data = cq.data;
    const session = getSession(chat_id);

    await answerCallback(cq.id);

    if (data === "noop") return res.status(200).end();

    // ── Cancel ──────────────────────────────────────────────
    if (data === "cancel") {
      resetSession(chat_id);
      await editMessage(chat_id, message_id, "❌ Cancelled.");
      return res.status(200).end();
    }

    // ── Toggle player selection ──────────────────────────────
    if (data.startsWith("toggle_") && session.step === "selecting_players") {
      const pid = parseInt(data.replace("toggle_", ""));
      const idx = session.selectedIds.indexOf(pid);
      if (idx === -1) {
        if (session.selectedIds.length < 4) session.selectedIds.push(pid);
      } else {
        session.selectedIds.splice(idx, 1);
      }
      const count = session.selectedIds.length;
      const hint = count === 0 ? "Tap players to select them." : count === 1 ? "Select at least one more." : `${count} selected — tap ▶️ when ready.`;
      await editMessage(chat_id, message_id,
        `🀄 *New Game*\n\nWho's playing?\n\n_${hint}_`,
        { reply_markup: playerSelectKeyboard(session.allPlayers, session.selectedIds) }
      );
      return res.status(200).end();
    }

    // ── Confirm player selection ─────────────────────────────
    if (data === "confirm_players" && session.step === "selecting_players") {
      session.selectedPlayers = session.allPlayers.filter(p => session.selectedIds.includes(p.id));
      session.scores = {};
      session.step = "entering_score";
      // Ask for first player's score
      const first = session.selectedPlayers[0];
      session.currentPlayerId = first.id;
      await editMessage(chat_id, message_id,
        `🀄 *New Game*\n\n${scoresSummaryText(session.selectedPlayers, session.scores)}\n\n` +
        `How many points did *${first.name}* win/lose?\n_(type a number, e.g. \`32000\` or \`-12000\`)_`
      );
      session.scoreMessageId = message_id;
      return res.status(200).end();
    }

    // ── Fix a specific player's score ────────────────────────
    if (data.startsWith("fix_") && session.step === "fixing_score") {
      const pid = parseInt(data.replace("fix_", ""));
      const player = session.selectedPlayers.find(p => p.id === pid);
      session.currentPlayerId = pid;
      session.step = "entering_score";
      await editMessage(chat_id, message_id,
        `🀄 *New Game*\n\n${scoresSummaryText(session.selectedPlayers, session.scores)}\n\n` +
        `Re-enter score for *${player.name}*:\n_(type a number, e.g. \`32000\` or \`-12000\`)_`
      );
      session.scoreMessageId = message_id;
      return res.status(200).end();
    }

    return res.status(200).end();
  }

  // ── Text message ─────────────────────────────────────────
  const { message } = body;
  if (!message || !message.text) return res.status(200).end();

  const chat_id = message.chat.id;
  const text = message.text.trim();
  const session = getSession(chat_id);

  // ── /start or /help ──────────────────────────────────────
  if (text === "/start" || text === "/help") {
    resetSession(chat_id);
    return await sendMessage(chat_id,
      `🀄 *Mahjong Tracker*\n\n` +
      `/log — Log a new game\n` +
      `/scores — Leaderboard\n` +
      `/players — List players\n` +
      `/cancel — Cancel`
    ), res.status(200).end();
  }

  // ── /cancel ──────────────────────────────────────────────
  if (text === "/cancel") {
    resetSession(chat_id);
    return await sendMessage(chat_id, "❌ Cancelled."), res.status(200).end();
  }

  // ── /players ─────────────────────────────────────────────
  if (text === "/players") {
    const players = await sql`SELECT name, avatar FROM players ORDER BY name`;
    const list = players.map(p => `${p.avatar} ${p.name}`).join("\n");
    return await sendMessage(chat_id, `👥 *Players:*\n${list}`), res.status(200).end();
  }

  // ── /scores ──────────────────────────────────────────────
  if (text === "/scores") {
    const players = await sql`
      SELECT p.name, p.avatar,
        COALESCE(SUM(gr.score), 0) AS total,
        COUNT(CASE WHEN gr.rank = 1 THEN 1 END) AS wins,
        COUNT(gr.id) AS games
      FROM players p
      LEFT JOIN game_results gr ON gr.player_id = p.id
      GROUP BY p.id
      ORDER BY total DESC
    `;
    const lines = players.map((p, i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}.`;
      return `${medal} *${p.name}* — ${parseInt(p.total) > 0 ? "+" : ""}${parseInt(p.total)} pts (${p.wins}W / ${p.games}G)`;
    }).join("\n");
    return await sendMessage(chat_id, `🏆 *Leaderboard:*\n\n${lines}`), res.status(200).end();
  }

  // ── /log ─────────────────────────────────────────────────
  if (text === "/log") {
    const players = await sql`SELECT id, name, avatar FROM players ORDER BY name`;
    if (players.length < 2) {
      return await sendMessage(chat_id, "⚠️ Add at least 2 players via the web UI first."), res.status(200).end();
    }
    resetSession(chat_id);
    const session = getSession(chat_id);
    session.step = "selecting_players";
    session.allPlayers = players;
    session.selectedIds = [];

    await sendMessage(chat_id,
      `🀄 *New Game*\n\nWho's playing?\n\n_Tap players to select them._`,
      { reply_markup: playerSelectKeyboard(players, []) }
    );
    return res.status(200).end();
  }

  // ── Score input ───────────────────────────────────────────
  if (session.step === "entering_score") {
    const score = parseInt(text);
    if (isNaN(score)) {
      return await sendMessage(chat_id, "⚠️ Please enter a number, e.g. `32000` or `-12000`"), res.status(200).end();
    }

    session.scores[session.currentPlayerId] = score;

    // Find next player without a score
    const next = session.selectedPlayers.find(p => session.scores[p.id] === undefined);

    if (next) {
      // Ask for next player
      session.currentPlayerId = next.id;
      await editMessage(chat_id, session.scoreMessageId,
        `🀄 *New Game*\n\n${scoresSummaryText(session.selectedPlayers, session.scores)}\n\n` +
        `How many points did *${next.name}* win/lose?\n_(type a number, e.g. \`32000\` or \`-12000\`)_`
      );
    } else {
      // All scores entered — validate
      const sum = session.selectedPlayers.reduce((s, p) => s + session.scores[p.id], 0);

      if (sum === 0) {
        // Save game
        const [game] = await sql`INSERT INTO games (played_at) VALUES (NOW()) RETURNING *`;
        const ranked = [...session.selectedPlayers].sort((a, b) => session.scores[b.id] - session.scores[a.id]);
        for (let i = 0; i < ranked.length; i++) {
          await sql`
            INSERT INTO game_results (game_id, player_id, score, rank)
            VALUES (${game.id}, ${ranked[i].id}, ${session.scores[ranked[i].id]}, ${i + 1})
          `;
        }
        const summary = ranked.map((p, i) => {
          const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}.`;
          const s = session.scores[p.id];
          return `${medal} ${p.name}: ${s > 0 ? "+" : ""}${s}`;
        }).join("\n");
        await editMessage(chat_id, session.scoreMessageId, `✅ *Game #${game.id} saved!*\n\n${summary}`);
        resetSession(chat_id);
      } else {
        // Sum not zero — show fix UI
        session.step = "fixing_score";
        const diff = sum > 0 ? `-${sum}` : `+${Math.abs(sum)}`;
        await editMessage(chat_id, session.scoreMessageId,
          `🀄 *New Game*\n\n${scoresSummaryText(session.selectedPlayers, session.scores)}\n\n` +
          `❌ Scores don't add up to 0 (off by *${diff}*).\nTap a player to fix their score:`,
          { reply_markup: fixScoreKeyboard(session.selectedPlayers, session.scores) }
        );
      }
    }
    return res.status(200).end();
  }

  // ── Fallback ──────────────────────────────────────────────
  await sendMessage(chat_id, "Use /log to record a game, /scores for the leaderboard, or /help.");
  res.status(200).end();
}
