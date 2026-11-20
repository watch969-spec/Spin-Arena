import { supabase } from "./supabase-config.js";

const DAILY_SPIN_LIMIT = 5;
const $ = (id) => document.getElementById(id);
$("year").textContent = new Date().getFullYear();
let mode = "login", spinning = false, currentRotation = 0;

$("loginTab").addEventListener("click", () => setMode("login"));
$("signupTab").addEventListener("click", () => setMode("signup"));

function setMode(next) {
  mode = next;
  $("loginTab").classList.toggle("active", mode === "login");
  $("signupTab").classList.toggle("active", mode === "signup");
  $("authSubmit").textContent = mode === "login" ? "Login" : "Create account";
  $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
  $("authMessage").textContent = "";
}

$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("email").value.trim(), password = $("password").value;
  $("authSubmit").disabled = true;
  $("authMessage").textContent = "Please wait…";
  try {
    const result = mode === "signup"
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) throw result.error;
    if (mode === "signup" && !result.data.session) {
      $("authMessage").textContent = "Account created. Check your email to confirm, then log in.";
    } else {
      $("authMessage").textContent = "Signed in.";
      await refreshApp();
    }
  } catch (error) {
    $("authMessage").textContent = error.message;
  } finally {
    $("authSubmit").disabled = false;
  }
});

$("logoutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  showGuest();
});

$("spinBtn").addEventListener("click", spin);

function showGuest() {
  $("authPanel").classList.remove("hidden");
  $("gamePanel").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
  $("userLabel").textContent = "Guest";
}

async function refreshApp() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return showGuest();
  $("authPanel").classList.add("hidden");
  $("gamePanel").classList.remove("hidden");
  $("logoutBtn").classList.add("hidden");
  $("userLabel").textContent = session.user.email;
  await loadWalletAndHistory(session.user.id);
}

async function loadWalletAndHistory(userId) {
  const { data: wallet, error } = await supabase
    .from("player_wallets")
    .select("balance,extra_spins")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    $("spinMessage").textContent = error.message;
    return;
  }
  $("balance").textContent = Number(wallet?.balance || 0).toLocaleString("en-IN");
  const extraSpins = Number(wallet?.extra_spins || 0);

  const { data: spins, error: historyError } = await supabase
    .from("spin_history")
    .select("reward,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(8);

  if (historyError) {
    $("spinMessage").textContent = historyError.message;
    return;
  }

  $("history").innerHTML = spins.length
    ? spins.map(s => `<div class="history-item"><span>${new Date(s.created_at).toLocaleString()}</span><b>+${s.reward} coins</b></div>`).join("")
    : '<p class="muted">No spins yet.</p>';

  const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: usedSpins, error: countError } = await supabase
    .from("spin_history")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", cutoff24h);

  if (countError) {
    $("spinMessage").textContent = countError.message;
    return;
  }

  const remainingFree = Math.max(0, DAILY_SPIN_LIMIT - (usedSpins || 0));
  const totalAvailable = remainingFree + extraSpins;
  const canSpin = totalAvailable > 0;

  $("spinBtn").disabled = !canSpin || spinning;
  $("spinBtn").textContent = canSpin
    ? `🎡 SPIN NOW (${totalAvailable} left)`
    : "0 Spins Left";
  $("cooldown").textContent = canSpin
    ? `Free spins left: ${remainingFree} · Extra spins: ${extraSpins}`
    : `All spins used. Visit the Payment page to buy extra spins or wait 24 hours.`;
}

async function spin() {
  if (spinning) return;
  spinning = true;
  $("spinBtn").disabled = true;
  $("spinMessage").textContent = "The wheel is spinning…";

  try {
    const { data, error } = await supabase.rpc("spin_once_v2");
    if (error) throw error;

    const reward = Number(data.reward);
    const segment = Number(data.segment); // 0 से 7 का इंडेक्स
    
    const totalSegments = 8;
    const degreesPerSegment = 360 / totalSegments; // 45 डिग्री प्रति सेगमेंट
    
    // व्हील की हर स्लाइस के सेंटर पर पॉइंटर को सटीक रोकने का फॉर्मूला
    const segmentCenterAngle = (segment * degreesPerSegment) + (degreesPerSegment / 2);
    const targetDegree = 360 - segmentCenterAngle;
    
    const fullSpins = 360 * 8; // 8 पूरे चक्कर तेजी से घूमेगा
    const currentMod = currentRotation % 360;
    const addDegree = (targetDegree - currentMod + 360) % 360;
    
    currentRotation += fullSpins + addDegree;
    $("wheel").style.transform = `rotate(${currentRotation}deg)`;

    await new Promise(resolve => setTimeout(resolve, 4700));
    $("spinMessage").textContent = `Congratulations! You earned ${reward} Spin Coins.`;
  } catch (error) {
    $("spinMessage").textContent = error.message;
  } finally {
    spinning = false;
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await loadWalletAndHistory(session.user.id);
  }
}
supabase.auth.onAuthStateChange((_event, _session) => {
  setTimeout(refreshApp, 0);
});

refreshApp();