import store from "./store.js";

// ---------- Yardımcılar ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const tl = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" });
const fmtMoney = (n) => tl.format(Number(n) || 0);
const todayStr = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD (yerel)
const nowTime = () => new Date().toTimeString().slice(0, 5);    // "HH:MM" (yerel)
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
let mealCache = [];
let exCache = [];
let profileCache = null;
let pendingMeal = null;            // analiz edilip kaydı bekleyen öğün
let calDate = new Date();          // takvimde görüntülenen ay
let selectedDay = todayStr();      // takvimde seçili gün

// Egzersiz MET değerleri (kcal = MET × kilo × saat)
const ACTIVITIES = [
  { name: "Yürüyüş (tempolu)", met: 5.0 },
  { name: "Yürüyüş (normal)", met: 3.5 },
  { name: "Koşu", met: 9.8 },
  { name: "Bisiklet", met: 7.5 },
  { name: "Yüzme", met: 7.0 },
  { name: "Ağırlık antrenmanı", met: 5.0 },
  { name: "HIIT", met: 8.0 },
  { name: "Yoga", met: 2.5 },
  { name: "Pilates", met: 3.0 },
  { name: "Futbol", met: 7.0 },
  { name: "Basketbol", met: 8.0 },
  { name: "Tenis", met: 7.3 },
  { name: "İp atlama", met: 12.0 },
  { name: "Eliptik / kondisyon", met: 5.0 },
  { name: "Yürüyüş bandı", met: 4.3 },
  { name: "Merdiven çıkma", met: 8.0 },
  { name: "Dans", met: 5.0 },
  { name: "Ev işi", met: 3.0 },
];

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
  wireHealth();
  initFormDefaults();
  await refreshAll();
  navTo("ozet");
}

async function refreshAll() {
  // allSettled: bir tablo (örn. yeni eklenenler) henüz yoksa uygulama çökmesin.
  const safe = (p, fb) => p.then((v) => v ?? fb).catch(() => fb);
  [txCache, taskCache, eventCache, mealCache, exCache, profileCache] = await Promise.all([
    safe(store.transactions.list(), []),
    safe(store.tasks.list(), []),
    safe(store.events.list(), []),
    safe(store.meals.list(), []),
    safe(store.exercises.list(), []),
    safe(store.profile.get(), null),
  ]);
  renderSummary();
  renderTxList();
  renderTasks();
  renderCalendar();
  renderDayDetail();
  renderHealth();
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
  $("#archive-toggle").addEventListener("click", () => {
    const list = $("#done-list");
    const open = !list.hidden;
    list.hidden = open;
    $("#archive-caret").textContent = open ? "▸" : "▾";
  });
}

