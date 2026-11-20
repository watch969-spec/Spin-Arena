import { supabase } from "./supabase-config.js";

const $ = id => document.getElementById(id);

$("year").textContent = new Date().getFullYear();

let adminUser = null;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function message(text) {
  $("adminMessage").textContent = text;
}

function dateText(value) {
  return value ? new Date(value).toLocaleString("en-IN") : "-";
}

function parseId(rawId) {
  return /^\d+$/.test(String(rawId)) ? Number(rawId) : String(rawId);
}

async function init() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;

    if (!data?.session) {
      location.href = "./index.html";
      return;
    }

    const { data: refreshed, error: refreshError } =
      await supabase.auth.refreshSession();

    if (refreshError || !refreshed.session) {
      await supabase.auth.signOut();
      location.href = "./index.html";
      return;
    }

    adminUser = refreshed.session.user;
    $("adminEmail").textContent = adminUser.email || "Admin";

    // Verify admin membership
    const { data: adminRecord, error: adminError } = await supabase
      .from("reward_admins")
      .select("user_id")
      .eq("user_id", adminUser.id)
      .maybeSingle();

    if (adminError) throw adminError;

    if (!adminRecord) {
      message("Access denied: this account is not an Admin.");
      $("adminContent").classList.add("hidden");
      $("adminLogout").style.display = "inline-block";
      return;
    }

    $("adminContent").classList.remove("hidden");
    message("Admin access verified.");

    await loadDashboard();

  } catch (error) {
    message("Error: " + error.message);
  }
}

async function loadDashboard() {
  await Promise.all([
    loadConversionRate(),
    loadExtraSpinSettings(),
    loadPayouts(),
    loadUsers()
  ]);
}


// =====================================
// 1. EDIT CONVERSION RATE & SETTINGS
// =====================================

async function loadConversionRate() {
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "coins_per_rupee")
    .maybeSingle();

  if (!error && data?.value) {
    $("coinsPerRupee").value = Number(data.value);
  }
}

async function loadExtraSpinSettings() {
  const { data, error } = await supabase
    .from("app_settings")
    .select("key,value")
    .in("key", ["extra_spin_price", "extra_spin_count"]);

  if (!error && Array.isArray(data)) {
    data.forEach(item => {
      if (item.key === "extra_spin_price") $("extraSpinPrice").value = Number(item.value);
      if (item.key === "extra_spin_count") $("extraSpinCount").value = Number(item.value);
    });
  }
}

$("rateForm").addEventListener("submit", async event => {
  event.preventDefault();

  const rate = Number($("coinsPerRupee").value);
  if (!Number.isFinite(rate) || rate < 1) {
    message("Enter a valid conversion rate (minimum 1).");
    return;
  }

  const btn = $("saveRateBtn");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const { error } = await supabase.rpc("admin_update_conversion_rate", {
      p_coins_per_rupee: rate
    });

    if (error) throw error;
    message(`Conversion rate updated: ${rate} Spin Coins = ₹1.`);
  } catch (error) {
    message("Rate update error: " + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Rate";
  }
});

$("extraSpinForm").addEventListener("submit", async event => {
  event.preventDefault();

  const price = Number($("extraSpinPrice").value);
  const count = Number($("extraSpinCount").value);

  if (!Number.isFinite(price) || price < 1 || !Number.isFinite(count) || count < 1) {
    message("Enter valid numbers for extra spin package.");
    return;
  }

  const btn = $("saveExtraSpinBtn");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    // Upsert app settings for extra spins
    const { error } = await supabase.from("app_settings").upsert([
      { key: "extra_spin_price", value: price, updated_at: new Date() },
      { key: "extra_spin_count", value: count, updated_at: new Date() }
    ]);

    if (error) throw error;
    message(`Extra spin package updated: ${count} spins for ₹${price}.`);
  } catch (error) {
    message("Package update error: " + error.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save Package";
  }
});


// =====================================
// 2. PAYOUT REQUESTS + INLINE EDIT
// =====================================

