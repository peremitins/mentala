-- Backfill email_verified_at for legacy email/password users
UPDATE users
SET email_verified_at = NOW()
WHERE email_verified_at IS NULL
  AND password_hash IS NOT NULL;

-- Enforce email presence for all accounts (MVP requirement)
ALTER TABLE users
  ALTER COLUMN email SET NOT NULL;
