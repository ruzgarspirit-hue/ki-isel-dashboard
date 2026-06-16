import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

// Veri katmanı: Supabase ayarlıysa buluttan, değilse tarayıcıdan (localStorage) çalışır.

let sb = null;
let cloud = false;
let currentUser = null;

async function init() {
  if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    cloud = true;
    const { data } = await sb.auth.getSession();
    currentUser = data?.session?.user ?? null;
    sb.auth.onAuthStateChange((_e, session) => {
      currentUser = session?.user ?? null;
    });
  }
}

const isCloud = () => cloud;
const getUser = () => currentUser;
const needsLogin = () => cloud && !currentUser;

// ---- Auth ----
const auth = {
  async signUp(email, password) {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) throw error;
    currentUser = data.user ?? null;
    return data;
  },
  async signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    currentUser = data.user ?? null;
    return data;
  },
  async signOut() {
    await sb.auth.signOut();
    currentUser = null;
  },
};

// ---- localStorage yardımcıları ----
const lsKey = (table) => `kd_${table}`;
const lsRead = (table) => {
  try { return JSON.parse(localStorage.getItem(lsKey(table))) || []; }
  catch { return []; }
};
const lsWrite = (table, rows) => localStorage.setItem(lsKey(table), JSON.stringify(rows));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

// ---- Genel CRUD (her tablo için aynı arayüz) ----
function makeTable(table) {
  return {
    async list() {
      if (cloud) {
        const { data, error } = await sb.from(table).select("*").order("created_at", { ascending: false });
        if (error) throw error;
        return data;
      }
      return lsRead(table).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    },
    async add(obj) {
      if (cloud) {
        const row = { ...obj, user_id: currentUser.id };
        const { data, error } = await sb.from(table).insert(row).select().single();
        if (error) throw error;
        return data;
      }
      const row = { ...obj, id: uid(), created_at: new Date().toISOString() };
      const rows = lsRead(table);
      rows.push(row);
      lsWrite(table, rows);
      return row;
    },
    async update(id, patch) {
      if (cloud) {
        const { data, error } = await sb.from(table).update(patch).eq("id", id).select().single();
        if (error) throw error;
        return data;
      }
      const rows = lsRead(table);
      const i = rows.findIndex((r) => r.id === id);
      if (i >= 0) { rows[i] = { ...rows[i], ...patch }; lsWrite(table, rows); return rows[i]; }
      return null;
    },
    async remove(id) {
      if (cloud) {
        const { error } = await sb.from(table).delete().eq("id", id);
        if (error) throw error;
        return;
      }
      lsWrite(table, lsRead(table).filter((r) => r.id !== id));
    },
  };
}

const transactions = makeTable("transactions");
const tasks = makeTable("tasks");
const events = makeTable("events");
const meals = makeTable("meals");
const exercises = makeTable("exercises");

// Profil (tek satır: kilo). Bulutta upsert, yerelde localStorage.
const profile = {
  async get() {
    if (cloud) {
      const { data, error } = await sb.from("profiles").select("*").eq("user_id", currentUser.id).maybeSingle();
      if (error) throw error;
      return data;
    }
    try { return JSON.parse(localStorage.getItem("kd_profile")) || null; } catch { return null; }
  },
  async setWeight(weight) {
    if (cloud) {
      const { data, error } = await sb.from("profiles")
        .upsert({ user_id: currentUser.id, weight }, { onConflict: "user_id" })
        .select().single();
      if (error) throw error;
      return data;
    }
    const p = { weight };
    localStorage.setItem("kd_profile", JSON.stringify(p));
    return p;
  },
};

// Tüm veriyi dışa aktar (yedek)
async function exportAll() {
  return {
    transactions: await transactions.list(),
    tasks: await tasks.list(),
    events: await events.list(),
    meals: await meals.list(),
    exercises: await exercises.list(),
    profile: await profile.get(),
    exportedAt: new Date().toISOString(),
  };
}

export default { init, isCloud, getUser, needsLogin, auth, transactions, tasks, events, meals, exercises, profile, exportAll };
