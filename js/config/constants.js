// ── js/config/constants.js ──

const SUPABASE_URL = 'https://qoezxfuxzrtzexzzplfz.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_e99iPLwtmEpykURcsz63Xg_cEvzX5yR';
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// DATA
// ─────────────────────────────────────────────
const DEFAULT_PORTFOLIO = [];

const FX_FALLBACK = {USD:0.92,GBP:1.17,JPY:0.0062,CHF:1.02,CAD:0.68,AUD:0.60,EUR:1.0};
const PIE_COLORS = ["#4ade80","#60a5fa","#f59e0b","#f87171","#a78bfa","#34d399","#fb923c","#38bdf8","#e879f9","#94a3b8","#fbbf24","#6366f1"];
const TABS = ["📋 Cartera","🔔 Alertas","💰 Dividendos","📝 Transacciones","📊 Gráficos","🎯 Objetivos","📐 Valoración","🧾 Renta","🔭 Radar","🔬 Análisis 360"];
const CURRENCIES = ["EUR","USD","GBP","CHF","CAD","AUD","JPY"];
const SECTORS = ["Tecnología","Servicios Financieros","Salud","Consumo Cíclico","Consumo Defensivo","Energía","Materiales Básicos","Industria","Utilities","Inmobiliario","Comunicaciones"];
const API = {
  valuation: '/.netlify/functions/valuation',
  search: '/.netlify/functions/search',
  quote: '/.netlify/functions/quote'
};
const PROXIES = [
  t => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=1d&range=1d`)}`,
  t => `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=1d&range=1d`)}`,
  t => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://query2.finance.yahoo.com/v8/finance/chart/${t}?interval=1d&range=1d`)}`,
  t => `https://corsproxy.io/?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?interval=1d&range=1d`)}`,
];

const SEARCH_PROXIES = [
  q => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`)}`,
  q => `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`)}`,
  q => `https://corsproxy.io/?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=8&newsCount=0`)}`,
];

const YIELD_PROXIES = [
  t => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=2y&interval=1mo&events=div`)}`,
  t => `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=2y&interval=1mo&events=div`)}`,
  t => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://query2.finance.yahoo.com/v8/finance/chart/${t}?range=2y&interval=1mo&events=div`)}`,
  t => `https://corsproxy.io/?url=${encodeURIComponent(`https://query1.finance.yahoo.com/v8/finance/chart/${t}?range=2y&interval=1mo&events=div`)}`,
];

const MODULES = "incomeStatementHistory,cashflowStatementHistory,balanceSheetHistory,defaultKeyStatistics,financialData";

const TS_ANNUAL = [
  "annualTotalRevenue","annualOperatingIncome","annualNetIncome","annualEbitda",
  "annualGrossProfitMargin","annualOperatingIncomeMargin","annualNetIncomeMargin",
  "annualOperatingCashFlow","annualCapitalExpenditure","annualFreeCashFlow",
  "annualTotalDebt","annualCashAndCashEquivalents","annualReturnOnEquity","annualReturnOnAssets",
  "annualBasicEPS","annualDilutedEPS","annualInterestExpense"
].join(",");

const TS_PROXIES = [
  t => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${t}?type=${TS_ANNUAL}&period1=1420070400&period2=${Math.floor(Date.now()/1000)}`)}`,
  t => `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${t}?type=${TS_ANNUAL}&period1=1420070400&period2=${Math.floor(Date.now()/1000)}`)}`,
  t => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${t}?type=${TS_ANNUAL}&period1=1420070400&period2=${Math.floor(Date.now()/1000)}`)}`,
  t => `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${t}?type=${TS_ANNUAL}&period1=1420070400&period2=${Math.floor(Date.now()/1000)}`)}`,
  // Proxy adicional de respaldo: los CORS proxies gratuitos se caen o se
  // saturan con frecuencia, así que cuantos más se prueben en cadena, más
  // probable es que alguno esté vivo en un momento dado.
  t => `https://corsproxy.io/?url=${encodeURIComponent(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${t}?type=${TS_ANNUAL}&period1=1420070400&period2=${Math.floor(Date.now()/1000)}`)}`,
  t => `https://corsproxy.io/?url=${encodeURIComponent(`https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${t}?type=${TS_ANNUAL}&period1=1420070400&period2=${Math.floor(Date.now()/1000)}`)}`,
];

