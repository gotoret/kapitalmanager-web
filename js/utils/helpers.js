// ── js/utils/helpers.js ──

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
const getFX = (cur) => state.fxCache[cur] || FX_FALLBACK[cur] || 1;

const isGBpTicker = (ticker) => String(ticker || "").toUpperCase().endsWith(".L");

const toEUR = (v, cur) => (v || 0) * getFX(cur || "EUR");

const toEURhist = (v, pos) => {
  if (!pos || pos.currency === "EUR") return v || 0;
  if (pos.fx_rate && pos.fx_rate !== 1) return (v || 0) / pos.fx_rate;
  return (v || 0) * getFX(pos.currency);
};

const posToEUR = (v, pos) => {
  if (!v || isNaN(v)) return 0;
  return (v || 0) * getFX(pos?.currency || "EUR");
};

const priceToEUR = (v, pos) => {
  if (!v || isNaN(v)) return 0;
  return (v || 0) * getFX(pos?.currency || "EUR");
};

const posValEUR = (p) => {
  const cp = state.priceCache[p.ticker];
  return cp ? priceToEUR(p.shares * cp, p) : posToEUR(p.shares * p.avg_cost, p);
};

const posInvEUR = (p) => posToEUR(p.shares * p.avg_cost, p);
const fmtEUR = v => {
  if (state.privacyMode) return "€ •••••";
  return "€"+((v||0).toLocaleString("es-ES",{minimumFractionDigits:2,maximumFractionDigits:2}));
};
const fmtPct = v => (v>=0?"+":"")+((v||0).toFixed(2))+"%";
const esc = s => String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const pnlColor = v => v>=0?"#16a34a":"#dc2626";
const sleep = ms => new Promise(r=>setTimeout(r,ms));
