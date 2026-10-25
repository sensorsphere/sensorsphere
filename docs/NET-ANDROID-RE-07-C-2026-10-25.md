# NET-ANDROID-RE-07-C — Déploiement et contrôles DEV

Date : 25 octobre 2026. Hôte : na-01. Environnement : DEV exclusivement.

## Versions déployées
- Stack locale : 2026.10.25.1
- API : 1.76.21
- Frontend : 1.122.29
- Migration : 095 (niveau confirmé dans schema_migrations)
- Instances TEST1 et autres environnements : non modifiés.

## Pré-requis et sauvegarde
- Départ : API 1.76.20, frontend 1.122.28, migration 094.
- Sauvegarde DEV créée avant migration : `20261025T064940Z-6d914fe6`.
- Résultat sauvegarde : VERIFIED, 80 651 833 octets.
- Aucune commande de thermostat ni écriture vers la télémétrie provoquée par cette validation.

## Déploiement
- Images construites localement : `sensorsphere-migrations:95`, `sensorsphere-api:1.76.21`, `sensorsphere-frontend:1.122.29`.
- Build API et build production Vite : PASS.
- Migration 095 : APPLY et DONE, base au niveau 95.
- API/frontend redéployés sur DEV, conteneurs healthy.
- HTTPS DEV : HTTP 200.
- Les versions ont été ajustées dans le `.env` de DEV et son fichier `.stack-release.yaml` local.

## Vérifications techniques
- `netatmo_historical_series` présente en base; contrainte d'acquisition nulle et provenance historique.
- GET historique sans session : HTTP 401.
- POST capture sans session : HTTP 401.
- Capture de bout en bout depuis un script administrateur exécuté dans le conteneur API : Netatmo réel `homesdata/getroommeasure` -> parseur -> insertion dédiée -> relecture.
- 31 points historiques, tous numériques; capture persistée sous id 1; `quality = historical_unverified_timestamp`; `acquisition_at IS NULL`; source `netatmo:getroommeasure:historical`.
- Purge des entrées expirées appelée manuellement : 0 enregistrements supprimés.
- L'accès aux routes en véritable session d'administration et l'affichage du graphique en navigateur **restent à valider manuellement**; le script technique démontre la chaîne de persistance mais ne remplace pas le test UI authentifié.
- Rétention de 30 jours assurée au moment des nouvelles captures, pas encore par une tâche périodique autonome.
- Vérification de non-régression des observations **structurelle seulement** (code historique sur une table dédiée). Aucun test chiffré avant/après sur toutes les observations.

## Tests manuels restants
1. Ouvrir `https://dev.sensorsphere.f-colas.com/` comme administrateur.
2. Netatmo > Connections, connexion réelle `homefcs-01`.
3. Cliquer **Historical archive** : le snapshot 1 devrait apparaître, avec 31 positions ordinales et avertissement temporel.
4. Cliquer **Capture history** : vérifier apparition d'un nouveau snapshot, et aucun impact sur état `Last success` de la télémétrie ou commandes chauffage.
5. Recharger la page et vérifier la persistance.
6. Tester les erreurs de fournisseurs et les permissions d'un utilisateur non-admin.
7. Valider l'esthétique et les courbes avant de considérer la phase complètement acceptée.

## Limitations
- Nouvelle interface non vérifiée visuellement en session administrateur.
- Il n'existe pas encore de tâche planifiée garantissant la purge pile à 30 jours.
- Pas de `git push` effectué.