const QS_PROXIES = [
  t => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${t}?modules=${MODULES}`)}`,
  t => `https://api.allorigins.win/raw?url=${encodeURIComponent(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${t}?modules=${MODULES}`)}`,
  t => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(`https://query2.finance.yahoo.com/v11/finance/quoteSummary/${t}?modules=${MODULES}`)}`,
  t => `https://corsproxy.io/?url=${encodeURIComponent(`https://query2.finance.yahoo.com/v10/finance/quoteSummary/${t}?modules=${MODULES}`)}`,
];
const FUND_PROXIES = QS_PROXIES;

const RADAR_SECTORS = ["Todos","Tecnología","Consumo Defensivo","Consumo Cíclico","Salud","Financiero","Servicios Financieros","Energía","Utilities","Industria","Materiales Básicos","Inmobiliario","Comunicaciones","Otros"];
const RADAR_REGIONS = ["Todos","España","Europa","EE.UU.","Reino Unido","Asia","Global"];
const RADAR_CURRENCIES = ["Todas","EUR","USD","GBP","CAD","AUD","JPY"];

const RADAR_TICKERS = {
  "España": [
    "SAN.MC","BBVA.MC","ITX.MC","IBE.MC","REP.MC","TEF.MC","ACS.MC","FER.MC",
    "ANA.MC","MAP.MC","ENG.MC","RED.MC","NTGY.MC","ACX.MC","GRF.MC","CIE.MC",
    "LOG.MC","MCM.MC","EBRO.MC","VIS.MC","TRE.MC","CAF.MC","AMS.MC","ELE.MC",
    "MEL.MC","PHM.MC","CLNX.MC","SAB.MC","BKT.MC","MRL.MC","COL.MC","SOL.MC",
    "IAG.MC","ALM.MC","NXT.MC","AENA.MC","ENC.MC","TL5.MC","A3M.MC","FDR.MC",
    "IDR.MC","ROVI.MC","UNI.MC","FAE.MC","BAMI.MC","GCO.MC","LOG.MC","PRS.MC"
  ],
  "EE.UU.": [
    "AAPL","MSFT","GOOGL","AMZN","META","NVDA","BRK-B","LLY","V","JPM",
    "UNH","XOM","JNJ","MA","PG","AVGO","HD","CVX","MRK","ABBV",
    "KO","PEP","WMT","BAC","MCD","COST","CSCO","ACN","TMO","ABT",
    "PFE","CRM","LIN","DHR","VZ","TXN","CMCSA","NFLX","PM","T",
    "RTX","HON","UPS","LOW","BMY","UNP","NEE","QCOM","AMGN","GE",
    "CAT","DE","MMM","GS","MS","BLK","SPGI","AXP","ISRG","MDT",
    "WPC","O","MAIN","MO","BTI","KHC","CVS","WBA","ENB","TRP",
    "BEN","TROW","NWN","UVV","VFC","EMR","ETN","FDX","NSC","ROST",
    "ADP","ADM","AFL","ALL","APD","AON","BDX","CB","CINF","CL",
    "CTAS","DOV","ECL","ED","ES","ESS","EXPD","FRT","GD","GPC",
    "HRL","ITW","JKHY","KMB","LEG","LOW","MKC","NDSN","NUE","PPG",
    "PNR","SHW","SJM","SWK","SYY","WMT","WST","XEL","ATO","AWK",
    "BKH","BRO","CHD","CHRW","CTSH","D","DUK","EIX","EOG","EQR",
    "EXC","FE","IBM","ICE","INTC","IP","IPG","IRM","K","KMI",
    "KO","LMT","MDLZ","MMC","MOS","NKE","NOC","OKE","ORCL","PAYX",
    "PSA","REG","SBUX","SO","STT","SYK","TGT","TROW","TXT","USB",
    "VLO","VTR","WEC","WELL","WM","WY","XOM","YUM","ZTS"
  ],
  "Reino Unido": [
    "SHEL.L","AZN.L","ULVR.L","HSBA.L","BP.L","DGE.L","RIO.L","GSK.L",
    "BATS.L","REL.L","NG.L","LSEG.L","LLOY.L","NWG.L","BARC.L","AAL.L",
    "CPG.L","PSON.L","IMB.L","LAND.L","SGE.L","EXPN.L","WTB.L","SGRO.L",
    "VOD.L","BT-A.L","STAN.L","PRU.L","ABF.L","CRH.L","FLTR.L","SMIN.L",
    "RTO.L","BNZL.L","AHT.L","SPX.L","ANTO.L","GLEN.L","EZJ.L","IAG.L",
    "III.L","JD.L","MNG.L","NXT.L","PSN.L","RMV.L","RKT.L","SBRY.L",
    "SVT.L","TSCO.L","UU.L","WPP.L","ITRK.L","HLMA.L","HL.L","BME.L"
  ],
  "Europa": [
    "ASML.AS","MC.PA","LVMH.PA","SAP.DE","SIE.DE","ALV.DE","BAS.DE","BMW.DE",
    "DTE.DE","MUV2.DE","RWE.DE","VOW3.DE","MBG.DE","ADS.DE","DBK.DE","HNR1.DE",
    "AIR.PA","BNP.PA","SAN.PA","OR.PA","CS.PA","RI.PA","SGO.PA","CAP.PA",
    "RACE.MI","ENI.MI","ISP.MI","UCG.MI","TRN.MI","MB.MI","ENEL.MI","ATL.MI",
    "PHIA.AS","INGA.AS","REN.AS","HEIA.AS","AD.AS","UNA.AS","ABN.AS",
    "IFX.DE","HEN3.DE","FRE.DE","EOAN.DE","BAYN.DE","CON.DE","DHL.DE","DPW.DE",
    "SU.PA","DG.PA","BN.PA","VIE.PA","KER.PA","EL.PA","STLAM.MI","PIRC.MI",
    "NOVN.SW","ROG.SW","NESN.SW","ZURN.SW","UBSG.SW","ABBN.SW","GIVN.SW",
    "EQNR.OL","NOVO-B.CO","MAERSK-B.CO","VWS.CO","ORSTED.CO"
  ],
  "Asia": [
    "7203.T","9984.T","6861.T","6758.T","8306.T","9432.T","7974.T","6954.T",
    "700.HK","9988.HK","3690.HK","1299.HK","941.HK","2318.HK","1398.HK",
    "005930.KS","000660.KS","051910.KS","035420.KS","207940.KS",
    "6501.T","6098.T","8035.T","9433.T","4063.T","4502.T","6178.T","8058.T",
    "0005.HK","0388.HK","1810.HK","2020.HK","0016.HK","1928.HK",
    "005380.KS","035720.KS","012330.KS","066570.KS"
  ],
  "Global": []
};
RADAR_TICKERS["Global"] = [
  ...RADAR_TICKERS["España"],
  ...RADAR_TICKERS["EE.UU."],
  ...RADAR_TICKERS["Reino Unido"],
  ...RADAR_TICKERS["Europa"],
  ...RADAR_TICKERS["Asia"],
];