async function loadPayouts() {
  const { data, error } = await supabase
    .from("payout_requests")
    .select("id,user_id,amount,upi_id,status,created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    $("payoutList").textContent = error.message;
    return;
  }

  const rows = Array.isArray(data) ? data : [];
  const pendingCount = rows.filter(item => item.status === "pending").length;

  $("payoutCount").textContent = rows.length;
  $("pendingPayoutCount").textContent = pendingCount;

  $("payoutList").innerHTML = rows.length
    ? rows.map(item => {
      const safeId = escapeHTML(item.id);
      return `
        <div class="history-item" style="display:block;padding:14px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">
          <h3>₹${Number(item.amount || 0).toFixed(2)}</h3>
          <p>UPI ID: <b>${escapeHTML(item.upi_id)}</b></p>
          <p class="small muted">
            Request #${safeId} · User ID: ${escapeHTML(item.user_id)}
          </p>
          <small class="muted">${dateText(item.created_at)}</small>
          <p><b>Status: ${escapeHTML(item.status)}</b></p>

          <div class="btn-row">
            ${item.status === "pending" ? `
              <button class="primary payout-action"
                data-id="${safeId}" data-paid="true">
                Mark Paid
              </button>
              <button class="secondary payout-action"
                data-id="${safeId}" data-paid="false">
                Reject
              </button>
            ` : ""}
            <button class="ghost toggle-payout-edit" data-id="${safeId}">
              Edit
            </button>
          </div>

          <!-- INLINE PAYOUT EDITOR -->
          <div class="edit-box hidden" id="payout-edit-${safeId}">
            <div class="edit-row">
              <div>
                <label>UPI ID</label>
                <input type="text" class="edit-upi" value="${escapeHTML(item.upi_id)}">
              </div>
              <div>
                <label>Amount (₹)</label>
                <input type="number" step="0.01" min="0.01" class="edit-amount" value="${Number(item.amount || 0)}">
              </div>
              <div>
                <label>Status</label>
                <select class="edit-status">
                  <option value="pending" ${item.status === "pending" ? "selected" : ""}>pending</option>
                  <option value="paid" ${item.status === "paid" ? "selected" : ""}>paid</option>
                  <option value="rejected" ${item.status === "rejected" ? "selected" : ""}>rejected</option>
                </select>
              </div>
            </div>
            <div class="btn-row">
              <button class="primary save-payout-edit" data-id="${safeId}">Save Changes</button>
              <button class="secondary cancel-payout-edit" data-id="${safeId}">Cancel</button>
            </div>
          </div>
        </div>
      `;
    }).join("")
    : '<p class="muted">No payout requests yet.</p>';
}

$("payoutList").addEventListener("click", async event => {
  const toggleBtn = event.target.closest(".toggle-payout-edit");
  if (toggleBtn) {
    const box = $(`payout-edit-${toggleBtn.dataset.id}`);
    box?.classList.toggle("hidden");
    return;
  }

  const cancelBtn = event.target.closest(".cancel-payout-edit");
  if (cancelBtn) {
    const box = $(`payout-edit-${cancelBtn.dataset.id}`);
    box?.classList.add("hidden");
    return;
  }

  const saveBtn = event.target.closest(".save-payout-edit");
  if (saveBtn) {
    const rawId = saveBtn.dataset.id;
    const box = $(`payout-edit-${rawId}`);
    const newUpi = box.querySelector(".edit-upi").value.trim();
    const newAmount = Number(box.querySelector(".edit-amount").value);
    const newStatus = box.querySelector(".edit-status").value;

    if (!newUpi || !Number.isFinite(newAmount) || newAmount <= 0) {
      message("Enter valid UPI ID and Amount.");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
      const { error } = await supabase.rpc("admin_update_payout", {
        p_request_id: parseId(rawId),
        p_upi_id: newUpi,
        p_amount: newAmount,
        p_status: newStatus
      });

      if (error) throw error;
      message(`Payout Request #${rawId} updated.`);

      await Promise.all([
        loadPayouts(),
        loadUsers()
      ]);
    } catch (error) {
      message("Payout edit error: " + error.message);
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Changes";
    }
    return;
  }

  const actionBtn = event.target.closest(".payout-action");
  if (!actionBtn) return;

  const id = parseId(actionBtn.dataset.id);
  const paid = actionBtn.dataset.paid === "true";

  if (paid) {
    if (!confirm("Have you actually sent this UPI payment? Only continue after verifying the transfer.")) return;
  } else {
    if (!confirm("Reject this payout request?")) return;
  }

  const parent = actionBtn.parentElement;
  parent?.querySelectorAll("button").forEach(btn => { btn.disabled = true; });

  try {
    const { error } = await supabase.rpc("review_payout_request", {
      p_request_id: id,
      p_paid: paid
    });

    if (error) throw error;
    message(paid ? "Payout marked as paid." : "Payout rejected.");

    await Promise.all([
      loadPayouts(),
      loadUsers()
    ]);
  } catch (error) {
    message("Payout error: " + error.message);
    parent?.querySelectorAll("button").forEach(btn => { btn.disabled = false; });
  }
});


