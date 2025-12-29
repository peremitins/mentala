ALTER TABLE "oauth_accounts"
ADD CONSTRAINT "uk_oauth_accounts_provider_user_id"
UNIQUE ("provider", "provider_user_id");
