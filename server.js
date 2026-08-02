// FeedPulse backend — pulls real, live headlines from NewsAPI.org
// (structured, categorized) plus public RSS feeds (extra variety),
// merges and de-dupes them, and serves as a JSON API.

const express = require('express');
const cors = require('cors');
const Parser = require('rss-parser');

const app = express();
const parser = new Parser({ timeout: 10000 });
app.use(cors());

// Set this in Glitch under the ".env" file (Tools -> .env), never in code:
// NEWSAPI_KEY=your_key_here
const NEWSAPI_KEY = process.env.NEWSAPI_KEY || '';

// NewsAPI's built-in categories map almost 1:1 onto FeedPulse's.
// "general" is the closest fit for World.
const NEWSAPI_CATEGORY_MAP = {
  Tech: 'technology',
  Business: 'business',
  World: 'general',
  Entertainment: 'entertainment',
  Health: 'health',
  Sport: 'sports',
};

async function fetchFromNewsAPI(category, newsApiCategory) {
  if (!NEWSAPI_KEY) return [];
  try {
    const url = `https://newsapi.org/v2/top-headlines?category=${newsApiCategory}&language=en&country=us&pageSize=30&apiKey=${NEWSAPI_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== 'ok') {
      console.error(`NewsAPI error for ${category}:`, data.message);
      return [];
    }
    return data.articles.map((item) => ({
      category,
      source: item.source?.name || 'NewsAPI',
      link: item.url,
      headline: item.title,
      body: item.description || item.content || item.title,
      isoDate: item.publishedAt,
    }));
  } catch (err) {
    console.error(`NewsAPI fetch failed for ${category}:`, err.message);
    return [];
  }
}

// --- Real, public RSS feeds, grouped by category and subtopic ---
// Add more feeds any time to grow the total story count.
const FEEDS = {
  Tech: [
    { url: 'https://techcrunch.com/feed/', source: 'TechCrunch', subtopic: 'Startups' },
    { url: 'https://www.theverge.com/rss/index.xml', source: 'The Verge', subtopic: 'Gadgets' },
    { url: 'http://feeds.arstechnica.com/arstechnica/index', source: 'Ars Technica', subtopic: 'AI' },
  ],
  Business: [
    { url: 'http://feeds.bbci.co.uk/news/business/rss.xml', source: 'BBC News', subtopic: 'Economy' },
    { url: 'https://www.cnbc.com/id/10001147/device/rss/rss.html', source: 'CNBC', subtopic: 'Markets' },
  ],
  World: [
    { url: 'http://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC News', subtopic: 'Global' },
    { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera', subtopic: 'Global' },
  ],
  Entertainment: [
    { url: 'http://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml', source: 'BBC News', subtopic: 'Film & TV' },
    { url: 'https://variety.com/feed/', source: 'Variety', subtopic: 'Film & TV' },
  ],
  Health: [
    { url: 'http://feeds.bbci.co.uk/news/health/rss.xml', source: 'BBC News', subtopic: 'Public Health' },
  ],
  Sport: [
    { url: 'http://feeds.bbci.co.uk/sport/rss.xml?edition=uk', source: 'BBC Sport', subtopic: null },
    { url: 'https://www.espn.com/espn/rss/news', source: 'ESPN', subtopic: null },
  ],
};

// Keyword matching to tag Sport stories with a specific sport/team,
// powering the same drill-down the app already uses for Sport.
const SPORT_KEYWORDS = {
  Football: ['football', 'premier league', 'manchester united', 'arsenal', 'chelsea', 'liverpool', 'transfer'],
  Basketball: ['nba', 'basketball', 'lakers', 'warriors', 'celtics'],
  Tennis: ['tennis', 'wimbledon', 'grand slam'],
};
const TEAM_KEYWORDS = ['Manchester United', 'Arsenal', 'Chelsea', 'Liverpool', 'Lakers', 'Warriors', 'Celtics'];

function detectSport(text) {
  const lower = text.toLowerCase();
  for (const [sport, keywords] of Object.entries(SPORT_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) return sport;
  }
  return null;
}
function detectTeam(text) {
  return TEAM_KEYWORDS.find((team) => text.includes(team)) || null;
}

function timeAgo(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(mins, 1)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function makeId(link) {
  let hash = 0;
  for (let i = 0; i < link.length; i++) {
    hash = (hash << 5) - hash + link.charCodeAt(i);
    hash |= 0;
  }
  return `a${Math.abs(hash)}`;
}

let cachedArticles = [];
let lastRefreshed = null;
let refreshInProgress = null;

// Because free hosting sleeps when idle, a fixed timer alone isn't
// reliable — it doesn't run while asleep. So instead: whenever a
// request comes in and the cache is older than 15 minutes, refresh
// right then, before responding. This keeps things fresh no matter
// how sporadically the app is used, without wasting API quota when
// nobody's around.
async function ensureFresh() {
  const STALE_MS = 15 * 60 * 1000;
  const isStale = !lastRefreshed || Date.now() - new Date(lastRefreshed).getTime() > STALE_MS;
  if (!isStale) return;
  if (!refreshInProgress) {
    refreshInProgress = refreshFeeds().finally(() => {
      refreshInProgress = null;
    });
  }
  await refreshInProgress;
}

async function refreshFeeds() {
  const all = [];

  // 1. NewsAPI — structured, reliable, one call per category
  for (const [category, newsApiCategory] of Object.entries(NEWSAPI_CATEGORY_MAP)) {
    const items = await fetchFromNewsAPI(category, newsApiCategory);
    for (const item of items) {
      const article = {
        id: makeId(item.link || item.headline),
        category: item.category,
        source: item.source,
        time: item.isoDate ? timeAgo(item.isoDate) : 'recently',
        readTime: `${Math.max(1, Math.round((item.body || '').split(' ').length / 200))} min read`,
        headline: item.headline,
        body: item.body,
        link: item.link,
      };
      if (category === 'Sport') {
        article.sport = detectSport(item.headline + ' ' + item.body);
        article.team = detectTeam(item.headline + ' ' + item.body);
      } else {
        article.subtopic = null; // NewsAPI items aren't subtopic-tagged; still show in main feed
      }
      all.push(article);
    }
  }

  // 2. RSS feeds — extra variety, and subtopic tags for the drill-down
  for (const [category, feeds] of Object.entries(FEEDS)) {
    for (const feed of feeds) {
      try {
        const parsed = await parser.parseURL(feed.url);
        for (const item of parsed.items.slice(0, 20)) {
          const headline = item.title || '';
          const body = (item.contentSnippet || item.summary || '').slice(0, 600) || headline;
          const article = {
            id: makeId(item.link || headline),
            category,
            source: feed.source,
            time: item.isoDate ? timeAgo(item.isoDate) : 'recently',
            readTime: `${Math.max(1, Math.round(body.split(' ').length / 200))} min read`,
            headline,
            body,
            link: item.link,
          };
          if (category === 'Sport') {
            article.sport = detectSport(headline + ' ' + body);
            article.team = detectTeam(headline + ' ' + body);
          } else {
            article.subtopic = feed.subtopic;
          }
          all.push(article);
        }
      } catch (err) {
        console.error(`Failed to fetch ${feed.source} (${category}):`, err.message);
      }
    }
  }
  // De-duplicate by id (same story sometimes appears in multiple feeds)
  const seen = new Set();
  cachedArticles = all.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
  lastRefreshed = new Date().toISOString();
  console.log(`Refreshed feeds: ${cachedArticles.length} articles at ${lastRefreshed}`);
}

// Startup refresh, plus a backup timer for while the server stays
// continuously awake (a real refresh-if-stale check also runs per
// request, see ensureFresh above).
refreshFeeds();
setInterval(refreshFeeds, 3 * 60 * 60 * 1000);

app.get('/api/news', async (req, res) => {
  await ensureFresh();
  const { category, sport, team } = req.query;
  let result = cachedArticles;
  if (category) result = result.filter((a) => a.category === category);
  if (sport) result = result.filter((a) => a.sport === sport);
  if (team) result = result.filter((a) => a.team === team);
  res.json({ count: result.length, lastRefreshed, articles: result });
});

app.get('/', async (req, res) => {
  await ensureFresh();
  res.json({ status: 'FeedPulse backend running', totalArticles: cachedArticles.length, lastRefreshed });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FeedPulse backend listening on port ${PORT}`));
