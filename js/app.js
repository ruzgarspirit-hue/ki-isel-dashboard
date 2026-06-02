import store from "./store.js";

// ---------- Yardımcılar ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const tl = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const fmtMoney = (n) => tl.format(Number(n) || 0);
const todayStr = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD (yerel)
const monthKey = (d) => d.slice(0, 7); // "YYYY-MM"
const fmtDate = (s) => {
  if (!s) return "";
  const [y, m, d] = s.split("-");
  return `${d}.${m}.${y}`;
};

const CATEGORIES = {
  income: ["Ofis maaş", "Hakem ücreti", "Kar payı", "Ek gelir"],
  expense: [
    "YKB kredi kartı",
    "Garanti kredi kartı",
    "Selim ev kira",
    "Tuba ev kira",
    "Tuba ev aidat",
    "Samsara kredi kartı",
    "Samsara ajanslar",
    "Selim maaş",
    "Selim ev aidat",
    "Kredi ödemesi",
    "Kooperatif ödemesi",
    "Tuba Rüzgar spor",
    "Rüzgar özel ders",
    "Selim spor",
    "Diğer",
  ],
};

// ---------- Durum ----------
let txCache = [];
let taskCache = [];
let eventCache = [];
let calDate = new Date();          // takvimde görüntülenen ay
let selectedDay = todayStr();      // takvimde seçili gün

// ============================================================
//  Başlangıç
// ============================================================
(async function start() {
  applyTheme(localStorage.getItem("kd_theme") || "dark");
  await store.init();

  if (store.needsLogin()) {
    showAuth();
  } else {
    await showApp();
  }
  wireAuth();
  wireTheme();
})();

// ============================================================
//  Giriş (Auth)
// ============================================================
function showAuth() {
  $("#auth-screen").classList.remove("hidden");
  $("#app").classList.add("hidden");
}

function wireAuth() {
  $("#auth-signin").addEventListener("click", () => doAuth("in"));
  $("#auth-signup").addEventListener("click", () => doAuth("up"));
  $("#auth-pass").addEventListener("keydown", (e) => { if (e.key === "Enter") doAuth("in"); });
}

async function doAuth(mode) {
  const email = $("#auth-email").value.trim();
  const pass = $("#auth-pass").value;
  const err = $("#auth-error");
  err.textContent = "";
  if (!email || !pass) { err.textContent = "E-posta ve parola gerekli."; return; }
  if (pass.length < 6) { err.textContent = "Şifre en az 6 karakter olmalı."; return; }
  try {
    if (mode === "in") {
      await store.auth.signIn(email, pass);
    } else {
      const data = await store.auth.signUp(email, pass);
      if (!data.session) { // e-posta doğrulama açık: önce maildeki linke tıklanmalı
        err.textContent = "Hesap oluşturuldu. E-postanıza gelen doğrulama linkine tıklayıp giriş yapın.";
        return;
      }
    }
    $("#auth-screen").classList.add("hidden");
    await showApp();
  } catch (e) {
    err.textContent = e.message || "Giriş başarısız.";
  }
}

// ============================================================
//  Uygulama yükleme
// ============================================================
async function showApp() {
  $("#app").classList.remove("hidden");
  wireNav();
  wireTransactions();
  wireTasks();
  wireCalendar();
  wireSettings();
  initFormDefaults();
  await refreshAll();
  navTo("ozet");
}

async function refreshAll() {
  [txCache, taskCache, eventCache] = await Promise.all([
    store.transactions.list(),
    store.tasks.list(),
    store.events.list(),
  ]);
  renderSummary();
  renderTxList();
  renderTasks();
  renderCalendar();
  renderDayDetail();
  renderSettings();
}

// ============================================================
//  Navigasyon
// ============================================================
function wireNav() {
  $$(".nav-btn").forEach((b) => b.addEventListener("click", () => navTo(b.dataset.go)));
}
function navTo(view) {
  $$(".view").forEach((v) => v.classList.toggle("hidden", v.dataset.view !== view));
  $$(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.go === view));
}

// ============================================================
//  Tema
// ============================================================
function wireTheme() {
  $("#theme-toggle").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    applyTheme(next);
    localStorage.setItem("kd_theme", next);
  });
}
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  const btn = $("#theme-toggle");
  if (btn) btn.textContent = t === "light" ? "☀️" : "🌙";
}

// ============================================================
//  Form varsayılanları
// ============================================================
function initFormDefaults() {
  $("#tx-date").value = todayStr();
  $("#tx-month").value = monthKey(todayStr());
  fillCategories("expense");
  $$('input[name="tx-type"]').forEach((r) =>
    r.addEventListener("change", () => fillCategories(r.value))
  );
}
function fillCategories(type) {
  const sel = $("#tx-category");
  sel.innerHTML = CATEGORIES[type].map((c) => `<option value="${c}">${c}</option>`).join("");
}

