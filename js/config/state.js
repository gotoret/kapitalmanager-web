// ── js/config/state.js ──

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
let _uid = Date.now();
const uid = () => ++_uid;
const ls = {
  get:(k,d)=>{try{const v=localStorage.getItem(k);return v!==null?JSON.parse(v):d;}catch(e){return d;}},
  set:(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}}
};

let state = {
  positions: ls.get("km_positions", DEFAULT_PORTFOLIO),
  alerts: ls.get("km_alerts", []),
  dividends: ls.get("km_dividends", []),
  dividendCashUsed: ls.get("km_dividend_cash_used", []),
  goalConfig: ls.get("km_goal_config", { goal: 100000, pg: 7, dg: 3, contrib: 5000, yrs: 10, dy: 4, reinvest: true }),
  autoRegisterEnabled: ls.get("km_auto_register_dividends", true),
  transactions: ls.get("km_transactions", []),
  priceCache: ls.get("km_priceCache", {}),
  priceChangeCache: ls.get("km_priceChangeCache", {}),
  fxCache: ls.get("km_fxCache", {}),
  yieldCache: ls.get("km_yieldCache", {}),
  divInfo: [],
  activeTab: 0,
  sortCol: null,
  sortDir: 1,
  selectedTicker: null,
  countdown: 60,
  lastUpdate: null,
  livePrices: false,
  authUser: null,
  authUserId: null,
  _appStarted: false,
  fmpKey: ls.get("km_fmp_key", ""),
  privacyMode: ls.get("km_privacy_mode", false),
  darkMode: ls.get("km_dark_mode", false),
  analysis360: null,
  finnhubKey: ls.get("km_finnhub_key", ""),
  twelveDataKey: ls.get("km_twelvedata_key", ""),
  alphaVantageKey: ls.get("km_alphavantage_key", ""),
  marketstackKey: ls.get("km_marketstack_key", ""),
  fcsapiKey: ls.get("km_fcsapi_key", ""),
  importPreview: [],
  importMap: null,
  importHeaders: [],
  importFileName: "",
  _divYearSel: "Anual",
  _divSort: { col: "fecha", dir: "desc" },
  _divEsperadosSort: { col: "ticker", dir: "asc" },
  _divEsperadosCollapsed: false,
  _divHistorialCollapsed: false,
  _divChartTab: 0,
};
