# NET-ANDROID-RE-05 — Preview historique Netatmo

Date : 2026-10-21

## Fonctionnalité
- Endpoint admin GET `/api/v1/integrations/netatmo/connections/:id/historical-temperature-preview`.
- Disponible uniquement pour `homefcs-01` et base URL officielle Netatmo HTTPS.
- Lecture `homesdata` puis `getroommeasure` à la demande, maximum huit logements et trente pièces par logement.
- Sélection des identifiants interne à l'API : seules les étiquettes de pièces ordinales et les données historiques sont retournées.
- Aucun enregistrement ni ingestion, aucun changement du statut de collecte `partial`, aucun effet sur les consignes ou le pilotage.
- Dans `NetatmoConnectionsPanel.tsx`, bouton « Historical temperature » pour la connexion réelle et panneau distinct.
- La mention « not live » et la fraîcheur inconnue sont affichées explicitement.

## Vérifications effectuées
- Compilation API `tsc --noEmit` en conteneur Docker : PASS.
- Compilation frontend `vite build` en conteneur Docker : PASS (avertissement de taille chunk).
- Tests du lecteur historique précédemment réalisés dans RE-04 : 4/4 PASS.
- Aucun test HTTP du nouvel endpoint ni validation navigateur réalisés à ce stade.
- Aucune image reconstruite/déployée sur DEV, aucun test sur TEST1, aucun git push.

## Suite
1. Préparer et publier des images DEV conformément au processus de release du projet.
2. Vérifier l'accès administrateur, le rendu du panneau, la réponse sur `homefcs-01`, les erreurs et la provenance.
3. Vérifier que `partial` et les observations historiques ne modifient pas les métriques temps réel ni les commandes.