// ============================================================
//  Gelir / Gider
// ============================================================
function wireTransactions() {
  $("#tx-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const type = $('input[name="tx-type"]:checked').value;
    const amount = parseFloat($("#tx-amount").value);
    if (!(amount > 0)) return;
    const row = {
      type,
      amount,
      description: $("#tx-desc").value.trim() || $("#tx-category").value,
      category: $("#tx-category").value,
      date: $("#tx-date").value || todayStr(),
    };
    await store.transactions.add(row);
    $("#tx-amount").value = "";
    $("#tx-desc").value = "";
    await refreshAll();
  });
  $("#tx-month").addEventListener("change", renderTxList);
}

function renderSummary() {
  const mk = monthKey(todayStr());
  const month = txCache.filter((t) => monthKey(t.date) === mk);
  const inc = month.filter((t) => t.type === "income").reduce((s, t) => s + +t.amount, 0);
  const exp = month.filter((t) => t.type === "expense").reduce((s, t) => s + +t.amount, 0);
  $("#sum-income").textContent = fmtMoney(inc);
  $("#sum-expense").textContent = fmtMoney(exp);
  $("#sum-net").textContent = fmtMoney(inc - exp);

  const totalNet = txCache.reduce((s, t) => s + (t.type === "income" ? +t.amount : -+t.amount), 0);
  $("#balance-pill").textContent = fmtMoney(totalNet);

  // Son hareketler
  $("#recent-tx").innerHTML = txCache.slice(0, 5).map(txItemHTML).join("") || emptyHTML("Henüz hareket yok.");
  bindDeletes("#recent-tx", store.transactions);

  // Bugünün işleri
  const today = todayStr();
  const due = taskCache.filter((t) => !t.done && t.due_date === today);
  $("#today-tasks").innerHTML = due.map(taskItemHTML).join("") || emptyHTML("Bugün için iş yok.");
  bindTaskEvents("#today-tasks");
}

function renderTxList() {
  const mk = $("#tx-month").value || monthKey(todayStr());
  const rows = txCache.filter((t) => monthKey(t.date) === mk);
  $("#tx-list").innerHTML = rows.map(txItemHTML).join("") || emptyHTML("Bu ay hareket yok.");
  bindDeletes("#tx-list", store.transactions);
}

function txItemHTML(t) {
  const sign = t.type === "income" ? "+" : "−";
  return `<li class="tx-item" data-id="${t.id}">
    <div class="tx-icon ${t.type}">${t.type === "income" ? "▲" : "▼"}</div>
    <div class="tx-main">
      <div class="tx-desc">${esc(t.description || t.category)}</div>
      <div class="tx-sub">${esc(t.category)} · ${fmtDate(t.date)}</div>
    </div>
    <div class="tx-amount ${t.type}">${sign}${fmtMoney(t.amount)}</div>
    <button class="del-btn" data-del title="Sil">×</button>
  </li>`;
}

// ============================================================
//  İşler (Görevler)
// ============================================================
function wireTasks() {
  $("#task-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $("#task-title").value.trim();
    if (!title) return;
    await store.tasks.add({ title, done: false, due_date: $("#task-due").value || null });
    $("#task-title").value = "";
    $("#task-due").value = "";
    await refreshAll();
  });
  $("#show-done").addEventListener("change", renderTasks);
}

function renderTasks() {
  const showDone = $("#show-done").checked;
  const rows = taskCache
    .filter((t) => showDone || !t.done)
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  $("#task-list").innerHTML = rows.map(taskItemHTML).join("") || emptyHTML("İş yok. 🎉");
  bindTaskEvents("#task-list");
}

function taskItemHTML(t) {
  const overdue = t.due_date && !t.done && t.due_date < todayStr();
  return `<li class="task-item ${t.done ? "done" : ""}" data-id="${t.id}">
    <button class="task-check" data-toggle>✓</button>
    <div class="task-main">
      <div class="task-title">${esc(t.title)}</div>
      ${t.due_date ? `<div class="task-due ${overdue ? "overdue" : ""}">📅 ${fmtDate(t.due_date)}</div>` : ""}
    </div>
    <button class="del-btn" data-del title="Sil">×</button>
  </li>`;
}

function bindTaskEvents(scope) {
  $$(`${scope} [data-toggle]`).forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.closest("[data-id]").dataset.id;
      const t = taskCache.find((x) => x.id === id);
      await store.tasks.update(id, { done: !t.done });
      await refreshAll();
    })
  );
  bindDeletes(scope, store.tasks);
}

