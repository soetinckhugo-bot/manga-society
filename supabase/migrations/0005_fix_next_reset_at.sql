-- ============================================================================
-- MANGA SOCIETY — Correctif _next_paris_midnight (migration additive 0005,
-- Agent A). Voir MIGRATIONS.md.
--
-- MOTIF (bug de calcul de date) : l'expression 0003
--     ((public._paris_today() + 1) at time zone 'Europe/Paris')
-- appliquait `at time zone` à une valeur `date`. Postgres résout alors le
-- cast date → timestamp/timestamptz de façon IMPLICITE et dépendante de la
-- version / du fuseau de session : vérifié empiriquement, le résultat était
-- minuit UTC (PG embarqué, session UTC) ou « 00:00 UTC re-rendu en wall time
-- Paris puis re-étiqueté UTC » (cloud PG 15 : +2 h en été, +1 h en hiver)
-- — jamais le prochain minuit Europe/Paris. Constats à 2026-10-11 20:23 UTC
-- (22:23 CEST) : attendu 2026-10-11T22:00:00Z, cloud renvoyé 2026-10-12T02:00:00Z.
-- Impact : next_reset_at affiché du pack du jour / des quêtes (décalage =
-- offset UTC de Paris), et la réponse POST /api/boosters/daily. La LOGIQUE
-- de claim (comparaison de dates via _paris_today) n'était PAS affectée.
--
-- CORRECTION : cast EXPLICITE en `timestamp without time zone` avant
-- `at time zone 'Europe/Paris'` — la date est alors interprétée comme une
-- heure murale Paris (variante documentée « timestamp without time zone AT
-- TIME ZONE »), produisant l'instant UTC exact du prochain minuit Paris,
-- DST incluse (vérifié : 22:00Z en été, 23:00Z en hiver).
-- ============================================================================

create or replace function public._next_paris_midnight()
returns timestamptz
language sql
stable
set search_path = public
as $$
  select ((public._paris_today() + 1)::timestamp without time zone)
           at time zone 'Europe/Paris';
$$;

-- Sécurité reaffirmée (idempotent, cf. 0003) : helper privé.
revoke all on function public._next_paris_midnight() from public, anon, authenticated, service_role;
