# ADR 0003 — Pourquoi une PWA plutôt qu'une app native ou un bot Discord

- **Statut** : accepté
- **Date** : 2025 (MVP MANGA SOCIETY)
- **Décideurs** : Agent Architecte (Prompt 0)

## Contexte

MANGA SOCIETY est un jeu de collection gratuit, social et léger : ouvrir des boosters,
compléter un album, chasser les prints. Le support natif devait trancher entre :

1. **App native** (iOS/Android, ex. React Native/Flutter).
2. **Bot Discord** (le jeu tourne dans Discord).
3. **PWA** (site web installable : manifest + service worker + icônes maskable,
   plein écran une fois installé).

## Décision

**PWA installable.** Le produit est un site web Next.js déployé sur Vercel, installable
comme une application (bannière d'installation façon Kyara, display `standalone`), avec
service worker (precache du shell, cache runtime des images, page `/offline` dédiée).

## Justification

1. **Un seul codebase, toutes les plateformes.** iOS, Android, desktop : un seul déploiement
   web. Une app native double voire triple le périmètre (code, builds, stores, revues) pour
   un jeu sans besoin natif (pas de notifications push critiques en V1, pas de capteurs,
   pas de 120 fps gameplay).
2. **Frottement d'acquisition nul.** Pas de téléchargement store, pas de compte développeur,
   pas de revue App Store : un lien partagé = un joueur potentiel qui joue dans la minute.
   Pour un jeu gratuit de collection dont la croissance repose sur le partage de pulls,
   c'est décisif (liens profil `/u/[username]`, image PNG de pull og-ready).
3. **Installable quand même.** Manifest + service worker donnent l'expérience « app » :
   icône d'accueil, plein écran, lancement instantané, offline pour le shell. Le plaisir
   d'ouvrir des boosters ne dépend pas du store.
4. **Discord n'est QU'une méthode de login OAuth.** Authentifier via Discord (à côté du
   magic link email) ne signifie pas héberger le jeu dans Discord : aucun bot, aucune
   gateway, aucune commande slash. La confusion « produit Discord » est exclue par
   conception : l'OAuth sert uniquement à créer une session Supabase Auth.
5. **Économie d'équipe réaliste.** L'équipe agentisée livre un produit complet en V1 avec
   les budgets perf d'un site (first-load JS < 200 KB gzip, LCP < 2,5 s) — objectifs
   mesurables et atteignables sur le web, très coûteux à tenir en double natif.

## Conséquences

- **Positives** : un seul périmètre de code (les 5 agents travaillent sur le même site) ;
  déploiement continu simple ; partage viral par URL ; installation optionnelle sans
  contrainte store ; les assets (sons CC0, images) restent locaux et légers.
- **Négatives / limites assumées** : pas de push notifications natives en V1 (exclu du
  périmètre MVP) ; les heuristiques d'installation navigateur varient (d'où la bannière
  custom pilotée par `beforeinstallprompt` + CTA iOS dédié) ; l'iOS « add to homescreen »
  reste manuel (instructions affichées) ; le service worker est enregistré en production
   uniquement.

## Alternatives écartées

- **App native** : coût multi-plateforme disproportionné pour un jeu de collection sans
  besoin matériel ; cycle de release store incompatible avec l'itération rapide de
  l'équilibrage économique (`lib/config.ts`).
- **Bot Discord** : confine le jeu à l'audience d'un serveur, rend l'album et la collection
  pénibles à parcourir, exige une gateway et un hébergement bot en permanence, et rend
  les scènes signature (déchirure, reveal, PNG de pull) médiocres. Le login Discord suffit
  à capter l'audience Discord sans ces coûts.
