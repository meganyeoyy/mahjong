import { initDb } from "../../lib/db";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    await initDb();
    res.status(200).json({ success: true, message: "Database initialised" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
