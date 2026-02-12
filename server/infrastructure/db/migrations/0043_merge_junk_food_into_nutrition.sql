-- Объединяем тему "Меньше вредной пищи" в "Здоровое питание"
UPDATE "notification_preferences"
SET "entity_key" = 'nutrition'
WHERE "kind" = 'habits' AND "entity_key" = 'junk_food';
--> statement-breakpoint

UPDATE "notification_slots"
SET "entity_key" = 'nutrition',
    "entity_display_name" = 'Здоровое питание'
WHERE "kind" = 'habits' AND "entity_key" = 'junk_food';
--> statement-breakpoint

UPDATE "notification_texts"
SET "entity_key" = 'nutrition'
WHERE "kind" = 'habits' AND "entity_key" = 'junk_food';
--> statement-breakpoint

UPDATE "notification_text_presets"
SET "entity_key" = 'nutrition'
WHERE "kind" = 'habits' AND "entity_key" = 'junk_food';
--> statement-breakpoint

UPDATE "ai_generated_notification_texts"
SET "entity_key" = 'nutrition'
WHERE "kind" = 'habits' AND "entity_key" = 'junk_food';
--> statement-breakpoint

UPDATE "notification_image_rotation"
SET "entity_key" = 'nutrition'
WHERE "kind" = 'habits' AND "entity_key" = 'junk_food';
--> statement-breakpoint

UPDATE "habits"
SET "habit_key" = 'nutrition'
WHERE "habit_key" = 'junk_food';
