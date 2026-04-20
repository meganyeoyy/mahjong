# 🀄 Mahjong Tracker

Track your family mahjong scores, rankings, and history. Built with Next.js + Neon Postgres, deployed on Vercel.

---

## 🚀 Deploy to Vercel (5 minutes)

### 1. Set up a Postgres database (free)

**Option A – Vercel Postgres (easiest):**
1. Go to your Vercel Dashboard → Storage → Create Database → Postgres
2. Copy the `DATABASE_URL` connection string

**Option B – Neon.tech (also free):**
1. Sign up at [neon.tech](https://neon.tech)
2. Create a project and copy the connection string

### 2. Deploy

```bash
# Push to GitHub first
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/mahjong-tracker.git
git push -u origin main
```

Then on Vercel:
1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new)
2. Add environment variable: `DATABASE_URL` = your Postgres connection string
3. Click Deploy ✅

The app auto-initialises the database tables on first load.

---

## 💻 Local Development

```bash
cp .env.example .env.local
# Fill in your DATABASE_URL in .env.local

npm install
npm run dev
# Open http://localhost:3000
```

---

## Features

- **Leaderboard** – ranked by total score with wins, avg score
- **Game Log** – record scores per player with optional wind seat & notes
- **Game History** – browse past games, delete mistakes
- **Players** – add family members with custom avatars

## Stack

- **Frontend**: Next.js 14 (Pages Router), vanilla CSS
- **Backend**: Next.js API Routes
- **Database**: Neon Postgres (serverless)
- **Deployment**: Vercel
