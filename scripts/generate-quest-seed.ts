// Génère la migration du catalogue de quêtes à partir de la source unique (domain/quests.ts).
// Usage : node scripts/generate-quest-seed.ts > supabase/migrations/20261014000005_quest_catalog.sql
import { QUEST_CATALOG } from '../supabase/functions/_shared/domain/quests.ts';

export function questSeedSql(): string {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const rows = QUEST_CATALOG.map(
    (d) =>
      `  (${q(d.id)}, ${q(d.title)}, ${q(d.description)}, ${q(d.category)}, ${q(d.difficulty)}, ${d.durationDays}, ${d.xp}, ${q(JSON.stringify(d.rule))}::jsonb, ${d.manualFallback})`,
  );
  return [
    '-- Généré par scripts/generate-quest-seed.ts — ne pas modifier à la main.',
    'insert into public.quests (id, title, description, category, difficulty, duration_days, xp, rule, manual_fallback) values',
    rows.join(',\n'),
    'on conflict (id) do update set title = excluded.title, description = excluded.description, category = excluded.category,',
    '  difficulty = excluded.difficulty, duration_days = excluded.duration_days, xp = excluded.xp, rule = excluded.rule,',
    '  manual_fallback = excluded.manual_fallback;',
    '',
  ].join('\n');
}

if (import.meta.url === `file:///${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('generate-quest-seed.ts')) {
  process.stdout.write(questSeedSql());
}
