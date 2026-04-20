import { getDb } from "../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const sql = getDb();
  try {
    const [{ count: total_games }] = await sql`SELECT COUNT(*) FROM games`;
    const [{ count: total_players }] = await sql`SELECT COUNT(*) FROM players`;

    const topPlayer = await sql`
      SELECT p.name, p.avatar, SUM(gr.score) AS total
      FROM players p
      JOIN game_results gr ON gr.player_id = p.id
      GROUP BY p.id
      ORDER BY total DESC
      LIMIT 1
    `;

    const recentScores = await sql`
      SELECT gr.score, g.played_at
      FROM game_results gr
      JOIN games g ON g.id = gr.game_id
      ORDER BY g.played_at DESC
      LIMIT 20
    `;

    return res.status(200).json({
      total_games: parseInt(total_games),
      total_players: parseInt(total_players),
      top_player: topPlayer[0] || null,
      recent_scores: recentScores,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
