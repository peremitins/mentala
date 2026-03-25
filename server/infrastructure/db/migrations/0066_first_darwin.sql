UPDATE "user_preferences"
SET "tone" = CASE
  WHEN "tone" = 'delicate' THEN 'gentle'
  WHEN "tone" = 'neutral' THEN 'balanced'
  WHEN "tone" = 'resolute' THEN 'direct'
  WHEN "tone" = 'demanding' THEN 'direct'
  ELSE "tone"
END
WHERE "tone" IN ('delicate', 'neutral', 'resolute', 'demanding');

ALTER TABLE "user_preferences" ALTER COLUMN "tone" SET DEFAULT 'balanced';
