-- Auth0 <-> application user sync helpers
-- Keep these lightweight so server routes can map Auth0 sessions quickly.

CREATE OR REPLACE FUNCTION get_user_id_by_auth0_sub(p_auth0_sub TEXT)
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT u.id
  FROM users u
  WHERE u.auth0_sub = p_auth0_sub
  LIMIT 1;
$$;

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

  INSERT INTO users (
    auth0_sub,
    email,
    role,
    email_verified,
    last_login
  )
  VALUES (
    p_auth0_sub,
    lower(p_email),
    p_default_role,
    COALESCE(p_email_verified, false),
    p_last_login
  )
  ON CONFLICT (auth0_sub) DO UPDATE
    SET email = EXCLUDED.email,
        email_verified = EXCLUDED.email_verified,
        last_login = EXCLUDED.last_login,
        updated_at = now()
  RETURNING * INTO v_user;

  RETURN v_user;
END;
$$;
