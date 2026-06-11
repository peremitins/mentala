/**
 * Дев-утилита: «виртуальное прохождение» Сада для пользователя.
 *
 * Помечает программу завершённой (user_programs.status='completed'),
 * проставляет прогресс всех шагов и сажает растение в user_plants -
 * именно count(user_plants) считает unlock-правило следующих Садов
 * (см. garden.service.ts → assertProgramUnlocked).
 *
 * Использование:
 *   pnpm dev:garden:complete -- --user=86
 *   pnpm dev:garden:complete -- --user=86 --slug=self_kindness_21
 *
 * Без --slug завершает оба стартовых сада (calm_anxiety_30 + self_kindness_21),
 * чего достаточно для открытия Сада #3 «Отношения». Операция идемпотентна:
 * уже посаженные растения не дублируются (UNIQUE(user_id, program_id)).
 *
 * Только для development - в production выполняться отказывается.
 */
import { Client } from 'pg';
import { prepareMigrationEnv, resolveDefaultEnv } from './utils';

const DEFAULT_SLUGS = ['calm_anxiety_30', 'self_kindness_21'];
const NEXT_GARDEN_SLUG = 'relationships_21';

function parseArgs(args: string[]) {
  let userId: number | null = null;
  let slugs: string[] | null = null;

  for (const arg of args) {
    if (arg.startsWith('--user=')) {
      userId = Number(arg.slice('--user='.length));
    } else if (arg.startsWith('--slug=')) {
      slugs = arg
        .slice('--slug='.length)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  if (!userId || !Number.isInteger(userId) || userId <= 0) {
    throw new Error(
      '❌ Укажи пользователя: pnpm dev:garden:complete -- --user=86'
    );
  }

  return { userId, slugs: slugs ?? DEFAULT_SLUGS };
}

const COMPLETE_GARDEN_SQL = `
WITH params AS (
  SELECT $1::int AS user_id, $2::text AS program_slug
),
target_program AS (
  SELECT p.id, p.slug, p.total_steps, p.plant_set_slug, p.summary_text
  FROM programs p
  JOIN params prm ON prm.program_slug = p.slug
),
upsert_user_program AS (
  INSERT INTO user_programs (
    user_id, program_id, current_step, status, started_at, completed_at,
    metadata, created_at, updated_at
  )
  SELECT
    prm.user_id, tp.id, tp.total_steps, 'completed',
    now() - interval '21 days', now(),
    jsonb_build_object('dev_backfill', true), now(), now()
  FROM params prm, target_program tp
  ON CONFLICT (user_id, program_id)
  DO UPDATE SET
    current_step = EXCLUDED.current_step,
    status = 'completed',
    started_at = COALESCE(user_programs.started_at, EXCLUDED.started_at),
    completed_at = now(),
    updated_at = now()
  RETURNING id AS user_program_id
),
upsert_step_progress AS (
  INSERT INTO user_program_step_progress (
    user_program_id, step_template_id, status, current_action_index,
    started_at, completed_at, metadata, created_at, updated_at
  )
  SELECT
    uup.user_program_id, st.id, 'completed', 0,
    now() - interval '21 days', now(),
    jsonb_build_object('dev_backfill', true), now(), now()
  FROM upsert_user_program uup, target_program tp
  JOIN program_step_templates st ON st.program_id = tp.id
  ON CONFLICT (user_program_id, step_template_id)
  DO UPDATE SET
    status = 'completed',
    completed_at = COALESCE(user_program_step_progress.completed_at, now()),
    updated_at = now()
  RETURNING id
),
insert_plant AS (
  INSERT INTO user_plants (
    user_id, program_id, program_slug, plant_set_slug, state_index,
    completed_at, user_summary, saved_thoughts, metadata, created_at, updated_at
  )
  SELECT
    prm.user_id, tp.id, tp.slug, COALESCE(tp.plant_set_slug, 'orchid'), 15,
    now(), tp.summary_text, '{"ids":[]}'::jsonb,
    jsonb_build_object('dev_backfill', true), now(), now()
  FROM params prm, target_program tp
  ON CONFLICT (user_id, program_id) DO NOTHING
  RETURNING id
),
cancel_garden_notifications AS (
  UPDATE notification_slots ns
  SET status = 'cancelled'
  FROM params prm
  WHERE ns.user_id = prm.user_id
    AND ns.kind = 'system'
    AND ns.status IN ('planned', 'queued')
    AND (
      ns.entity_key LIKE 'next_step:%'
      OR ns.entity_key LIKE 'garden_started:%'
    )
  RETURNING ns.id
)
SELECT
  (SELECT count(*) FROM upsert_user_program)::int        AS upserted_user_programs,
  (SELECT count(*) FROM upsert_step_progress)::int       AS upserted_step_progress,
  (SELECT count(*) FROM insert_plant)::int               AS inserted_plants,
  (SELECT count(*) FROM cancel_garden_notifications)::int AS cancelled_notifications;
`;

async function main() {
  const { env, envFile, dbUrl } = prepareMigrationEnv(process.argv.slice(2), {
    defaultEnv: resolveDefaultEnv(),
  });

  if (env === 'production' || process.env.NODE_ENV === 'production') {
    throw new Error(
      '❌ Виртуальное прохождение садов запрещено в production. Только development.'
    );
  }

  const { userId, slugs } = parseArgs(process.argv.slice(2));

  console.log(
    `✅ Env: ${env} (${envFile.replace(`${process.cwd()}/`, '')}). User: ${userId}. Сады: ${slugs.join(', ')}.`
  );

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    const userRow = await client.query<{ id: number }>(
      'select id from users where id = $1',
      [userId]
    );
    if (!userRow.rowCount) {
      throw new Error(`❌ Пользователь id=${userId} не найден в этой БД.`);
    }

    for (const slug of slugs) {
      const programRow = await client.query<{ id: number; status: string }>(
        'select id, status from programs where slug = $1',
        [slug]
      );
      if (!programRow.rowCount) {
        console.warn(
          `⚠️  Программа ${slug} не найдена в БД - пропускаю. ` +
            'Запусти dev-сервер (pnpm dev): bootstrap создаст программы из кода.'
        );
        continue;
      }

      await client.query('begin');
      try {
        const result = await client.query(COMPLETE_GARDEN_SQL, [userId, slug]);
        await client.query('commit');
        const row = result.rows[0] ?? {};
        console.log(
          `[${slug}] ✅ user_programs=${row.upserted_user_programs}, ` +
            `steps=${row.upserted_step_progress}, ` +
            `new_plant=${row.inserted_plants}, ` +
            `cancelled_notifications=${row.cancelled_notifications}`
        );
      } catch (error) {
        await client.query('rollback');
        throw error;
      }
    }

    // Контроль: открылся ли следующий Сад.
    const plants = await client.query<{ program_slug: string }>(
      'select program_slug from user_plants where user_id = $1 order by completed_at',
      [userId]
    );
    const nextGarden = await client.query<{ status: string }>(
      'select status from programs where slug = $1',
      [NEXT_GARDEN_SLUG]
    );

    const plantSlugs = plants.rows.map((row) => row.program_slug);
    console.log(
      `\n🌱 Растений у пользователя: ${plantSlugs.length} (${plantSlugs.join(', ') || 'нет'}).`
    );

    const nextStatus = nextGarden.rows[0]?.status;
    if (!nextStatus) {
      console.warn(
        `⚠️  Сад «${NEXT_GARDEN_SLUG}» отсутствует в БД. Перезапусти pnpm dev - bootstrap создаст его из PROGRAM_BOOTSTRAP.`
      );
    } else if (nextStatus !== 'published') {
      console.warn(
        `⚠️  Сад «${NEXT_GARDEN_SLUG}» в статусе '${nextStatus}'. Нужен рестарт pnpm dev с актуальным кодом (bootstrap переведёт тизер в published и создаст шаги).`
      );
    } else if (plantSlugs.length >= 2) {
      console.log(
        `🎉 Сад «${NEXT_GARDEN_SLUG}» published и unlock-условие выполнено (≥2 растений). Обнови страницу - сад доступен.`
      );
    } else {
      console.warn(
        `⚠️  Для открытия «${NEXT_GARDEN_SLUG}» нужно ≥2 растений, сейчас ${plantSlugs.length}.`
      );
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
