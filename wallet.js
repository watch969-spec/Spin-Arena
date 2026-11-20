import { supabase } from "./supabase-config.js";

const $ = id => document.getElementById(id);
$("year").textContent = new Date().getFullYear();

async function init() {
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    location.href = "./index.html";
    return;
  }

  const user = data.session.user;
  $("userLabel").textContent = user.email;

  const { data: wallet, error: wErr } = await supabase
    .from("player_wallets")
    .select("balance")
    .eq("user_id", user.id)
    .maybeSingle();

  if (wErr) { $("walletMessage").textContent = wErr.message; return; }

  $("coinBalance").textContent =
    Number(wallet?.balance || 0).toLocaleString("en-IN");

  const { data: history, error: hErr } = await supabase
    .from("spin_history")
    .select("reward,created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (hErr) { $("walletMessage").textContent = hErr.message; return; }

  const total = history.reduce((s, i) => s + Number(i.reward), 0);
  $("totalEarned").textContent = total.toLocaleString("en-IN");
  $("totalSpins").textContent = history.length;

  $("spinHistory").innerHTML = history.length
    ? history.map(item => `
      <div class="history-item">
        <span>${new Date(item.created_at).toLocaleString()}</span>
        <b>+${Number(item.reward)} coins</b>
      </div>
    `).join("")
    : '<p class="muted">No spins yet. Play your first spin!</p>';
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "SIGNED_OUT" || !session) location.href = "./index.html";
});

init();