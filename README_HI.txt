SPIN ARENA — OLD PROJECT 5 SPINS UPDATE

Included files:
- index.html
- app.js
- supabase_5_spins.sql

IMPORTANT: Keep your existing style.css, supabase-config.js, wallet.html, profile.html and other pages.

UPDATE STEPS:
1. Make a backup of your old index.html and app.js.
2. Replace old index.html and app.js with the two files in this folder.
3. Open Supabase Dashboard > SQL Editor.
4. Run the complete supabase_5_spins.sql file once.
5. Reload your website and sign in again.

This update uses new RPC names get_daily_spin_status_v2 and spin_once_v2. It does not call the old can_spin() or spin_once() functions, so their old 24-hour rule will no longer be used by this updated index page.

Existing database requirements:
- public.player_wallets has user_id and balance columns.
- public.spin_history has user_id, reward and created_at columns (created_at should have a default timestamp).
- Existing Supabase Auth users.

If your current table column names differ, do not guess: share the SQL error and table columns so the script can be adjusted.

The spin limit resets at midnight Asia/Kolkata. Rewards are virtual coins only; no deposits, cash prizes, transfers or withdrawals are included.
Never put a Supabase service_role key in browser code. Keep your existing supabase-config.js with the public anon/publishable key only.
