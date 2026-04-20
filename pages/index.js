import { useState, useEffect, useCallback } from 'react';
import Head from 'next/head';
import { format, parseISO } from 'date-fns';

const AVATARS = ['🀄', '🐉', '🦁', '🐼', '🦊', '🐯', '🦅', '🌸', '⚡', '🌙', '🔥', '💎'];

// ── helpers ──────────────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function fmtDate(iso) {
  try { return format(parseISO(iso), 'MMM d, yyyy · h:mm a'); }
  catch { return iso; }
}

// ── Stat Card ─────────────────────────────────────────────
function StatCard({ label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

// ── Add Player Modal ───────────────────────────────────────
function AddPlayerModal({ onClose, onAdded }) {
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('🀄');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    if (!name.trim()) return setError('Please enter a name');
    setLoading(true);
    setError('');
    try {
      await apiFetch('/api/players', { method: 'POST', body: { name: name.trim(), avatar } });
      onAdded();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">🀄 Add Family Member</div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-group">
          <label className="form-label">Name</label>
          <input
            className="form-input"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && submit()}
            placeholder="e.g. Grandma, Uncle Ben…"
            autoFocus
          />
        </div>
        <div className="form-group">
          <label className="form-label">Avatar</label>
          <div className="avatar-picker">
            {AVATARS.map(a => (
              <button
                key={a}
                className={`avatar-option${avatar === a ? ' selected' : ''}`}
                onClick={() => setAvatar(a)}
              >{a}</button>
            ))}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading}>
            {loading ? 'Adding…' : 'Add Player'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Log Game Modal ─────────────────────────────────────────
function LogGameModal({ players, onClose, onLogged }) {
  const [scores, setScores] = useState(() =>
    players.map(p => ({ player_id: p.id, name: p.name, avatar: p.avatar, score: '' }))
  );
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function updateScore(idx, val) {
    setScores(s => s.map((r, i) => i === idx ? { ...r, score: val } : r));
  }

  // Live sum of all filled-in scores
  const filledScores = scores.filter(s => s.score !== '');
  const sum = filledScores.reduce((acc, s) => acc + (parseInt(s.score) || 0), 0);
  const sumOk = filledScores.length >= 2 && sum === 0;

  async function submit() {
    if (filledScores.length < 2) return setError('Enter scores for at least 2 players');
    if (sum !== 0) return setError(`Scores must add up to 0 (currently ${sum > 0 ? '+' : ''}${sum})`);

    const results = filledScores
      .map(s => ({ ...s, score: parseInt(s.score) }))
      .filter(s => !isNaN(s.score))
      .sort((a, b) => b.score - a.score)
      .map((s, i) => ({ player_id: s.player_id, score: s.score, rank: i + 1 }));

    setLoading(true);
    setError('');
    try {
      await apiFetch('/api/games', {
        method: 'POST',
        body: { results, notes: notes.trim() || null, played_at: new Date(date).toISOString() },
      });
      onLogged();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  const sumColor = filledScores.length < 2
    ? 'var(--text-muted)'
    : sumOk
      ? 'var(--jade-light)'
      : 'var(--red-light)';

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">🎮 Log Game</div>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="form-group">
          <label className="form-label">Date & Time</label>
          <input
            className="form-input"
            type="datetime-local"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label className="form-label" style={{ margin: 0 }}>Scores (leave blank to exclude)</label>
            <div style={{
              fontSize: 12,
              fontFamily: 'var(--font-mono)',
              color: sumColor,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              transition: 'color 0.2s',
            }}>
              {filledScores.length >= 2 && (
                <>
                  <span>Sum:</span>
                  <span style={{ fontWeight: 600 }}>
                    {sum > 0 ? '+' : ''}{sum}
                  </span>
                  <span>{sumOk ? '✓' : '✗'}</span>
                </>
              )}
            </div>
          </div>
          <div className="score-inputs">
            {scores.map((r, i) => (
              <div className="score-row" key={r.player_id}>
                <span style={{ fontSize: 22 }}>{r.avatar}</span>
                <span className="score-player-name">{r.name}</span>
                <input
                  className="form-input"
                  style={{ margin: 0 }}
                  type="number"
                  placeholder="e.g. +32000"
                  value={r.score}
                  onChange={e => updateScore(i, e.target.value)}
                />
              </div>
            ))}
          </div>
          {filledScores.length >= 2 && !sumOk && (
            <div style={{ fontSize: 12, color: 'var(--red-light)', marginTop: 8 }}>
              Scores must sum to 0. Adjust by {sum > 0 ? `-${sum}` : `+${Math.abs(sum)}`} total.
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Notes (optional)</label>
          <textarea
            className="form-input"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="e.g. CNY 2025, Grandma's house…"
          />
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading || (filledScores.length >= 2 && !sumOk)}>
            {loading ? 'Saving…' : 'Save Game'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Game Modal ────────────────────────────────────────
function EditGameModal({ game, players, onClose, onSaved }) {
  // Pre-fill scores from existing game results
  const [scores, setScores] = useState(() =>
    players.map(p => {
      const existing = (game.results || []).find(r => r.player_id === p.id);
      return {
        player_id: p.id,
        name: p.name,
        avatar: p.avatar,
        score: existing ? String(existing.score) : '',
      };
    })
  );
  const [notes, setNotes] = useState(game.notes || '');
  const [date, setDate] = useState(() => {
    try { return new Date(game.played_at).toISOString().slice(0, 16); }
    catch { return new Date().toISOString().slice(0, 16); }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function updateScore(idx, val) {
    setScores(s => s.map((r, i) => i === idx ? { ...r, score: val } : r));
  }

  const filledScores = scores.filter(s => s.score !== '');
  const sum = filledScores.reduce((acc, s) => acc + (parseInt(s.score) || 0), 0);
  const sumOk = filledScores.length >= 2 && sum === 0;
  const sumColor = filledScores.length < 2 ? 'var(--text-muted)' : sumOk ? 'var(--jade-light)' : 'var(--red-light)';

  async function submit() {
    if (filledScores.length < 2) return setError('Enter scores for at least 2 players');
    if (sum !== 0) return setError(`Scores must add up to 0 (currently ${sum > 0 ? '+' : ''}${sum})`);

    const results = filledScores
      .map(s => ({ ...s, score: parseInt(s.score) }))
      .filter(s => !isNaN(s.score))
      .sort((a, b) => b.score - a.score)
      .map((s, i) => ({ player_id: s.player_id, score: s.score, rank: i + 1 }));

    setLoading(true);
    setError('');
    try {
      await apiFetch(`/api/games?id=${game.id}`, {
        method: 'PUT',
        body: { results, notes: notes.trim() || null, played_at: new Date(date).toISOString() },
      });
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">✏️ Edit Game <span style={{ fontSize: 14, color: 'var(--text-dim)', fontFamily: 'DM Mono' }}>#{game.id}</span></div>
        {error && <div className="alert alert-error">{error}</div>}

        <div className="form-group">
          <label className="form-label">Date & Time</label>
          <input className="form-input" type="datetime-local" value={date} onChange={e => setDate(e.target.value)} />
        </div>

        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label className="form-label" style={{ margin: 0 }}>Scores (leave blank to exclude)</label>
            <div style={{ fontSize: 12, color: sumColor, display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.2s' }}>
              {filledScores.length >= 2 && (
                <><span>Sum:</span><span style={{ fontWeight: 600 }}>{sum > 0 ? '+' : ''}{sum}</span><span>{sumOk ? '✓' : '✗'}</span></>
              )}
            </div>
          </div>
          <div className="score-inputs">
            {scores.map((r, i) => (
              <div className="score-row" key={r.player_id}>
                <span style={{ fontSize: 22 }}>{r.avatar}</span>
                <span className="score-player-name">{r.name}</span>
                <input
                  className="form-input"
                  style={{ margin: 0 }}
                  type="number"
                  placeholder="e.g. +32000"
                  value={r.score}
                  onChange={e => updateScore(i, e.target.value)}
                />
              </div>
            ))}
          </div>
          {filledScores.length >= 2 && !sumOk && (
            <div style={{ fontSize: 12, color: 'var(--red-light)', marginTop: 8 }}>
              Adjust by {sum > 0 ? `-${sum}` : `+${Math.abs(sum)}`} total.
            </div>
          )}
        </div>

        <div className="form-group">
          <label className="form-label">Notes (optional)</label>
          <textarea className="form-input" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. CNY 2025, Grandma's house…" />
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={loading || (filledScores.length >= 2 && !sumOk)}>
            {loading ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────
export default function Home() {
  const [tab, setTab] = useState('leaderboard');
  const [players, setPlayers] = useState([]);
  const [games, setGames] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [showLogGame, setShowLogGame] = useState(false);
  const [editingGame, setEditingGame] = useState(null);
  const [initError, setInitError] = useState('');

  // Init DB on first load
  useEffect(() => {
    async function init() {
      try {
        await apiFetch('/api/init', { method: 'POST' });
        setInitialized(true);
      } catch (e) {
        setInitError(e.message);
      }
    }
    init();
  }, []);

  const refresh = useCallback(async () => {
    if (!initialized) return;
    setLoading(true);
    try {
      const [p, g, s] = await Promise.all([
        apiFetch('/api/players'),
        apiFetch('/api/games'),
        apiFetch('/api/stats'),
      ]);
      setPlayers(p);
      setGames(g);
      setStats(s);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [initialized]);

  useEffect(() => { refresh(); }, [refresh]);

  async function deletePlayer(id) {
    if (!confirm('Remove this player? Their game history will remain.')) return;
    await apiFetch(`/api/players?id=${id}`, { method: 'DELETE' });
    refresh();
  }

  async function deleteGame(id) {
    if (!confirm('Delete this game?')) return;
    await apiFetch(`/api/games?id=${id}`, { method: 'DELETE' });
    refresh();
  }

  if (initError) return (
    <div className="app" style={{ paddingTop: 60, textAlign: 'center' }}>
      <div className="alert alert-error" style={{ maxWidth: 500, margin: '0 auto' }}>
        <strong>Database connection error:</strong> {initError}
        <br /><br />
        Make sure <code>DATABASE_URL</code> is set in your Vercel environment variables.
      </div>
    </div>
  );

  return (
    <>
      <Head>
        <title>麻将 Mahjong Tracker</title>
        <meta name="description" content="Family mahjong winnings tracker" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🀄</text></svg>" />
      </Head>

      <div className="app">
        {/* Header */}
        <header className="header">
          <div className="header-brand">
            <div className="header-tiles">
              {['🀇','🀙','🀐'].map(t => (
                <div key={t} className="tile-chip">{t}</div>
              ))}
            </div>
            <div>
              <div className="header-title">麻将 Tracker</div>
              <div className="header-subtitle">Family Mahjong Records</div>
            </div>
          </div>
          <div className="nav">
            <button
              className={`btn btn-primary btn-sm`}
              onClick={() => setShowLogGame(true)}
              disabled={players.length < 2}
            >
              + Log Game
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAddPlayer(true)}>
              + Player
            </button>
          </div>
        </header>

        {/* Stats bar */}
        <div className="stats-bar">
          <StatCard label="Total Games" value={stats?.total_games ?? '—'} sub="games recorded" />
          <StatCard label="Players" value={stats?.total_players ?? '—'} sub="family members" />
          <StatCard
            label="Top Player"
            value={stats?.top_player ? stats.top_player.avatar : '—'}
            sub={stats?.top_player?.name ?? 'none yet'}
          />
          <StatCard
            label="Total Score"
            value={stats ? (players.reduce((s, p) => s + Math.abs(parseInt(p.total_score || 0)), 0)).toLocaleString() : '—'}
            sub="combined points"
          />
        </div>

        {/* Tabs */}
        <div className="tabs">
          <button className={`tab${tab === 'leaderboard' ? ' active' : ''}`} onClick={() => setTab('leaderboard')}>
            Leaderboard
          </button>
          <button className={`tab${tab === 'history' ? ' active' : ''}`} onClick={() => setTab('history')}>
            Game History
          </button>
          <button className={`tab${tab === 'players' ? ' active' : ''}`} onClick={() => setTab('players')}>
            Players
          </button>
        </div>

        {/* Content */}
        {loading && initialized ? (
          <div className="loading"><div className="spinner" /><span>Loading…</span></div>
        ) : (
          <>
            {/* LEADERBOARD */}
            {tab === 'leaderboard' && (
              <div className="section">
                <div className="section-header">
                  <div className="section-title">Rankings</div>
                </div>
                {players.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">🀄</div>
                    <div className="empty-text">No players yet.<br/>Add family members to get started.</div>
                  </div>
                ) : (
                  <div className="leaderboard">
                    {players.map((p, i) => (
                      <div key={p.id} className={`player-row rank-${i + 1}`}>
                        <div className={`rank-badge${i >= 3 ? ' other' : ''}`}>
                          {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                        </div>
                        <div className="player-avatar">{p.avatar}</div>
                        <div>
                          <div className="player-name">{p.name}</div>
                          <div className="player-games">{p.games_played} game{p.games_played !== 1 ? 's' : ''}</div>
                        </div>
                        <div className="player-stat">
                          <div className="player-stat-value">{parseInt(p.total_score || 0).toLocaleString()}</div>
                          <div className="player-stat-label">Total</div>
                        </div>
                        <div className="player-stat">
                          <div className="player-stat-value">{Math.round(p.avg_score || 0)}</div>
                          <div className="player-stat-label">Avg</div>
                        </div>
                        <div className="win-badge">{p.wins}W</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* GAME HISTORY */}
            {tab === 'history' && (
              <div className="section">
                <div className="section-header">
                  <div className="section-title">Game History</div>
                </div>
                {games.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">🎮</div>
                    <div className="empty-text">No games logged yet.<br/>Click "Log Game" to record your first round.</div>
                  </div>
                ) : (
                  games.map(g => (
                    <div key={g.id} className="game-card">
                      <div className="game-header">
                        <div>
                          <div className="game-date">{fmtDate(g.played_at)}</div>
                          {g.notes && <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4 }}>💬 {g.notes}</div>}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div className="game-id">#{g.id}</div>
                          <button className="btn btn-secondary btn-sm" onClick={() => setEditingGame(g)}>Edit</button>
                          <button className="btn btn-danger" onClick={() => deleteGame(g.id)}>Delete</button>
                        </div>
                      </div>
                      <div className="game-results">
                        {(g.results || []).filter(r => r.player_id).map(r => (
                          <div key={r.player_id} className={`result-chip${r.rank === 1 ? ' winner' : ''}`}>
                            <div className="result-rank">#{r.rank}</div>
                            <div className="result-info">
                              <div className="result-name">{r.player_avatar} {r.player_name}</div>
                            </div>
                            <div className={`result-score${r.score < 0 ? ' negative' : ''}`}>
                              {r.score > 0 ? '+' : ''}{r.score.toLocaleString()}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* PLAYERS */}
            {tab === 'players' && (
              <div className="section">
                <div className="section-header">
                  <div className="section-title">Family Members</div>
                  <button className="btn btn-secondary btn-sm" onClick={() => setShowAddPlayer(true)}>+ Add</button>
                </div>
                {players.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">👨‍👩‍👧‍👦</div>
                    <div className="empty-text">Add your family members to start tracking.</div>
                  </div>
                ) : (
                  <div className="leaderboard">
                    {players.map(p => (
                      <div key={p.id} className="player-row">
                        <div style={{ width: 8 }} />
                        <div className="player-avatar">{p.avatar}</div>
                        <div>
                          <div className="player-name">{p.name}</div>
                          <div className="player-games">{p.games_played} games · {p.wins} wins</div>
                        </div>
                        <div className="player-stat">
                          <div className="player-stat-value">{parseInt(p.total_score || 0).toLocaleString()}</div>
                          <div className="player-stat-label">Points</div>
                        </div>
                        <div className="player-stat">
                          <div className="player-stat-value">{Math.round(p.avg_score || 0)}</div>
                          <div className="player-stat-label">Avg</div>
                        </div>
                        <div className="player-row-actions">
                          <button className="btn btn-danger" onClick={() => deletePlayer(p.id)}>Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showAddPlayer && (
        <AddPlayerModal
          onClose={() => setShowAddPlayer(false)}
          onAdded={refresh}
        />
      )}
      {showLogGame && (
        <LogGameModal
          players={players}
          onClose={() => setShowLogGame(false)}
          onLogged={refresh}
        />
      )}
      {editingGame && (
        <EditGameModal
          game={editingGame}
          players={players}
          onClose={() => setEditingGame(null)}
          onSaved={refresh}
        />
      )}
    </>
  );
}
