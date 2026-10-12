/**
 * components/game-card/ — POINT D'ENTRÉE UNIQUE du rendu carte (Agent D).
 *
 * Contrat B↔D : props publiques (`GameCardProps`, `GameCardVariant`) et
 * export unique — NE PAS changer la signature. Tout rendu carte de l'app
 * passe par ici (SPEC §4 règle 6).
 */
export { GameCard } from './game-card';
export type { GameCardProps, GameCardVariant } from './game-card';
export { CardBack } from './card-back';
