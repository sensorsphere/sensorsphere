# NET-ANDROID-RE-07-B — Stockage et visualisation historiques séparés

Date : 2026-10-24. Branche : dev. Portée : code et migration préparés, pas de déploiement DEV.

## Livrables
- Migration additive `095-netatmo-historical-series.sql`, table `netatmo_historical_series` indépendante des observations standard. `acquisition_at` demeure NULL sous contrainte CHECK; points JSONB, identifiant de pièce haché SHA-256, date de consultation et bornes de requête.
- `historical-store.ts` : insertion de snapshot, historique admin, purge des snapshots de plus de 30 jours.
- Routes admin, limitées à la connexion réelle `homefcs-01` :
  - `GET /api/v1/integrations/netatmo/connections/:id/historical-series` ;
  - `POST /api/v1/integrations/netatmo/connections/:id/historical-series/capture` (action **manuelle** et explicite).
- UI `NetatmoConnectionsPanel` : boutons « Historical archive » et « Capture history », courbes SVG en positions ordinales; bannière expliquant l'incertitude d'horodatage.

## Règles de sûreté
L'enregistrement ne passe pas par le pipeline de télémétrie, ne met pas à jour `last seen`, n'influence ni l'état de chauffage ni les commandes. Aucune commande de contrôle n'est envoyée. Pas de collecte historique automatique. La purge intervient lors d'une nouvelle capture manuelle : ce n'est pas une garantie de suppression exactement au 30e jour sans capture. Une planification dédiée de rétention serait nécessaire pour cette garantie.

## Tests
- API TypeScript compile en conteneur Node; 5 tests ciblés passent.
- La syntaxe TSX de `NetatmoConnectionsPanel` passe la transformation TypeScript.
- Vérification frontend TypeScript projet **non validée** : configuration/résolution des types React et des imports du dépôt insuffisante dans l'environnement de contrôle utilisé.
- Tests d'intégration base de données, migration réelle, rendu navigateur, capture OAuth et déploiement DEV **non exécutés** dans cette phase.

## Ordre de déploiement requis
1. Construire et tester l'image migrations incluant 095, puis appliquer sur **DEV uniquement** après sauvegarde et vérification de l'état des migrations.
2. Construire les images API et frontend avec tags nouveaux et alignés; contrôler le résultat de build du frontend.
3. Déployer sur DEV puis vérifier les autorisations admin, un GET vide, une capture via Netatmo réel, la persistance et la visualisation, les erreurs 503, la séparation des observations et la rétention.
4. Ne pas modifier TEST1 sans validation spécifique.

Ne pas exposer les identifiants de pièce ou tokens dans les journaux. Ne pas interpréter le temps de la grille API comme heure d'acquisition réelle.
