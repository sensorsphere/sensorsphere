# NET-VALIDATION-1B — DEV, constat initial

Date : 2026-10-18. Environnement : DEV na-01. TEST1 inchangé.

## Résultats

| ID | Vérification | Statut | Preuve |
|---|---|---|---|
| NV1B-001 | Santé API, Frontend et TimescaleDB | PASS | Conteneurs healthy, API 1.76.9 et Frontend 1.122.12 au démarrage |
| NV1B-002 | Distinction des assets SIM-01 et SIM-02 | PASS | Deux identifiants d'assets distincts, un pour chaque thermostat |
| NV1B-003 | Conservation des 6 métriques de chaque thermostat | PASS | battery, heating, mode, reachable, setpoint, temperature |
| NV1B-004 | Collectes et observations récentes | PASS | SIM-01 : 61 observations par métrique (366 au total), SIM-02 : 54 par métrique (324 au total), constat initial |
| NV1B-005 | Absence de doublons d'assets Netatmo SIM | PASS | 2 lignes pour 2 external_id distincts |
| NV1B-006 | Sélection des assets dans History | PASS (inspection du code) | Les sélecteurs Asset → Metrics et Metric → Assets acceptent des assets sans sensor lié |
| NV1B-007 | Initialisation automatique d'un nouveau graphique History | CORRIGÉ (validation visuelle attendue) | Filtre sensor non-null remplacé par sélection de métriques actives temperature/humidity |
| NV1B-008 | Boutons View in History / Add to dashboard | NOT RUN | Présents dans le composant Netatmo, navigation fonctionnelle non testée dans un navigateur |
| NV1B-009 | Affichage réel des courbes, labels, échelles | NOT RUN | Nécessite contrôle dans le navigateur |
| NV1B-010 | Pilotage consigne, mode et durée depuis SensorSphere | BLOCKED | Connecteur SensorSphere lecture seule : pas encore de routes de commande Netatmo |
| NV1B-011 | Confirmation d'une commande par nouvelle collecte | BLOCKED | Dépend de NV1B-010 |

## Suite recommandée

1. Valider dans le navigateur History (nouveau graphe, les deux sens de sélection) et les liens vers Dashboard.
2. Définir/implémenter des routes de commande contrôlées et journalisées sur SIM-02 (setpoint, mode, durée), puis tester le retour d'état.
3. Conserver SIM-01 comme référence, sans pilotage effectif de chauffage réel ni changement TEST1.

La phase 1B reste ouverte ; les tests visuels et de pilotage ne sont pas présentés comme PASS.
