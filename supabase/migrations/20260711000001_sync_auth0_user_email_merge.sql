-- Make sync_auth0_user robust to email collisions (verified-email account merge).
--
-- Problem: the original implementation only handled ON CONFLICT (auth0_sub).
-- When a login's auth0_sub is new but its email already exists under a different
-- sub (e.g. the same person logging in via a second Google identity / connection),
-- the INSERT violated users_email_key and the whole sync aborted — which made
-- getCurrentUser() return null and redirect authenticated users to /login.
--
-- New resolution order:
--   1. auth0_sub match  -> update that row (email/last_login/etc.), return it.
--   2. email match      -> merge: treat the new login as the same user, refresh
--                          email_verified/last_login, return the existing row.
--                          (We do NOT take over auth0_sub, so the original
--                          identity keeps working; subsequent logins re-merge.)
--   3. no match         -> insert a new user with p_default_role.
-- Email is verified by the IdP (Google) before this runs, so merge-by-email is safe.

CREATE OR REPLACE FUNCTION sync_auth0_user(
  p_auth0_sub TEXT,
  p_email TEXT,
  p_email_verified BOOLEAN DEFAULT false,
  p_last_login TIMESTAMPTZ DEFAULT now(),
  p_default_role user_role DEFAULT 'staff'
)
RETURNS users
LANGUAGE plpgsql
AS $$
DECLARE
  v_user users;
BEGIN
  IF p_auth0_sub IS NULL OR btrim(p_auth0_sub) = '' THEN
    RAISE EXCEPTION 'sync_auth0_user: auth0_sub is required';
  END IF;

  IF p_email IS NULL OR btrim(p_email) = '' THEN
    RAISE EXCEPTION 'sync_auth0_user: email is required';
  END IF;

  -- 1. Existing identity by auth0_sub.
  UPDATE users
     SET email = lower(p_email),
         email_verified = COALESCE(p_email_verified, false),
         last_login = p_last_login,
         updated_at = now()
   WHERE auth0_sub = p_auth0_sub
   RETURNING * INTO v_user;

  IF v_user IS NOT NULL THEN
    RETURN v_user;
  END IF;

  -- 2. Existing identity by email -> verified-email account merge.
  UPDATE users
     SET email_verified = COALESCE(p_email_verified, false),
         last_login = p_last_login,
         updated_at = now()
   WHERE lower(email) = lower(p_email)
   RETURNING * INTO v_user;

  IF v_user IS NOT NULL THEN
    RETURN v_user;
  END IF;

  -- 3. Brand-new user.
  INSERT INTO users (auth0_sub, email, role, email_verified, last_login)
  VALUES (p_auth0_sub, lower(p_email), p_default_role,
          COALESCE(p_email_verified, false), p_last_login)
  RETURNING * INTO v_user;

  RETURN v_user;
END;
$$;