// ============================================================
//  Takvim
// ============================================================
function wireCalendar() {
  $("#cal-prev").addEventListener("click", () => { calDate.setMonth(calDate.getMonth() - 1); renderCalendar(); });
  $("#cal-next").addEventListener("click", () => { calDate.setMonth(calDate.getMonth() + 1); renderCalendar(); });
  $("#event-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = $("#event-title").value.trim();
    if (!title) return;
    await store.events.add({ title, date: selectedDay });
    $("#event-title").value = "";
    await refreshAll();
  });
}

function renderCalendar() {
  const y = calDate.getFullYear();
  const m = calDate.getMonth();
  const monthNames = ["Ocak","Şubat","Mart","Nisan","Mayıs","Haziran","Temmuz","Ağustos","Eylül","Ekim","Kasım","Aralık"];
  $("#cal-title").textContent = `${monthNames[m]} ${y}`;

  const first = new Date(y, m, 1);
  const startPad = (first.getDay() + 6) % 7; // Pazartesi başlangıç
  const daysInMonth = new Date(y, m + 1, 0).getDate();

  let cells = "";
  for (let i = 0; i < startPad; i++) cells += `<div class="cal-cell empty-cell"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const dots = dayDots(ds);
    cells += `<div class="cal-cell ${ds === todayStr() ? "today" : ""} ${ds === selectedDay ? "selected" : ""}" data-day="${ds}">
      <span class="cal-num">${d}</span>
      <span class="cal-dots">${dots}</span>
    </div>`;
  }
  $("#cal-grid").innerHTML = cells;
  $$("#cal-grid .cal-cell[data-day]").forEach((c) =>
    c.addEventListener("click", () => { selectedDay = c.dataset.day; renderCalendar(); renderDayDetail(); })
  );
}

function dayDots(ds) {
  let out = "";
  if (txCache.some((t) => t.date === ds && t.type === "income")) out += `<span class="dot income"></span>`;
  if (txCache.some((t) => t.date === ds && t.type === "expense")) out += `<span class="dot expense"></span>`;
  if (eventCache.some((e) => e.date === ds)) out += `<span class="dot event"></span>`;
  if (taskCache.some((t) => t.due_date === ds && !t.done)) out += `<span class="dot task"></span>`;
  return out;
}

function renderDayDetail() {
  $("#day-title").textContent = fmtDate(selectedDay);
  const tx = txCache.filter((t) => t.date === selectedDay);
  const ev = eventCache.filter((e) => e.date === selectedDay);
  const tk = taskCache.filter((t) => t.due_date === selectedDay);

  let html = "";
  ev.forEach((e) => {
    html += `<li class="tx-item" data-id="${e.id}">
      <div class="tx-icon" style="background:rgba(99,102,241,.15)">📌</div>
      <div class="tx-main"><div class="tx-desc">${esc(e.title)}</div><div class="tx-sub">Etkinlik / Not</div></div>
      <button class="del-btn" data-del title="Sil">×</button>
    </li>`;
  });
  tk.forEach((t) => {
    html += `<li class="tx-item">
      <div class="tx-icon" style="background:rgba(56,189,248,.15)">✅</div>
      <div class="tx-main"><div class="tx-desc">${esc(t.title)}</div><div class="tx-sub">İş ${t.done ? "(bitti)" : ""}</div></div>
    </li>`;
  });
  tx.forEach((t) => { html += txItemHTML(t); });
  $("#day-detail").innerHTML = html || emptyHTML("Bu gün için kayıt yok.");
  // Etkinlik silme
  bindDeletes("#day-detail", store.events);
}

// ============================================================
//  Ayarlar
// ============================================================
function wireSettings() {
  $("#logout-btn").addEventListener("click", async () => {
    await store.auth.signOut();
    location.reload();
  });
  $("#export-btn").addEventListener("click", async () => {
    const data = await store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `panelim-yedek-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

function renderSettings() {
  const cloud = store.isCloud();
  $("#sync-mode").textContent = cloud ? "Bulut (senkron)" : "Yerel (bu cihaz)";
  const user = store.getUser();
  $("#user-email").textContent = user?.email || "—";
  $("#logout-btn").classList.toggle("hidden", !cloud);
  $("#local-note").textContent = cloud
    ? "Verileriniz bulutta saklanıyor ve tüm cihazlarınızda senkron."
    : "Senkron için js/config.js içine Supabase bilgilerinizi girin (KURULUM.md).";
}

// ============================================================
//  Ortak
// ============================================================
function bindDeletes(scope, table) {
  $$(`${scope} [data-del]`).forEach((btn) =>
    btn.addEventListener("click", async () => {
      const id = btn.closest("[data-id]").dataset.id;
      await table.remove(id);
      await refreshAll();
    })
  );
}
const emptyHTML = (msg) => `<li class="empty">${msg}</li>`;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- Service worker (PWA) ----------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
