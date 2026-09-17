const express = require("express");
const axios = require("axios");
const path = require("path");
const app = express();
const PORT = process.env.PORT || 3000;

// ============ CONFIGURATION ============
const BETIKA_API = {
  baseUrl: "https://api.betika.com/v1",
  liveBaseUrl: "https://live.betika.com/v1",
  endpoints: {
    sports: "/uo/sports",
    matches: "/uo/matches",
    match: "/uo/match",
    sport: "/uo/sport",
    jackpot: "/jackpot/events",
    previousJackpot: "/jackpot/previous",
    boosted: "/boosted/events",
  },
};

// ============ IN-MEMORY CACHE ============
let cache = {
  matches: [],
  jackpots: [],
  previousJackpots: [],
  boostedEvents: [],
  sports: [],
  lastUpdate: null,
  lastJackpotUpdate: null,
};

// ============ API SERVICE ============
class BetikaApiService {
  constructor() {
    this.baseUrl = BETIKA_API.baseUrl;
    this.liveBaseUrl = BETIKA_API.liveBaseUrl;
  }

  async fetchWithTimeout(url, timeout = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // Get all sports
  async getSports() {
    const url = `${this.baseUrl}${BETIKA_API.endpoints.sports}`;
    return this.fetchWithTimeout(url);
  }

  // Get matches with filters
  async getMatches(params = {}) {
    const {
      page = 1,
      limit = 100,
      sport_id = null,
      sub_type_id = "1,186,340",
      sort_id = 1,
      period_id = -1,
      tab = "",
      esports = false,
    } = params;

    let url = `${this.baseUrl}${BETIKA_API.endpoints.matches}?page=${page}&limit=${limit}&sub_type_id=${sub_type_id}&sort_id=${sort_id}&period_id=${period_id}&esports=${esports}`;

    if (sport_id) url += `&sport_id=${sport_id}`;
    if (tab) url += `&tab=${tab}`;

    return this.fetchWithTimeout(url);
  }

  // Get match details by match_id
  async getMatch(matchId) {
    const url = `${this.liveBaseUrl}${BETIKA_API.endpoints.match}?id=${matchId}`;
    return this.fetchWithTimeout(url);
  }

  // Get match details by parent_match_id
  async getMatchByParentId(parentMatchId) {
    const url = `${this.baseUrl}${BETIKA_API.endpoints.match}?parent_match_id=${parentMatchId}`;
    return this.fetchWithTimeout(url);
  }

  // Get matches by sport
  async getMatchesBySport(sportId, params = {}) {
    const {
      page = 1,
      limit = 100,
      sub_type_id = "1,186,340",
      sort_id = 1,
      period_id = -1,
    } = params;

    const url = `${this.baseUrl}${BETIKA_API.endpoints.matches}?page=${page}&limit=${limit}&sport_id=${sportId}&sub_type_id=${sub_type_id}&sort_id=${sort_id}&period_id=${period_id}`;
    return this.fetchWithTimeout(url);
  }

  // Get sport categories and competitions
  async getSport(sportId, params = {}) {
    const { page = 1, limit = 100 } = params;
    const url = `${this.baseUrl}${BETIKA_API.endpoints.sport}?page=${page}&limit=${limit}&id=${sportId}`;
    return this.fetchWithTimeout(url);
  }

  // Get jackpot events
  async getJackpotData() {
    const url = `${this.baseUrl}${BETIKA_API.endpoints.jackpot}`;
    return this.fetchWithTimeout(url);
  }

  async getJackpotEvents(eventId) {
    const url = `${this.baseUrl}${BETIKA_API.endpoints.jackpot}?id=${eventId}`;
    return this.fetchWithTimeout(url);
  }

  // Get previous jackpots
  async getPreviousJackpots() {
    const url = `${this.baseUrl}${BETIKA_API.endpoints.previousJackpot}`;
    return this.fetchWithTimeout(url);
  }

  // Get boosted events
  async getBoostedEvents() {
    const url = `${this.baseUrl}${BETIKA_API.endpoints.boosted}`;
    return this.fetchWithTimeout(url);
  }
}

const apiService = new BetikaApiService();

// ============ CACHE UPDATE FUNCTIONS ============
async function updateCache() {
  console.log("🔄 Updating cache...");
  try {
    // Fetch matches (Soccer by default)
    const matchesData = await apiService.getMatches({
      limit: 100,
      sport_id: 14,
      sort_id: 1,
    });
    cache.matches = matchesData.data || [];
    cache.matchesMeta = matchesData.meta || {};

    // Fetch sports
    const sportsData = await apiService.getSports();
    cache.sports = sportsData.data || [];

    // Fetch jackpots
    const jackpotData = await apiService.getJackpotData();
    cache.jackpots = jackpotData || [];

    const jackpotEvents = await apiService.getJackpotEvents({eventId : 2539});
    cache.jackpotEvents = jackpotEvents || [];

    // Fetch previous jackpots
    const previousJackpotData = await apiService.getPreviousJackpots();
    cache.previousJackpots = previousJackpotData || [];

    // Fetch boosted events
    const boostedData = await apiService.getBoostedEvents();
    cache.boostedEvents = boostedData || [];

    cache.lastUpdate = new Date().toISOString();
    console.log(`✅ Cache updated at ${cache.lastUpdate}`);
    console.log(`   - ${cache.matches.length} matches loaded`);
    console.log(`   - ${cache.sports.length} sports loaded`);
    console.log(`   - ${cache.jackpots.length} jackpots loaded`);
  } catch (error) {
    console.error("❌ Cache update failed:", error.message);
  }
}

async function updateJackpotCache() {
  console.log("🔄 Updating jackpot cache...");
  try {
    const jackpotData = await apiService.getJackpotEvents();
    cache.jackpots = jackpotData || [];
    cache.lastJackpotUpdate = new Date().toISOString();
    console.log(`✅ Jackpot cache updated at ${cache.lastJackpotUpdate}`);
  } catch (error) {
    console.error("❌ Jackpot cache update failed:", error.message);
  }
}

// ============ DATA TRANSFORMERS ============
function transformMatch(match) {
  return {
    id: match.match_id,
    homeTeam: match.home_team,
    awayTeam: match.away_team,
    startTime: match.start_time,
    competition: match.competition_name,
    category: match.category,
    sportId: match.sport_id,
    sportName: match.sport_name,
    competitionId: match.competition_id,
    parentMatchId: match.parent_match_id,
    sideBets: match.side_bets,
    homeOdd: match.home_odd,
    neutralOdd: match.neutral_odd,
    awayOdd: match.away_odd,
    isEsport: match.is_esport,
    isSrl: match.is_srl,
    provider: match.provider,
    liveStatus: match.match_status,
    currentScore: match.current_score,
    matchTime: match.match_time,
    eventStatus: match.event_status,
    odds: match.odds || [],
    gameId: match.game_id,
  };
}

function transformMatchDetail(matchData) {
  if (!matchData || !matchData.data) return null;

  return {
    matchId: matchData.meta?.match_id,
    homeTeam: matchData.meta?.home_team,
    awayTeam: matchData.meta?.away_team,
    startTime: matchData.meta?.start_time,
    competition: matchData.meta?.competition_name,
    category: matchData.meta?.category,
    sportId: matchData.meta?.sport_id,
    sportName: matchData.meta?.sport_name,
    currentScore: matchData.meta?.current_score,
    matchStatus: matchData.meta?.match_status,
    eventStatus: matchData.meta?.event_status,
    matchTime: matchData.meta?.match_time,
    homeOdd: matchData.meta?.home_odd,
    neutralOdd: matchData.meta?.neutral_odd,
    awayOdd: matchData.meta?.away_odd,
    markets: matchData.data.map((market) => ({
      subTypeId: market.sub_type_id,
      name: market.name,
      active: market.market_active === 1,
      odds: market.odds.map((odd) => ({
        display: odd.display,
        key: odd.odd_key,
        value: parseFloat(odd.odd_value) || null,
        specialBetValue: odd.special_bet_value || null,
        active: odd.odd_active === 1,
      })),
    })),
    marketGroups: matchData.market_groups || [],
    meta: matchData.meta,
  };
}

// ============ API ENDPOINTS ============

// Root endpoint - API documentation
app.get("/", (req, res) => {
  res.json({
    name: "Betika API",
    version: "3.0.0",
    description:
      "Betika matches, match details, and jackpot data API using official Betika API",
    baseUrl: `http://localhost:${PORT}`,
    endpoints: {
      "/api": "API documentation",
      "/api/matches": "Get all matches with filtering options",
      "/api/matches/:id": "Get match by ID",
      "/api/match/:matchId": "Get detailed match by Betika match ID",
      "/api/matches/sport/:sportId": "Get matches by sport",
      "/api/sports": "Get all sports",
      "/api/sport/:sportId": "Get sport categories and competitions",
      "/api/jackpot": "Get jackpot events",
      "/api/jackpot/previous": "Get previous jackpots",
      "/api/jackpot/boosted": "Get boosted events",
      "/api/refresh": "Force refresh all data",
      "/api/health": "API health check",
    },
    cache: {
      lastUpdate: cache.lastUpdate,
      totalMatches: cache.matches.length,
      totalSports: cache.sports.length,
    },
    timestamp: new Date().toISOString(),
  });
});

// Get all sports
app.get("/api/sports", async (req, res) => {
  try {
    const sportsData = await apiService.getSports();
    res.json({
      success: true,
      data: sportsData.data || [],
      meta: sportsData.meta || {},
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch sports",
      message: error.message,
    });
  }
});

// Get sport categories and competitions
app.get("/api/sport/:sportId", async (req, res) => {
  const { sportId } = req.params;
  const { limit = 100 } = req.query;

  try {
    const data = await apiService.getSport(sportId, { limit });
    res.json({
      success: true,
      data: data.data || [],
      meta: data.meta || {},
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch sport data",
      message: error.message,
    });
  }
});

// Get all matches with filtering
app.get("/api/matches", async (req, res) => {
  const {
    page = 1,
    limit = 50,
    sport_id,
    sub_type_id = "1,186,340",
    sort_id = 1,
    period_id = -1,
    tab = "",
    esports = false,
  } = req.query;

  try {
    const data = await apiService.getMatches({
      page: parseInt(page),
      limit: parseInt(limit),
      sport_id,
      sub_type_id,
      sort_id: parseInt(sort_id),
      period_id: parseInt(period_id),
      tab,
      esports: esports === "true",
    });

    const transformedMatches = (data.data || []).map(transformMatch);

    res.json({
      success: true,
      data: transformedMatches,
      meta: data.meta || {},
      total: data.meta?.total || 0,
      page: parseInt(page),
      limit: parseInt(limit),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch matches",
      message: error.message,
    });
  }
});

// Get matches by sport
app.get("/api/matches/sport/:sportId", async (req, res) => {
  const { sportId } = req.params;
  const {
    page = 1,
    limit = 50,
    sub_type_id = "1,186,340",
    sort_id = 1,
    period_id = -1,
  } = req.query;

  try {
    const data = await apiService.getMatchesBySport(sportId, {
      page: parseInt(page),
      limit: parseInt(limit),
      sub_type_id,
      sort_id: parseInt(sort_id),
      period_id: parseInt(period_id),
    });

    const transformedMatches = (data.data || []).map(transformMatch);

    res.json({
      success: true,
      data: transformedMatches,
      meta: data.meta || {},
      total: data.meta?.total || 0,
      page: parseInt(page),
      limit: parseInt(limit),
      sportId: parseInt(sportId),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch matches for sport",
      message: error.message,
    });
  }
});

// Get match by ID
app.get("/api/matches/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Try to find in cache first
    let match = cache.matches.find((m) => m.match_id == id);

    if (match) {
      return res.json({
        success: true,
        source: "cache",
        data: transformMatch(match),
        timestamp: new Date().toISOString(),
      });
    }

    // If not in cache, fetch from API
    const data = await apiService.getMatch(id);

    if (!data || !data.meta) {
      return res.status(404).json({
        success: false,
        error: "Match not found",
        message: `No match found with ID: ${id}`,
      });
    }

    // Add to cache
    if (data.meta && data.meta.match_id) {
      const existingIndex = cache.matches.findIndex(
        (m) => m.match_id == data.meta.match_id,
      );
      const transformed = {
        match_id: data.meta.match_id,
        home_team: data.meta.home_team,
        away_team: data.meta.away_team,
        start_time: data.meta.start_time,
        competition_name: data.meta.competition_name,
        category: data.meta.category,
        sport_id: data.meta.sport_id,
        sport_name: data.meta.sport_name,
        parent_match_id: data.meta.parent_match_id,
        home_odd: data.meta.home_odd,
        neutral_odd: data.meta.neutral_odd,
        away_odd: data.meta.away_odd,
        match_status: data.meta.match_status,
        current_score: data.meta.current_score,
        match_time: data.meta.match_time,
        event_status: data.meta.event_status,
      };
      if (existingIndex !== -1) {
        cache.matches[existingIndex] = transformed;
      } else {
        cache.matches.push(transformed);
      }
    }

    const transformed = transformMatchDetail(data);

    res.json({
      success: true,
      source: "api",
      data: transformed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch match",
      message: error.message,
    });
  }
});

