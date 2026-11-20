import { supabase } from "./supabase-config.js";

let currentUser = null;
let currentSpinCoins = 0;
let currentRewardBalance = 0;
let coinsPerRupee = 5;

const spinCoinBalance = document.getElementById("spinCoinBalance");
const rewardBalance = document.getElementById("rewardBalance");

const convertForm = document.getElementById("convertForm");
const convertCoins = document.getElementById("convertCoins");
const conversionPreview = document.getElementById("conversionPreview");
const convertBtn = document.getElementById("convertBtn");
const convertMessage = document.getElementById("convertMessage");

const payoutForm = document.getElementById("payoutForm");
const payoutAmount = document.getElementById("payoutAmount");
const upiId = document.getElementById("upiId");
const payoutSubmitBtn = document.getElementById("payoutSubmitBtn");
const payoutMessage = document.getElementById("payoutMessage");

const payoutHistory = document.getElementById("payoutHistory");

function showMessage(element, message, success = false) {
  if (!element) return;
  element.textContent = message;
  element.style.color = success ? "#5ee0a0" : "#ffd36a";
}

function formatRupees(amount) {
  return "₹" + Number(amount || 0).toFixed(2);
}

function formatCoins(amount) {
  return Number(amount || 0).toLocaleString("en-IN") + " Coins";
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function setLoading(button, loading, originalText) {
  if (!button) return;
  button.disabled = loading;
  button.textContent = loading ? "Please wait..." : originalText;
}

async function checkLogin() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data?.session) {
    location.href = "index.html";
    return false;
  }
  currentUser = data.session.user;
  return true;
}

async function loadConversionRate() {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "coins_per_rupee")
    .maybeSingle();

  if (data?.value && Number(data.value) >= 1) {
    coinsPerRupee = Number(data.value);
    if (convertCoins) {
      convertCoins.min = coinsPerRupee;
      convertCoins.step = coinsPerRupee;
      convertCoins.placeholder = `Example: ${coinsPerRupee * 20}`;
    }
    const rateBanner = document.querySelector(".conversion-rate");
    if (rateBanner) {
      rateBanner.textContent = `${coinsPerRupee} Spin Coins = ₹1`;
    }
  }
}

async function loadSpinCoins() {
  spinCoinBalance.textContent = "Loading...";
  const { data, error } = await supabase
    .from("player_wallets")
    .select("balance")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    spinCoinBalance.textContent = "Unavailable";
    return;
  }

  currentSpinCoins = Number(data?.balance || 0);
  spinCoinBalance.textContent = formatCoins(currentSpinCoins);
}

async function loadRewardBalance() {
  rewardBalance.textContent = "Loading...";
  const { data, error } = await supabase
    .from("reward_balances")
    .select("balance")
    .eq("user_id", currentUser.id)
    .maybeSingle();

  if (error) {
    rewardBalance.textContent = "Unavailable";
    return;
  }

  currentRewardBalance = Number(data?.balance || 0);
  rewardBalance.textContent = formatRupees(currentRewardBalance);
}

function updateConversionPreview() {
  const coins = Number(convertCoins.value);
  if (!Number.isSafeInteger(coins) || coins < coinsPerRupee || coins % coinsPerRupee !== 0) {
    conversionPreview.value = "₹0.00";
    return;
  }
  conversionPreview.value = formatRupees(coins / coinsPerRupee);
}

convertCoins.addEventListener("input", updateConversionPreview);