// =====================================
// 3. REGISTERED USERS + WALLET EDITING
// =====================================

async function loadUsers() {
  const [usersRes, spinRes, rewardRes] = await Promise.all([
    supabase.rpc("admin_list_users"),
    supabase.from("player_wallets").select("user_id,balance"),
    supabase.from("reward_balances").select("user_id,balance")
  ]);

  if (usersRes.error) {
    $("userList").textContent = usersRes.error.message;
    return;
  }

  const spinMap = new Map(
    (spinRes.data || []).map(row => [row.user_id, Number(row.balance || 0)])
  );
  const rewardMap = new Map(
    (rewardRes.data || []).map(row => [row.user_id, Number(row.balance || 0)])
  );

  const users = Array.isArray(usersRes.data) ? usersRes.data : [];
  $("userCount").textContent = users.length;

  $("userList").innerHTML = users.length
    ? users.map(user => {
      const uid = escapeHTML(user.user_id);
      const spinCoins = spinMap.get(user.user_id) ?? 0;
      const rupees = rewardMap.get(user.user_id) ?? 0;

      return `
        <div class="history-item" style="display:block;padding:14px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <div>
              <b>${escapeHTML(user.email || "No email")}</b>
              <small class="muted" style="display:block;">ID: ${uid}</small>
              <small class="muted" style="display:block;">Joined: ${dateText(user.created_at)}</small>
              <p style="margin:6px 0 0;">
                🎮 Spin Coins: <b>${spinCoins.toLocaleString("en-IN")}</b> ·
                💰 Payment Wallet: <b>₹${rupees.toFixed(2)}</b>
              </p>
            </div>
            <button class="ghost toggle-user-edit" data-uid="${uid}">
              Edit Wallet
            </button>
          </div>

          <!-- INLINE WALLET EDITOR -->
          <div class="edit-box hidden" id="user-edit-${uid}">
            <div class="edit-row">
              <div>
                <label>Spin Coins Balance</label>
                <input type="number" min="0" step="1" class="edit-spin-coins" value="${spinCoins}">
              </div>
              <div>
                <label>Payment Wallet (₹)</label>
                <input type="number" min="0" step="0.01" class="edit-reward-balance" value="${rupees.toFixed(2)}">
              </div>
            </div>
            <div class="btn-row">
              <button class="primary save-user-edit" data-uid="${uid}">Save Balances</button>
              <button class="secondary cancel-user-edit" data-uid="${uid}">Cancel</button>
            </div>
          </div>
        </div>
      `;
    }).join("")
    : '<p class="muted">No registered users.</p>';
}

$("userList").addEventListener("click", async event => {
  const toggleBtn = event.target.closest(".toggle-user-edit");
  if (toggleBtn) {
    const box = $(`user-edit-${toggleBtn.dataset.uid}`);
    box?.classList.toggle("hidden");
    return;
  }

  const cancelBtn = event.target.closest(".cancel-user-edit");
  if (cancelBtn) {
    const box = $(`user-edit-${cancelBtn.dataset.uid}`);
    box?.classList.add("hidden");
    return;
  }

  const saveBtn = event.target.closest(".save-user-edit");
  if (saveBtn) {
    const uid = saveBtn.dataset.uid;
    const box = $(`user-edit-${uid}`);
    const newSpinCoins = Number(box.querySelector(".edit-spin-coins").value);
    const newRewardBalance = Number(box.querySelector(".edit-reward-balance").value);

    if (!Number.isFinite(newSpinCoins) || newSpinCoins < 0 ||
        !Number.isFinite(newRewardBalance) || newRewardBalance < 0) {
      message("Balances cannot be negative.");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    try {
      const { error } = await supabase.rpc("admin_update_user_balances", {
        p_target_user_id: uid,
        p_spin_coins: newSpinCoins,
        p_reward_balance: newRewardBalance
      });

      if (error) throw error;
      message("User balances updated successfully.");
      await loadUsers();
    } catch (error) {
      message("Wallet edit error: " + error.message);
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Balances";
    }
  }
});


// =====================================
// LOGOUT
// =====================================

$("adminLogout").addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();

  if (error) {
    message(error.message);
    return;
  }

  location.href = "./index.html";
});


// Start
init();