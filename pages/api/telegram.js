import { getDb } from "../../lib/db";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TOKEN}`;

async function sendMessage(chat_id, text, extra = {}) {
  await fetch(`${TELEGRAM_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text, parse_mode: "Markdown", ...extra }),
  });
}

// In-memory session store (per chat_id, resets on cold start — fine for a family bot)
const sessions = {};

function getSession(chat_id) {
  if (!sessions[chat_id]) sessions[chat_id] = { step: "idle", scores: {} };
  return sessions[chat_id];
}

function resetSession(chat_id) {
  sessions[chat_id] = { step: "idle", scores: {} };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const sql = getDb();
  const { message } = req.body;
  if (!message || !message.text) return res.status(200).end();

  const chat_id = message.chat.id;
  const text = message.text.trim();
  const session = getSession(chat_id);

  // ── /start or /help ──────────────────────────────────────
  if (text === "/start" || text === "/help") {
    return await sendMessage(chat_id,
      `🀄 *Mahjong Tracker Bot*\n\n` +
      `Commands:\n` +
      `/log — Log a new game\n` +
      `/players — List all players\n` +
      `/scores — See current leaderboard\n` +
      `/cancel — Cancel current action`
    ), res.status(200).end();
  }

  // ── /cancel ──────────────────────────────────────────────
  if (text === "/cancel") {
    resetSession(chat_id);
    return await sendMessage(chat_id, "❌ Cancelled."), res.status(200).end();
  }

  // ── /players ─────────────────────────────────────────────
  if (text === "/players") {
    const players = await sql`SELECT name FROM players ORDER BY name`;
    const list = players.map(p => `• ${p.name}`).join("\n");
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
    const players = await sql`SELECT id, name FROM players ORDER BY name`;
    if (players.length < 2) {
      return await sendMessage(chat_id, "⚠️ Add at least 2 players via the web UI first."), res.status(200).end();
    }
    session.step = "awaiting_scores";
    session.players = players;
    session.scores = {};

    const playerList = players.map(p => `• *${p.name}*`).join("\n");
    await sendMessage(chat_id,
      `🎮 *Log a game*\n\n` +
      `Players:\n${playerList}\n\n` +
      `Enter scores as:\n\`Name: score\` — one per line, or all at once.\n\n` +
      `Example:\n\`\`\`\nDaddy: 32000\nMummy: -12000\nMegan: -8000\nHeidi: -12000\`\`\`\n\n` +
      `Scores must sum to *0*. Send /done when finished, or /cancel to abort.`
    );
    return res.status(200).end();
  }

  // ── /done ─────────────────────────────────────────────────
  if (text === "/done") {
    if (session.step !== "awaiting_scores") {
      return await sendMessage(chat_id, "Nothing in progress. Use /log to start."), res.status(200).end();
    }

    const entries = Object.entries(session.scores); // [[name, score], ...]
    if (entries.length < 2) {
      return await sendMessage(chat_id, "⚠️ Need at least 2 scores. Keep entering or /cancel."), res.status(200).end();
    }

    const total = entries.reduce((s, [, v]) => s + v, 0);
    if (total !== 0) {
      const diff = total > 0 ? `-${total}` : `+${Math.abs(total)}`;
      return await sendMessage(chat_id,
        `❌ Scores sum to *${total > 0 ? "+" : ""}${total}*, not 0.\nAdjust by *${diff}* total and re-enter the corrected score(s), or /cancel.`
      ), res.status(200).end();
    }

    // Save game
    const [game] = await sql`INSERT INTO games (played_at) VALUES (NOW()) RETURNING *`;
    const ranked = [...entries].sort((a, b) => b[1] - a[1]);
    for (let i = 0; i < ranked.length; i++) {
      const [name, score] = ranked[i];
      const player = session.players.find(p => p.name.toLowerCase() === name.toLowerCase());
      await sql`
        INSERT INTO game_results (game_id, player_id, score, rank)
        VALUES (${game.id}, ${player.id}, ${score}, ${i + 1})
      `;
    }

    const summary = ranked.map(([name, score], i) => {
      const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i+1}.`;
      return `${medal} ${name}: ${score > 0 ? "+" : ""}${score}`;
    }).join("\n");

    await sendMessage(chat_id, `✅ *Game #${game.id} saved!*\n\n${summary}`);
    resetSession(chat_id);
    return res.status(200).end();
  }

  // ── Score entry (during /log flow) ───────────────────────
  if (session.step === "awaiting_scores") {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    const errors = [];
    const parsed = [];

    for (const line of lines) {
      // Accept "Name: score" or "Name score"
      const match = line.match(/^([^:]+)[:\s]\s*(-?\d+)$/);
      if (!match) { errors.push(`⚠️ Couldn't parse: \`${line}\``); continue; }

      const name = match[1].trim();
      const score = parseInt(match[2]);

      // Fuzzy match player name (case-insensitive, partial)
      const player = session.players.find(p =>
        p.name.toLowerCase() === name.toLowerCase() ||
        p.name.toLowerCase().startsWith(name.toLowerCase())
      );

      if (!player) { errors.push(`⚠️ Unknown player: \`${name}\``); continue; }
      parsed.push({ player, score });
    }

    // Apply parsed scores
    for (const { player, score } of parsed) {
      session.scores[player.name] = score;
    }

    // Build feedback
    const currentEntries = Object.entries(session.scores);
    const currentSum = currentEntries.reduce((s, [, v]) => s + v, 0);
    const sumStr = currentSum === 0 ? "✅ 0" : `${currentSum > 0 ? "+" : ""}${currentSum}`;

    const recap = currentEntries.length > 0
      ? currentEntries
          .sort((a, b) => b[1] - a[1])
          .map(([name, score]) => `  ${name}: ${score > 0 ? "+" : ""}${score}`)
          .join("\n")
      : "  (none yet)";

    let reply = "";
    if (errors.length) reply += errors.join("\n") + "\n\n";
    reply += `*Current scores:*\n${recap}\n\nSum: *${sumStr}*`;
    if (currentSum === 0 && currentEntries.length >= 2) reply += "\n\nLooks good! Send /done to save.";
    else reply += "\n\nKeep entering scores or /done to try saving.";

    await sendMessage(chat_id, reply);
    return res.status(200).end();
  }

  // ── Fallback ──────────────────────────────────────────────
  await sendMessage(chat_id, "Use /log to record a game, /scores for the leaderboard, or /help for all commands.");
  res.status(200).end();
}