function renderTasks() {
  // Aktif liste: yalnızca yapılacaklar (bitenler buraya gelmez)
  const active = taskCache
    .filter((t) => !t.done)
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"));
  $("#task-list").innerHTML = active.map(taskItemHTML).join("") || emptyHTML("Aktif iş yok. 🎉");
  bindTaskEvents("#task-list");

  // Arşiv: tamamlananlar (kayıt korunur). ✓ ile geri al, × ile kalıcı sil.
  const done = taskCache
    .filter((t) => t.done)
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  $("#done-count").textContent = done.length;
  $("#done-list").innerHTML = done.map(taskItemHTML).join("") || emptyHTML("Tamamlanan iş yok.");
  bindTaskEvents("#done-list");
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
//  Sağlık (Yemek + Egzersiz + günlük kalori)
// ============================================================
function wireHealth() {
  // Alt sekmeler
  $$(".subtab").forEach((b) =>
    b.addEventListener("click", () => {
      $$(".subtab").forEach((x) => x.classList.toggle("active", x === b));
      $$("[data-sub-view]").forEach((v) => (v.hidden = v.dataset.subView !== b.dataset.sub));
    })
  );

  // Kilo kaydet (Ayarlar)
  $("#weight-save").addEventListener("click", async () => {
    const w = parseFloat($("#profile-weight").value);
    if (!(w > 0)) return;
    await store.profile.setWeight(w);
    await refreshAll();
  });

  // Egzersiz ekle
  $("#ex-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const act = ACTIVITIES.find((a) => a.name === $("#ex-activity").value);
    const min = parseInt($("#ex-minutes").value, 10);
    if (!act || !(min > 0)) return;
    const weight = profileCache?.weight;
    if (!weight) { alert("Önce Ayarlar'dan kilonuzu girin."); return; }
    const kcal = Math.round(act.met * weight * (min / 60));
    await store.exercises.add({ activity: act.name, minutes: min, kcal, date: todayStr(), time: $("#ex-time").value || nowTime() });
    $("#ex-minutes").value = "";
    await refreshAll();
  });

  // Elle girişte AI ile kalori hesapla (metinden)
  $("#mm-calc").addEventListener("click", async () => {
    const text = $("#mm-name").value.trim();
    const status = $("#mm-status");
    if (!text) { status.textContent = "Önce ne yediğinizi yazın."; return; }
    const btn = $("#mm-calc");
    btn.disabled = true;
    status.textContent = "Hesaplanıyor… ⏳";
    try {
      const res = await fetch("/.netlify/functions/analyze-meal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Hesaplanamadı.");
      $("#mm-kcal").value = Math.round(data.total_kcal) || 0;
      const parts = (data.items || []).map((it) => `${it.name}: ${Math.round(it.kcal) || 0}`).join(" · ");
      status.textContent = `≈ ${Math.round(data.total_kcal) || 0} kcal${parts ? " (" + parts + ")" : ""} — rakamı düzeltebilirsiniz`;
    } catch (err) {
      status.textContent = err.message + (location.hostname === "localhost" ? " (kalori hesabı yalnızca canlı sitede çalışır)" : "");
    } finally {
      btn.disabled = false;
    }
  });

  // Elle yemek ekle (fotoğrafsız)
  $("#meal-manual-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = $("#mm-name").value.trim();
    const kcal = parseInt($("#mm-kcal").value, 10);
    if (!name || !(kcal >= 0)) return;
    await store.meals.add({ name, kcal, items: [], date: todayStr(), time: $("#mm-time").value || nowTime() });
    $("#mm-name").value = "";
    $("#mm-kcal").value = "";
    $("#mm-status").textContent = "";
    await refreshAll();
  });

  // Yemek fotoğrafı
  $("#meal-capture").addEventListener("click", () => $("#meal-photo").click());
  $("#meal-photo").addEventListener("change", onMealPhoto);
  $("#meal-cancel").addEventListener("click", resetMealForm);
  $("#meal-save").addEventListener("click", async () => {
    const name = $("#meal-name").value.trim() || "Öğün";
    const kcal = parseInt($("#meal-kcal").value, 10) || 0;
    await store.meals.add({ name, kcal, items: pendingMeal?.items || [], date: todayStr(), time: $("#meal-time").value || nowTime() });
    resetMealForm();
    await refreshAll();
  });
}

async function onMealPhoto(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  $("#meal-error").textContent = "";
  $("#meal-result").classList.add("hidden");
  $("#meal-analyzing").classList.remove("hidden");
  try {
    const { dataUrl, base64 } = await downscaleImage(file, 1024, 0.8);
    const res = await fetch("/.netlify/functions/analyze-meal", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ image: base64, media_type: "image/jpeg" }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Analiz başarısız.");
    pendingMeal = data;
    $("#meal-preview").src = dataUrl;
    $("#meal-items").innerHTML = (data.items || []).map((it) =>
      `<li class="tx-item"><div class="tx-main"><div class="tx-desc">${esc(it.name)}</div>
        <div class="tx-sub">${esc(it.portion || "")}</div></div>
        <div class="tx-amount">${Math.round(it.kcal) || 0} kcal</div></li>`
    ).join("") || emptyHTML("Yemek tanınamadı.");
    $("#meal-kcal").value = Math.round(data.total_kcal) || 0;
    $("#meal-time").value = nowTime();
    $("#meal-name").value = "";
    $("#meal-conf").textContent = `Güven: ${data.confidence || "?"}${data.note ? " · " + data.note : ""} · Rakamı düzeltebilirsiniz.`;
    $("#meal-result").classList.remove("hidden");
  } catch (err) {
    $("#meal-error").textContent = err.message + (location.hostname === "localhost" ? " (Fotoğraf analizi yalnızca canlı sitede çalışır.)" : "");
  } finally {
    $("#meal-analyzing").classList.add("hidden");
    e.target.value = ""; // aynı dosya tekrar seçilebilsin
  }
}