const TICKER_SECTOR = {
  "SAN.MC":"Financiero","BBVA.MC":"Financiero","SAB.MC":"Financiero","BKT.MC":"Financiero",
  "ITX.MC":"Consumo Cíclico","MEL.MC":"Consumo Cíclico","IAG.MC":"Industria",
  "IBE.MC":"Utilities","ENG.MC":"Utilities","RED.MC":"Utilities","NTGY.MC":"Utilities","ELE.MC":"Utilities",
  "REP.MC":"Energía","TEF.MC":"Comunicaciones","A3M.MC":"Comunicaciones","TL5.MC":"Comunicaciones",
  "ACS.MC":"Industria","FER.MC":"Industria","ANA.MC":"Industria","TRE.MC":"Industria","CAF.MC":"Industria",
  "MAP.MC":"Financiero","AMS.MC":"Tecnología","GRF.MC":"Salud","PHM.MC":"Salud",
  "ACX.MC":"Materiales Básicos","EBRO.MC":"Consumo Defensivo","MCM.MC":"Consumo Defensivo",
  "VIS.MC":"Consumo Defensivo","LOG.MC":"Industria","CIE.MC":"Consumo Cíclico",
  "CLNX.MC":"Comunicaciones","MRL.MC":"Inmobiliario","AENA.MC":"Industria","ALM.MC":"Industria",
  "SOL.MC":"Utilities","ENC.MC":"Energía","NXT.MC":"Tecnología","COL.MC":"Consumo Cíclico",
  "AAPL":"Tecnología","MSFT":"Tecnología","GOOGL":"Comunicaciones","META":"Comunicaciones",
  "NVDA":"Tecnología","CSCO":"Tecnología","CRM":"Tecnología","TXN":"Tecnología","AVGO":"Tecnología",
  "AMZN":"Consumo Cíclico","HD":"Consumo Cíclico","MCD":"Consumo Cíclico","LOW":"Consumo Cíclico",
  "KO":"Consumo Defensivo","PEP":"Consumo Defensivo","WMT":"Consumo Defensivo","COST":"Consumo Defensivo",
  "PM":"Consumo Defensivo","MO":"Consumo Defensivo","BTI":"Consumo Defensivo","KHC":"Consumo Defensivo",
  "JNJ":"Salud","PFE":"Salud","MRK":"Salud","ABBV":"Salud","LLY":"Salud","TMO":"Salud","DHR":"Salud",
  "ABT":"Salud","BMY":"Salud","MDT":"Salud","AMGN":"Salud","ISRG":"Salud","UNH":"Salud","CVS":"Salud",
  "JPM":"Financiero","BAC":"Financiero","GS":"Financiero","MS":"Financiero","BLK":"Financiero",
  "BRK-B":"Financiero","AXP":"Financiero","V":"Financiero","MA":"Financiero","SPGI":"Financiero",
  "TROW":"Financiero","BEN":"Financiero","WPC":"Inmobiliario","O":"Inmobiliario","MAIN":"Financiero",
  "XOM":"Energía","CVX":"Energía","ENB":"Energía","TRP":"Energía",
  "NEE":"Utilities","D":"Utilities","SO":"Utilities","DUK":"Utilities","NWN":"Utilities",
  "CAT":"Industria","DE":"Industria","GE":"Industria","HON":"Industria","RTX":"Industria",
  "UPS":"Industria","FDX":"Industria","UNP":"Industria","NSC":"Industria","ETN":"Industria","EMR":"Industria",
  "LIN":"Materiales Básicos","PG":"Consumo Defensivo","UVV":"Consumo Defensivo",
  "VZ":"Comunicaciones","T":"Comunicaciones","CMCSA":"Comunicaciones","NFLX":"Comunicaciones",
  "SHEL.L":"Energía","BP.L":"Energía","RIO.L":"Materiales Básicos","AAL.L":"Materiales Básicos",
  "AZN.L":"Salud","GSK.L":"Salud","ULVR.L":"Consumo Defensivo","DGE.L":"Consumo Defensivo",
  "IMB.L":"Consumo Defensivo","BATS.L":"Consumo Defensivo","HSBA.L":"Financiero",
  "LLOY.L":"Financiero","BARC.L":"Financiero","NWG.L":"Financiero","LSEG.L":"Financiero",
  "REL.L":"Comunicaciones","PSON.L":"Comunicaciones","NG.L":"Utilities",
  "CPG.L":"Consumo Cíclico","SGE.L":"Tecnología","EXPN.L":"Tecnología",
  "ASML.AS":"Tecnología","SAP.DE":"Tecnología","PHIA.AS":"Salud",
  "SIE.DE":"Industria","ALV.DE":"Financiero","BAS.DE":"Materiales Básicos",
  "BMW.DE":"Consumo Cíclico","VOW3.DE":"Consumo Cíclico","MBG.DE":"Consumo Cíclico",
  "MC.PA":"Consumo Cíclico","OR.PA":"Consumo Defensivo","AIR.PA":"Industria",
  "BNP.PA":"Financiero","SAN.PA":"Financiero","ADS.DE":"Consumo Cíclico",
  "ENI.MI":"Energía","ENEL.MI":"Utilities","INGA.AS":"Financiero",
  "HEIA.AS":"Consumo Defensivo","UNA.AS":"Consumo Defensivo",
};
