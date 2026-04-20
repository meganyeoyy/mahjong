import { getDb } from "../../lib/db";

export default async function handler(req, res) {
  const sql = getDb();

  if (req.method === "GET") {
    try {
      const games = await sql`
        SELECT 
          g.id,
          g.played_at,
          g.notes,
          json_agg(
            json_build_object(
              'player_id', gr.player_id,
              'player_name', p.name,
              'player_avatar', p.avatar,
              'score', gr.score,
              'wind', gr.wind,
              'rank', gr.rank
            ) ORDER BY gr.rank ASC NULLS LAST
          ) AS results
        FROM games g
        LEFT JOIN game_results gr ON gr.game_id = g.id
        LEFT JOIN players p ON p.id = gr.player_id
        GROUP BY g.id
        ORDER BY g.played_at DESC
        LIMIT 50
      `;
      return res.status(200).json(games);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const { results, notes, played_at } = req.body;
    // results: [{ player_id, score, wind, rank }]
    if (!results || results.length < 2) {
      return res.status(400).json({ error: "At least 2 player results required" });
    }

    const total = results.reduce((sum, r) => sum + (parseInt(r.score) || 0), 0);
    if (total !== 0) {
      return res.status(400).json({ error: `Scores must sum to 0 (got ${total})` });
    }

    try {
      const [game] = await sql`
        INSERT INTO games (notes, played_at)
        VALUES (${notes || null}, ${played_at || new Date().toISOString()})
        RETURNING *
      `;

      for (const r of results) {
        await sql`
          INSERT INTO game_results (game_id, player_id, score, rank)
          VALUES (${game.id}, ${r.player_id}, ${r.score}, ${r.rank || null})
        `;
      }

      return res.status(201).json({ success: true, game_id: game.id });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    try {
      await sql`DELETE FROM games WHERE id = ${id}`;
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).end();
}