function resetMealForm() {
  pendingMeal = null;
  $("#meal-result").classList.add("hidden");
  $("#meal-error").textContent = "";
  $("#meal-items").innerHTML = "";
  $("#meal-kcal").value = "";
  $("#meal-name").value = "";
}

// Görseli küçült (Netlify yük sınırı + hız). data URL ve base64 (önek olmadan) döndürür.
function downscaleImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > height && width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; }
      else if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; }
      const canvas = document.createElement("canvas");
      canvas.width = width; canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL("image/jpeg", quality);
      resolve({ dataUrl, base64: dataUrl.split(",")[1] });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Görsel okunamadı.")); };
    img.src = url;
  });
}

function renderHealth() {
  // Egzersiz aktivite listesi
  const sel = $("#ex-activity");
  if (sel && !sel.options.length) {
    sel.innerHTML = ACTIVITIES.map((a) => `<option value="${a.name}">${a.name}</option>`).join("");
  }
  // Saat alanları varsayılanı (boşsa şu anki saat)
  ["#mm-time", "#ex-time"].forEach((s) => { const el = $(s); if (el && !el.value) el.value = nowTime(); });
  // Kilo
  if (profileCache?.weight) $("#profile-weight").value = profileCache.weight;
  $("#ex-weight-note").textContent = profileCache?.weight
    ? `Kilonuz: ${profileCache.weight} kg (Ayarlar'dan değiştirebilirsiniz).`
    : "⚠️ Kalori hesabı için önce Ayarlar'dan kilonuzu girin.";

  const today = todayStr();
  const byTime = (a, b) => (a.time || "").localeCompare(b.time || "");
  const meals = mealCache.filter((m) => m.date === today).sort(byTime);
  const exs = exCache.filter((x) => x.date === today).sort(byTime);
  const kIn = meals.reduce((s, m) => s + (+m.kcal || 0), 0);
  const kOut = exs.reduce((s, x) => s + (+x.kcal || 0), 0);
  $("#kcal-in").textContent = `${kIn} kcal`;
  $("#kcal-out").textContent = `${kOut} kcal`;
  $("#kcal-net").textContent = `${kIn - kOut} kcal`;

  $("#meal-list").innerHTML = meals.map((m) =>
    `<li class="tx-item" data-id="${m.id}">
      <div class="tx-icon" style="background:rgba(34,197,94,.15)">🍽️</div>
      <div class="tx-main"><div class="tx-desc">${esc(m.name)}</div>
        <div class="tx-sub">${m.time ? "🕒 " + esc(m.time) + " · " : ""}${(m.items || []).length} öğe</div></div>
      <div class="tx-amount">${+m.kcal || 0} kcal</div>
      <button class="del-btn" data-del title="Sil">×</button>
    </li>`
  ).join("") || emptyHTML("Bugün öğün eklenmedi.");
  bindDeletes("#meal-list", store.meals);

  $("#ex-list").innerHTML = exs.map((x) =>
    `<li class="tx-item" data-id="${x.id}">
      <div class="tx-icon" style="background:rgba(56,189,248,.15)">🏃</div>
      <div class="tx-main"><div class="tx-desc">${esc(x.activity)}</div>
        <div class="tx-sub">${x.time ? "🕒 " + esc(x.time) + " · " : ""}${x.minutes} dk</div></div>
      <div class="tx-amount expense">−${+x.kcal || 0} kcal</div>
      <button class="del-btn" data-del title="Sil">×</button>
    </li>`
  ).join("") || emptyHTML("Bugün egzersiz eklenmedi.");
  bindDeletes("#ex-list", store.exercises);
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
