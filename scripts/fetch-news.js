const fetch = require('node-fetch');
const fs = require('fs');
const path = require('path');

const NEWSAPI_KEY = process.env.NEWSAPI_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const QUERIES = [
  { q: 'SpaceX launch success', venture: 'spacex', label: 'SpaceX' },
  { q: 'Starship rocket milestone', venture: 'spacex', label: 'SpaceX' },
  { q: 'Tesla achievement delivery', venture: 'tesla', label: 'Tesla' },
  { q: 'Tesla FSD autonomous milestone', venture: 'tesla', label: 'Tesla' },
  { q: 'Tesla Optimus robot progress', venture: 'tesla', label: 'Tesla' },
  { q: 'Starlink satellite internet expansion', venture: 'starlink', label: 'Starlink' },
  { q: 'xAI Grok update release', venture: 'xai', label: 'xAI' },
  { q: 'Neuralink brain computer interface progress', venture: 'neura', label: 'Neuralink' },
  { q: 'X platform creator monetization', venture: 'x', label: 'X' },
  { q: 'Boring Company tunnel Las Vegas', venture: 'boring', label: 'Boring Co' },
  { q: 'DOGE government efficiency savings', venture: 'doge', label: 'DOGE' },
  { q: 'Elon Musk innovation achievement', venture: 'spacex', label: 'SpaceX' },
];

const POSITIVE_KEYWORDS = [
  'launch', 'success', 'milestone', 'record', 'breakthrough', 'achievement',
  'expand', 'growth', 'new', 'first', 'innovation', 'improve', 'advance',
  'deploy', 'complete', 'deliver', 'reach', 'hit', 'surpass', 'announce',
  'partner', 'upgrade', 'release', 'update', 'win', 'approval', 'progress'
];

const NEGATIVE_KEYWORDS = [
  'crash', 'fail', 'lawsuit', 'sue', 'investigate', 'probe', 'fine',
  'recall', 'death', 'kill', 'injury', 'accident', 'explosion', 'fire',
  'ban', 'block', 'controversy', 'scandal', 'fraud', 'loss', 'drop',
  'decline', 'fall', 'resign', 'fired', 'layoff', 'cut', 'miss',
  'disappoint', 'concern', 'worry', 'fear', 'risk', 'danger', 'threat',
  'arrest', 'charge', 'crime', 'attack', 'hate', 'racist', 'sexist'
];

function isLikelyPositive(title, description) {
  const text = `${title} ${description}`.toLowerCase();
  const hasNegative = NEGATIVE_KEYWORDS.some(kw => text.includes(kw));
  if (hasNegative) return false;
  const positiveScore = POSITIVE_KEYWORDS.filter(kw => text.includes(kw)).length;
  return positiveScore >= 1;
}

async function fetchNewsForQuery(query) {
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(query.q)}&sortBy=publishedAt&pageSize=5&language=en&apiKey=${NEWSAPI_KEY}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (!data.articles) return [];
    return data.articles
      .filter(a => a.title && a.description && a.url)
      .filter(a => !a.title.includes('[Removed]'))
      .filter(a => isLikelyPositive(a.title, a.description))
      .map(a => ({
        venture: query.venture,
        label: query.label,
        headline: a.title,
        summary: a.description,
        url: a.url,
        source: a.source?.name || 'News',
        publishedAt: a.publishedAt,
        date: new Date(a.publishedAt).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric'
        })
      }));
  } catch (err) {
    console.error(`Error fetching ${query.q}:`, err.message);
    return [];
  }
}

async function filterWithClaude(articles) {
  if (!articles.length) return [];

  const prompt = `You are a content curator for ThanksElonMusk.com — a positive-only tribute site celebrating Elon Musk's ventures including SpaceX, Tesla, xAI, Starlink, Neuralink, X, The Boring Company, and DOGE.

Review these news articles and return ONLY the ones that are:
- Genuinely positive, celebratory, or milestone-focused
- About real achievements, launches, releases, expansions, or innovations
- Suitable for a fan tribute site

EXCLUDE any articles that are:
- Critical, negative, or controversial about Elon or his companies
- About lawsuits, investigations, accidents, or failures
- Political attacks or opinion pieces against Elon
- Clickbait or sensationalist

Here are the articles to review (JSON array):
${JSON.stringify(articles.map((a, i) => ({ id: i, headline: a.headline, summary: a.summary })), null, 2)}

Respond with ONLY a JSON array of the approved article IDs, like: [0, 2, 5]
No explanation, no markdown, just the JSON array.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await res.json();
    const text = data.content?.[0]?.text?.trim() || '[]';
    const clean = text.replace(/```json|```/g, '').trim();
    const approvedIds = JSON.parse(clean);
    return articles.filter((_, i) => approvedIds.includes(i));
  } catch (err) {
    console.error('Claude filter error:', err.message);
    return articles;
  }
}

function deduplicateArticles(articles) {
  const seen = new Set();
  return articles.filter(a => {
    const key = a.headline.toLowerCase().slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildTodayDigest(articles) {
  const today = new Date().toISOString().split('T')[0];
  const ventures = ['spacex', 'tesla', 'xai', 'starlink', 'x', 'neura', 'boring', 'doge'];
  const digest = [];

  ventures.forEach(v => {
    const ventureArticles = articles.filter(a => a.venture === v).slice(0, 2);
    ventureArticles.forEach(a => {
      digest.push({
        venture: a.venture,
        label: a.label,
        headline: a.headline,
        summary: a.summary,
        url: a.url,
        source: a.source,
        date: a.date,
        publishedAt: a.publishedAt
      });
    });
  });

  return {
    date: today,
    displayDate: new Date().toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }),
    items: digest.slice(0, 16),
    generatedAt: new Date().toISOString()
  };
}

async function main() {
  console.log('🚀 Starting ThanksElonMusk news pipeline...');

  // Ensure data directory exists
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // Fetch all queries
  const allRaw = [];
  for (const query of QUERIES) {
    console.log(`📡 Fetching: ${query.q}`);
    const articles = await fetchNewsForQuery(query);
    allRaw.push(...articles);
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`📰 Raw articles fetched: ${allRaw.length}`);

  // Deduplicate
  const deduped = deduplicateArticles(allRaw);
  console.log(`🔍 After deduplication: ${deduped.length}`);

  // Filter with Claude in batches of 20
  const batchSize = 20;
  const approved = [];
  for (let i = 0; i < deduped.length; i += batchSize) {
    const batch = deduped.slice(i, i + batchSize);
    console.log(`🤖 Claude filtering batch ${Math.floor(i / batchSize) + 1}...`);
    const filtered = await filterWithClaude(batch);
    approved.push(...filtered);
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`✅ Approved articles: ${approved.length}`);

  // Sort by date, newest first
  approved.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  // Build news.json
  const newsData = {
    lastUpdated: new Date().toISOString(),
    displayUpdated: new Date().toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', timeZoneName: 'short'
    }),
    totalArticles: approved.length,
    articles: approved.slice(0, 50)
  };

  fs.writeFileSync(
    path.join(dataDir, 'news.json'),
    JSON.stringify(newsData, null, 2)
  );
  console.log('💾 Saved data/news.json');

  // Build today.json
  const todayData = buildTodayDigest(approved);
  fs.writeFileSync(
    path.join(dataDir, 'today.json'),
    JSON.stringify(todayData, null, 2)
  );
  console.log('💾 Saved data/today.json');

  console.log('🎉 Pipeline complete!');
}

main().catch(err => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
