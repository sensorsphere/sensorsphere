# NET-ANDROID-RE-07 — Historique séparé, modèle et stratégie de stockage

## Décision issue de RE-06
Les températures historiques sont cohérentes avec Android (+0,1 °C sur quatre paires rapprochées), mais aucune heure d'acquisition réelle n'a été certifiée. Les coordonnées `beg_time/step_time` changent avec la fenêtre de requête. Elles ne doivent pas être traitées comme des horodatages capteur.

## Contrat d'affichage
Module `historical-series.ts` :
- `provenance = netatmo:getroommeasure:historical`;
- `quality = historical_unverified_timestamp`;
- `currentTelemetry = false`, `acquisitionAt = null`;
- `queriedAt` = heure de consultation de l'API, explicitement distincte;
- `requestedWindow` = bornes demandées et échelle;
- `points[position]` = index ordinal, température nullable et `reportedGridTime` (coordonnée déclarée par l'API, PAS acquisition).
Les points absents restent `null` pour éviter l'interpolation trompeuse. Les séries sont limitées à 48 positions par résultat.

## Proposition de persistance, NON appliquée
Créer une table dédiée, sans FK vers `asset_metrics` ni insertion dans `observations` :
- `id` uuid, `connection_id` vers `netatmo_connections`, `room_key` dérivé de l'identifiant par hachage/clef adaptée;
- `fetched_at` timestamptz, `query_begin`, `query_end`, `scale` text;
- `source`, `quality`, `grid_step_seconds`, `points` jsonb;
- `sensor_acquired_at` NULL par construction et contrainte d'intégrité;
- contraintes sur taille maximale, rétention, accès administrateur et séparation d'avec les tables de métriques.
La clé de pièce et la durée de conservation doivent être arbitrées avant la migration; aucune migration 095 n'est créée/appliquée dans cette phase.

## Sécurité et limites
Pas de collecte automatique, pas d'écriture de base, pas de modification des commandes chauffage ni de la réconciliation des commandes. TEST1 inchangé.
Pour un graphique, l'axe horizontal doit être ordinal (échantillon de grille 1..N) avec une légende « Coordonnées horaires API non certifiées », ou représenter des intervalles explicitement non attestés; ne jamais présenter `reportedGridTime` comme « heure de mesure ».

## Étape suivante
Valider le modèle par tests, puis demander l'accord sur stockage durable et politique de rétention. Après cela seulement : migration dédiée, endpoint administrateur opt-in de sauvegarde et interface de courbes historiques avec avertissement visible.
