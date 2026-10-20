# NET-ANDROID-RE-04 — Prototype isolé de température historique

Date : 2026-10-21. Environnement : sources de la branche `dev`, hôte na-01.

## Objectif et périmètre

Prototype de lecture seule utilisant `GET /api/getroommeasure`, hors du collecteur actif.
La réponse n'est pas une mesure temps réel. Aucun déploiement ou migration de base de données n'est nécessaire.

## Constats RE-02/RE-03

- `/homestatus` reste incomplet en présence de l'erreur 2 du module NAPlug réel, même avec filtres.
- `/getroommeasure` retourne des vecteurs numériques de température pour une fenêtre historique récente.
- Les grilles `beg_time/step_time` peuvent se décaler avec la fenêtre de requête, sans déplacement des valeurs.
- L'horodatage exact de l'acquisition reste **non démontré**; des données provenant d'une requête récente peuvent être anciennes.
- Consigne, mode et état de chauffe ne sont pas couverts par cette voie.

## Implémentation

- `apps/api/src/features/netatmo-energy/historical-fallback.ts` : fonction `probeHistoricalRoomTemperature`.
- Activation explicite `enabled:true` obligatoire, sinon aucun accès réseau.
- Requête HTTPS GET de 24h, `scale=30min`, `type=temperature`, `limit=48`; jeton Bearer passé par l'appelant.
- Extraction de la dernière valeur numérique valide, rejet de valeurs malformées/hors plage.
- Sortie structurée : `provenance=netatmo:getroommeasure:historical`, `currentTelemetry=false`, `timestampConfidence=unverified`, `claimedAcquisitionAt=null`, `queriedAt` seulement.
- Aucun branchement à `multi-collector.ts`, `ingest.ts`, au panneau de contrôle ou aux commandes.
- Pas de modification de configuration, données persistées, credentials, SIM-01/SIM-02 ni TEST1.

## Vérification

- TypeScript : `tsc -p apps/api/tsconfig.json --noEmit` dans `node:22-bookworm-slim`, code 0.
- Tests ciblés : 4/4 PASS, dans conteneur Node isolé du réseau avec compilation en /tmp.
- Exécution sur chauffage réel : aucune pour ce prototype (les essais API des étapes précédentes restent la base).

## Limitations et étape suivante

Le prototype fournit une valeur historique **sans certification de fraîcheur** : il ne doit pas alimenter une série temps réel ni déclencher le rapprochement de commandes.
Avant intégration, étudier les garanties d'ancienneté offertes par le fournisseur et concevoir une représentation UI distincte « température historique, âge inconnu ».
Un fallback actif serait une étape distincte, à autoriser et valider explicitement.