// Get match by parent match ID
app.get("/api/match/parent/:parentMatchId", async (req, res) => {
  const { parentMatchId } = req.params;

  try {
    const data = await apiService.getMatchByParentId(parentMatchId);

    if (!data || !data.meta) {
      return res.status(404).json({
        success: false,
        error: "Match not found",
        message: `No match found with parent ID: ${parentMatchId}`,
      });
    }

    const transformed = transformMatchDetail(data);

    res.json({
      success: true,
      data: transformed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch match",
      message: error.message,
    });
  }
});

// Get match details by Betika match ID
app.get("/api/match/:matchId", async (req, res) => {
  const { matchId } = req.params;

  try {
    const data = await apiService.getMatch(matchId);

    if (!data || !data.meta) {
      return res.status(404).json({
        success: false,
        error: "Match not found",
        message: `No match found with ID: ${matchId}`,
      });
    }

    const transformed = transformMatchDetail(data);

    res.json({
      success: true,
      data: transformed,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch match",
      message: error.message,
    });
  }
});

// Get jackpot events
app.get("/api/jackpot", async (req, res) => {
  try {
    const data = await apiService.getJackpotData();
    res.json({
      success: true,
      data: data || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch jackpot events",
      message: error.message,
    });
  }
});

app.get("/api/jackpot/:eventId", async (req, res) => {
  const { eventId } = req.params;

  try {
    const data = await apiService.getJackpotEvents(eventId);
    res.json({
      success: true,
      data: data || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch jackpot events",
      message: error.message,
    });
  }
});