convertForm.addEventListener("submit", async event => {
  event.preventDefault();
  showMessage(convertMessage, "");

  const coins = Number(convertCoins.value);

  if (!Number.isSafeInteger(coins) || coins < coinsPerRupee) {
    showMessage(convertMessage, `कम से कम ${coinsPerRupee} Spin Coins डालें।`);
    return;
  }

  if (coins % coinsPerRupee !== 0) {
    showMessage(convertMessage, `Conversion के लिए Coins ${coinsPerRupee} के गुणक में होने चाहिए।`);
    return;
  }

  if (coins > currentSpinCoins) {
    showMessage(convertMessage, "आपके पास पर्याप्त Spin Coins नहीं हैं।");
    return;
  }

  setLoading(convertBtn, true, "Convert Coins to Rupees");

  try {
    const { data, error } = await supabase.rpc("convert_spin_coins", { p_coins: coins });
    if (error) throw error;

    const convertedRupees = data ?? (coins / coinsPerRupee);
    convertForm.reset();
    conversionPreview.value = "₹0.00";

    showMessage(
      convertMessage,
      `${coins} Spin Coins सफलतापूर्वक Convert हुए। आपको ${formatRupees(convertedRupees)} मिले।`,
      true
    );

    await Promise.all([loadSpinCoins(), loadRewardBalance()]);
  } catch (error) {
    showMessage(convertMessage, error.message || "Conversion नहीं हुआ।");
  } finally {
    setLoading(convertBtn, false, "Convert Coins to Rupees");
  }
});

payoutForm.addEventListener("submit", async event => {
  event.preventDefault();
  showMessage(payoutMessage, "");

  const amount = Number(payoutAmount.value);
  const upi = upiId.value.trim();
  const upiPattern = /^[A-Za-z0-9._-]+@[A-Za-z0-9.-]+$/;

  if (!Number.isFinite(amount) || amount < 1) {
    showMessage(payoutMessage, "कम से कम ₹1 का सही Payout Amount डालें।");
    return;
  }

  if (amount > currentRewardBalance) {
    showMessage(payoutMessage, "Payment Wallet में पर्याप्त बैलेंस नहीं है।");
    return;
  }

  if (!upiPattern.test(upi)) {
    showMessage(payoutMessage, "सही UPI ID डालें। उदाहरण: name@upi");
    return;
  }

  setLoading(payoutSubmitBtn, true, "Request UPI Payout");

  try {
    const { data, error } = await supabase.rpc("request_payout", {
      p_amount: amount,
      p_upi_id: upi
    });

    if (error) throw error;

    payoutForm.reset();
    showMessage(
      payoutMessage,
      `Payout Request Submit हो गई। Request ID: ${data ?? ""}`,
      true
    );

    await Promise.all([loadRewardBalance(), loadPayoutHistory()]);
  } catch (error) {
    showMessage(payoutMessage, error.message || "Payout Request Submit नहीं हुई।");
  } finally {
    setLoading(payoutSubmitBtn, false, "Request UPI Payout");
  }
});

async function loadPayoutHistory() {
  payoutHistory.innerHTML = '<div class="empty">Loading payout history...</div>';

  const { data, error } = await supabase
    .from("payout_requests")
    .select("id,amount,upi_id,status,created_at")
    .eq("user_id", currentUser.id)
    .order("created_at", { ascending: false });

  if (error) {
    payoutHistory.innerHTML = '<div class="empty">Payout history load नहीं हुई।</div>';
    return;
  }

  if (!data || data.length === 0) {
    payoutHistory.innerHTML = '<div class="empty">अभी कोई Payout Request नहीं है।</div>';
    return;
  }

  payoutHistory.innerHTML = data.map(item => {
    const statusClass = escapeHTML(String(item.status || "").toLowerCase());
    return `
      <div class="history-item">
        <p><strong>Request #${escapeHTML(item.id)}</strong></p>
        <p>Amount: ${formatRupees(item.amount)}</p>
        <p>UPI ID: ${escapeHTML(item.upi_id)}</p>
        <p>Status: <span class="status ${statusClass}">${escapeHTML(item.status)}</span></p>
        <p>Date: ${new Date(item.created_at).toLocaleString("en-IN")}</p>
      </div>
    `;
  }).join("");
}

async function initializePaymentPage() {
  try {
    const loggedIn = await checkLogin();
    if (!loggedIn) return;

    await Promise.all([
      loadConversionRate(),
      loadSpinCoins(),
      loadRewardBalance(),
      loadPayoutHistory()
    ]);
  } catch (error) {
    showMessage(payoutMessage, error.message || "Payment Page Load नहीं हुआ।");
  }
}

initializePaymentPage();