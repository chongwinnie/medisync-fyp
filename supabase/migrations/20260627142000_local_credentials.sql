-- Local credential support for urgent first-party auth.
-- Existing auth0_sub is kept as a legacy external identity column; local users use a
-- deterministic "local|email" subject until the identity model is revisited.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

COMMENT ON COLUMN users.password_hash IS 'PBKDF2 password hash for local credential auth. Format: pbkdf2_sha256$iterations$salt$hash.';
