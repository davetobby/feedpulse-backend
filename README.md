# FeedPulse Backend — Deploy Guide (no coding needed)

This is a real server that pulls live news from real sources (BBC, TechCrunch,
ESPN, CNBC, and more) and serves it to your app. We'll host it for free on a
site called **Glitch** — no terminal, no git, just your browser.

## Step 1 — Create a Glitch account
Go to https://glitch.com and sign up (free — you can use Google or email).

## Step 2 — Create a new project
1. Click "New Project" → "Import from GitHub" is not needed — instead choose
   **"glitch-hello-node"** (a basic Node.js starter).
2. This opens a code editor in your browser with some starter files.

## Step 3 — Replace the starter files with FeedPulse's files
In the Glitch editor, on the left sidebar you'll see files like `server.js`
and `package.json`.

1. Click `package.json` → select all the text → delete it → paste in the
   contents of the `package.json` from this folder.
2. Click `server.js` → select all the text → delete it → paste in the
   contents of the `server.js` from this folder.

Glitch auto-saves and auto-installs/restarts — no button to press.

## Step 4 — Add your NewsAPI key (privately, not in the code)
1. In the Glitch editor, click "Tools" (bottom left) → ".env"
2. Add this line, replacing with your actual key:
```
NEWSAPI_KEY=your_key_here
```
3. Glitch keeps this private — it's never visible in your public code, and
   never shared if you show someone your project.

A note on the free NewsAPI plan: it's meant for development/testing, not for
a live app you'd publish for other people to use — that's fine for right now
while we're building, and something to revisit only if you ever plan to
publish FeedPulse publicly.

## Step 5 — Get your live URL
At the top of the Glitch editor, click "Share" → copy the "Live site" URL.
It'll look like:
```
https://your-project-name.glitch.me
```

## Step 6 — Test it
Open that URL in your phone or computer browser. You should see something like:
```
{"status":"FeedPulse backend running","totalArticles":140,"lastRefreshed":"..."}
```
Give it a minute after first opening — it needs to fetch all the feeds once.

To see actual news, visit:
```
https://your-project-name.glitch.me/api/news?category=Tech
```

## Step 7 — Connect it to your app
Send me your Glitch URL and I'll wire the FeedPulse app to pull real news
from it instead of the sample stories.

## A note on free hosting
Glitch's free tier "sleeps" the server after a period of no visitors, and
wakes back up (takes a few seconds) on the next request. This is completely
normal for free hosting and fine for testing and personal use. If you ever
want it always-on with zero delay, that's a small paid upgrade — not required
to get everything working.
