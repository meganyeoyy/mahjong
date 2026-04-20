import { getDb } from "../../lib/db";

export default async function handler(req, res) {
  const sql = getDb();

  if (req.method === "GET") {
    try {
      const players = await sql`
        SELECT 
          p.*,
          COUNT(gr.id) AS games_played,
          COALESCE(SUM(gr.score), 0) AS total_score,
          COALESCE(AVG(gr.score), 0) AS avg_score,
          COUNT(CASE WHEN gr.rank = 1 THEN 1 END) AS wins
        FROM players p
        LEFT JOIN game_results gr ON gr.player_id = p.id
        GROUP BY p.id
        ORDER BY total_score DESC
      `;
      return res.status(200).json(players);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "POST") {
    const { name, avatar } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    try {
      const [player] = await sql`
        INSERT INTO players (name, avatar)
        VALUES (${name}, ${avatar || "🀄"})
        RETURNING *
      `;
      return res.status(201).json(player);
    } catch (err) {
      if (err.message.includes("unique")) {
        return res.status(409).json({ error: "Player name already exists" });
      }
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === "DELETE") {
    const { id } = req.query;
    try {
      await sql`DELETE FROM players WHERE id = ${id}`;
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).end();
}
