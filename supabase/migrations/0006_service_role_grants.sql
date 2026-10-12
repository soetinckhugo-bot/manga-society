-- ============================================================================
-- MANGA SOCIETY — 0004 : grants service_role sur characters (bug bloquant)
--
-- Pourquoi : 0000_schema révoque TOUT de anon/authenticated puis ne re-grante
-- que le nécessaire — mais le rôle Postgres `service_role` (clé service du
-- pipeline Agent C et des route handlers Agent A) n'avait AUCUN grant sur
-- characters → `permission denied` (42501) à l'upsert, bloquant le seed.
-- 0001_functions n'était pas impactée : les RPC SECURITY DEFINER tournent en
-- tant que owner (postgres), indépendamment des grants de service_role.
--
-- Additive, minimale : uniquement ce que le pipeline écrit (upsert idempotent
-- sur anilist_id + recalcul des raretés). Aucune colonne économique n'est
-- ouverte : print_count / wishlist_count restent mutés UNIQUEMENT par les RPC.
-- ============================================================================

grant select, insert, update on public.characters to service_role;
