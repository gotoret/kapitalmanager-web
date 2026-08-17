/**
 * Punto de entrada principal de la aplicación
 * Orquesta la inicialización de todos los módulos
 */

import { init } from './app.js';

// Iniciar la aplicación cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    init();
});

// Exponer funciones y variables globales necesarias para onclick en HTML
// Esto es necesario porque los eventos onclick en el HTML llaman a funciones globales
import * as app from './app.js';
import * as auth from './services/auth.service.js';
import * as supabase from './services/supabase.service.js';
import * as yahoo from './services/yahoo.service.js';
import * as fmp from './services/fmp.service.js';
import * as finnhub from './services/finnhub.service.js';
import * as helpers from './utils/helpers.js';
import * as dom from './utils/dom.utils.js';
import * as importUtils from './utils/import.utils.js';
import * as chartUtils from './utils/chart.utils.js';
import * as state from './config/state.js';
import * as header from './components/header.js';
import * as tabs from './components/tabs.js';
import * as portfolio from './components/portfolio.js';
import * as alerts from './components/alerts.js';
import * as dividends from './components/dividends.js';
import * as transactions from './components/transactions.js';
import * as charts from './components/charts.js';
import * as goals from './components/goals.js';
import * as valuation from './components/valuation.js';
import * as renta from './components/renta.js';
import * as radar from './components/radar.js';
import * as analysis360 from './components/analysis360.js';

// Exponer al objeto window para uso en HTML
window.init = init;
window.doLogin = auth.doLogin;
window.doRegister = auth.doRegister;
window.doLogout = auth.doLogout;
window.doLoginGoogle = auth.doLoginGoogle;
window.refreshPrices = yahoo.refreshPrices;
window.openPriceSourcesModal = yahoo.openPriceSourcesModal;
window.togglePrivacyMode = header.togglePrivacyMode;
window.toggleDarkMode = header.toggleDarkMode;
window.acceptDisclaimer = app.acceptDisclaimer;
window.closeOnboarding = app.closeOnboarding;
window.closeModal = dom.closeModal;
window.openModal = dom.openModal;
window.openAddPos = portfolio.openAddPos;
window.saveNewPos = portfolio.saveNewPos;
window.openEditPos = portfolio.openEditPos;
window.deletePosition = portfolio.deletePosition;
window.openAddAlert = alerts.openAddAlert;
window.saveAlertModal = alerts.saveAlertModal;
window.deleteAlert = alerts.deleteAlert;
window.openAddDividend = dividends.openAddDividend;
window.editDividend = dividends.editDividend;
window.deleteDividend = dividends.deleteDividend;
window.exportDividendsCsv = dividends.exportDividendsCsv;
window.importDividendsCsv = dividends.importDividendsCsv;
window.toggleAutoRegisterDividends = dividends.toggleAutoRegisterDividends;
window.openDividendCashModal = dividends.openDividendCashModal;
window.openRegisterDividendCashUse = dividends.openRegisterDividendCashUse;
window.deleteDividendCashUse = dividends.deleteDividendCashUse;
window.saveDividendCashUse = dividends.saveDividendCashUse;
window.openImportBroker = importUtils.openImportBroker;
window.parseImportFile = importUtils.parseImportFile;
window.confirmImportBroker = importUtils.confirmImportBroker;
window.rebuildImportPreview = importUtils.rebuildImportPreview;
window.exportCarteraExcel = portfolio.exportCarteraExcel;
window.openSnapshotCartera = portfolio.openSnapshotCartera;
window.openTWRModal = portfolio.openTWRModal;
window.switchTab = tabs.switchTab;
window.renderActiveTab = app.renderActiveTab;
window.renderHeader = header.renderHeader;
window.selectTicker = portfolio.selectTicker;
window.sortPortfolio = portfolio.sortPortfolio;
window.deleteCartera = portfolio.deleteCartera;
window.calcProjection = goals.calcProjection;
window.saveGoalConfig = goals.saveGoalConfig;
window.analyzeValuation = valuation.analyzeValuation;
window.setValTab = valuation.setValTab;
window.saveFmpKey = valuation.saveFmpKey;
window.createValAlert = valuation.createValAlert;
window.saveValAlert = valuation.saveValAlert;
window.exportRentaExcel = renta.exportRentaExcel;
window.toggleDivEsperados = dividends.toggleDivEsperados;
window.toggleDivHistorial = dividends.toggleDivHistorial;
window.sortDivTable = dividends.sortDivTable;
window.sortDivEsperados = dividends.sortDivEsperados;
window.setDivChartTab = dividends.setDivChartTab;
window.selectDivYear = dividends.selectDivYear;
window.selectDivCalendarYear = dividends.selectDivCalendarYear;
window.openDivCalendarMonth = dividends.openDivCalendarMonth;
window.txSort = transactions.txSort;
window.openAddTxManual = transactions.openAddTxManual;
window.openEditTransaction = transactions.openEditTransaction;
window.deleteTransaction = transactions.deleteTransaction;
window.onChartsSelectorChange = charts.onChartsSelectorChange;
window.selectChartRange = charts.selectChartRange;
window.runRadarSearch = radar.runRadarSearch;
window.setRadarFilter = radar.setRadarFilter;
window.saveRadarPreset = radar.saveRadarPreset;
window.loadRadarPreset = radar.loadRadarPreset;
window.deleteRadarPreset = radar.deleteRadarPreset;
window.analyzeTicker360 = analysis360.analyzeTicker360;
window.printAnalysis360 = analysis360.printAnalysis360;
window.divChartTip = dom.divChartTip;
window.divChartTipHide = dom.divChartTipHide;
window.multiChartMouseMove = chartUtils.multiChartMouseMove;
window.multiChartMouseLeave = chartUtils.multiChartMouseLeave;
window.donutSegmentHover = chartUtils.donutSegmentHover;
window.donutMouseLeave = chartUtils.donutMouseLeave;
window.updateDivShares = dividends.updateDivShares;
window.updateDivTotal = dividends.updateDivTotal;
window.saveDividendModal = dividends.saveDividendModal;
window.openEditPos = portfolio.openEditPos;
window.saveEditPos = portfolio.saveEditPos;
window.toggleMethodInfo = valuation.toggleMethodInfo;