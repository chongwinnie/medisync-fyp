/**
 * Auth0 Post-Login Action — MediSync
 * Syncs the authenticated user to Supabase and adds their role as a JWT claim.
 *
 * Secrets required (set in Auth0 Dashboard > Actions > Secrets):
 *   SUPABASE_URL
 *   SUPABASE_SECRET_KEY
 */
exports.onExecutePostLogin = async (event, api) => {
  // Only sync verified users
  if (!event.user.email_verified) return;

  const supabaseUrl = event.secrets.SUPABASE_URL;
  const supabaseKey = event.secrets.SUPABASE_SECRET_KEY;
  const namespace = "https://medisync.app";

  try {
    // 1. Upsert user via sync_auth0_user RPC
    const syncRes = await fetch(`${supabaseUrl}/rest/v1/rpc/sync_auth0_user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({
        p_auth0_sub: event.user.user_id,
        p_email: event.user.email,
        p_email_verified: event.user.email_verified,
        p_last_login: new Date().toISOString(),
        p_default_role: "doctor",
      }),
    });

    if (!syncRes.ok) {
      const errText = await syncRes.text();
      console.error("sync_auth0_user failed:", errText);
      return;
    }

    const userData = await syncRes.json();

    // 2. Add role claim — map DB "staff" to app role "doctor" (matches Next.js)
    const dbRole = userData?.role ?? "doctor";
    const appRole = ["doctor", "nurse", "admin"].includes(dbRole) ? dbRole : "doctor";
    api.idToken.setCustomClaim(`${namespace}/role`, appRole);
    api.accessToken.setCustomClaim(`${namespace}/role`, appRole);
  } catch (err) {
    console.error("Post-login action error:", err);
    // Do not block login on sync failure
  }
};
