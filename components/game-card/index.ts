/**
 * components/game-card/ — POINT D'ENTRÉE UNIQUE du rendu carte.
 *
 * PLACEHOLDER AGENT B — l'Agent D remplace le contenu interne par le rendu
 * définitif (ratio TCG, cadre rareté animé, badge print, overlays css_config).
 * Les props publiques (`GameCardProps`, `GameCardVariant`) et cet export
 * unique sont le contrat B↔D : NE PAS changer la signature.
 */
export { GameCard } from './game-card';
export type { GameCardProps, GameCardVariant } from './game-card';
export { CardBack } from './card-back';
