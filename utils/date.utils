// ── js/utils/date.utils.js ──
// Helper seguro para obtener año de una fecha
function safeGetYear(dateVal) {
  if (!dateVal) return null;
  let d;
  if (dateVal instanceof Date) {
    d = dateVal;
  } else if (typeof dateVal === 'string') {
    d = new Date(dateVal);
  } else if (typeof dateVal === 'number') {
    d = new Date(dateVal);
  } else if (dateVal && typeof dateVal === 'object' && dateVal._d) {
    d = new Date(dateVal._d);
  } else {
    return null;
  }
  if (isNaN(d.getTime())) return null;
  return d.getFullYear();
}

// Helper seguro para obtener fecha ISO
// Compara dos fechas sea cual sea su formato (string, Date, timestamp) — a
// diferencia de comparar con .localeCompare(), que solo funciona si ambas
// son strings y rompe con "X.localeCompare is not a function" en cuanto
// alguna es un objeto Date real.
function compareDates(a, b) {
  const da = a instanceof Date ? a.getTime() : new Date(a || 0).getTime();
  const db = b instanceof Date ? b.getTime() : new Date(b || 0).getTime();
  return (isNaN(da)?0:da) - (isNaN(db)?0:db);
}

function safeDateStr(dateVal) {
  if (!dateVal) return new Date().toISOString().slice(0, 10);
  let d;
  if (dateVal instanceof Date) {
    d = dateVal;
  } else if (typeof dateVal === 'string') {
    d = new Date(dateVal);
  } else if (typeof dateVal === 'number') {
    d = new Date(dateVal);
  } else if (dateVal && typeof dateVal === 'object' && dateVal._d) {
    d = new Date(dateVal._d);
  } else {
    return String(dateVal).slice(0, 10);
  }
  if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

// Normaliza TODAS las fechas de dividendos y transacciones a objetos Date
// reales. localStorage/JSON nunca guarda objetos Date (siempre strings), así
// que sin esto cualquier código que asuma d.date.getFullYear() rompe justo
// al arrancar la app, antes incluso de que loadCloudData() tenga ocasión de
// sincronizar — este era el origen real del error "x.date.getFullYear is not
// a function" que seguía apareciendo pese a arreglos anteriores en otros
// puntos concretos del código.
function normalizeAllDates() {
  const toDate = (v) => {
    if (v instanceof Date) return isNaN(v.getTime()) ? new Date() : v;
    if (typeof v === "string" || typeof v === "number") {
      const d = new Date(v);
      return isNaN(d.getTime()) ? new Date() : d;
    }
    return new Date();
  };
  state.dividends = (state.dividends || []).map(d => ({ ...d, date: toDate(d.date) }));
  state.transactions = (state.transactions || []).map(t => ({ ...t, date: toDate(t.date) }));
}