// Get previous jackpots
app.get("/api/jackpot/previous", async (req, res) => {
  try {
    const data = await apiService.getPreviousJackpots();
    res.json({
      success: true,
      data: data || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch previous jackpots",
      message: error.message,
    });
  }
});

// Get boosted events
app.get("/api/jackpot/boosted", async (req, res) => {
  try {
    const data = await apiService.getBoostedEvents();
    res.json({
      success: true,
      data: data || [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch boosted events",
      message: error.message,
    });
  }
});

// Force refresh all data
app.get("/api/refresh", async (req, res) => {
  res.json({
    success: true,
    message: "Data refresh triggered",
    status: "refreshing",
    timestamp: new Date().toISOString(),
  });

  // Run in background
  setTimeout(async () => {
    await updateCache();
  }, 100);
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    status: "healthy",
    matchesCount: cache.matches.length,
    sportsCount: cache.sports.length,
    jackpotsCount: cache.jackpots.length,
    lastUpdate: cache.lastUpdate,
    lastJackpotUpdate: cache.lastJackpotUpdate,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage(),
    timestamp: new Date().toISOString(),
  });
});

// ============ LEGACY SUPPORT - Keep for backward compatibility ============
app.get("/api/betika-events", async (req, res) => {
  try {
    const { page = 1, limit = 2400, sport_id = 14 } = req.query;
    const data = await apiService.getMatches({
      page: parseInt(page),
      limit: parseInt(limit),
      sport_id,
    });
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// ============ START SERVER ============
async function startServer() {
  console.log("🚀 Starting Betika API Server v3.0...");
  console.log("=".repeat(50));

  // Initial cache load
  await updateCache();

  // Auto-refresh every 5 minutes
  setInterval(updateCache, 5 * 60 * 1000);
  setInterval(updateJackpotCache, 5 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`\n✅ Server running on http://localhost:${PORT}`);
    console.log("\n📡 Available endpoints:");
    console.log(
      `  GET  /                                    - API documentation`,
    );
    console.log(`  GET  /api/sports                          - Get all sports`);
    console.log(
      `  GET  /api/sport/:sportId                 - Get sport categories & competitions`,
    );
    console.log(
      `  GET  /api/matches                        - Get all matches with filters`,
    );
    console.log(`  GET  /api/matches/:id                    - Get match by ID`);
    console.log(
      `  GET  /api/match/:matchId                 - Get detailed match`,
    );
    console.log(
      `  GET  /api/match/parent/:parentMatchId   - Get match by parent ID`,
    );
    console.log(
      `  GET  /api/matches/sport/:sportId         - Get matches by sport`,
    );
    console.log(
      `  GET  /api/jackpot                        - Get jackpot events`,
    );
    console.log(
      `  GET  /api/jackpot/previous               - Get previous jackpots`,
    );
    console.log(
      `  GET  /api/jackpot/boosted                - Get boosted events`,
    );
    console.log(
      `  GET  /api/refresh                        - Force refresh data`,
    );
    console.log(`  GET  /api/health                         - Health check`);

    console.log("\n📝 Examples:");
    console.log(`  http://localhost:${PORT}/api/matches?limit=10&sport_id=14`);
    console.log(`  http://localhost:${PORT}/api/matches/11072625`);
    console.log(`  http://localhost:${PORT}/api/match/11072625`);
    console.log(`  http://localhost:${PORT}/api/sports`);
    console.log(`  http://localhost:${PORT}/api/sport/14`);
    console.log(`  http://localhost:${PORT}/api/jackpot`);

    console.log(
      `\n📊 Cache status: ${cache.matches.length} matches, ${cache.sports.length} sports loaded`,
    );
    console.log(`🔄 Auto-refresh every 5 minutes`);
  });
}

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down gracefully...");
  process.exit();
});

startServer().catch(console.error);
