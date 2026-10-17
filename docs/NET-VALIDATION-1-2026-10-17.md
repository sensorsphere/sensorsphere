# NET-VALIDATION-1 — Compte rendu DEV du 17 octobre 2026

Contexte : DEV sur na-01. API 1.76.9, frontend 1.122.12, migrations 92, simulateurs 0.5.18.
SIM-01 reste la référence stable, SIM-02 est utilisée pour les injections. Intervalle normal : 300 secondes.

## Exécutions prouvées

| ID | Test | Statut | Preuve |
|---|---|---|---|
| NV1-001 | Santé des composants DEV | PASS | API, frontend, TimescaleDB, deux simulateurs healthy |
| NV1-002 | Collectes périodiques indépendantes | PASS | Plusieurs collectes SIM-01/SIM-02 à six observations |
| NV1-003 | Panne API 503 sur SIM-02 | PASS | Erreur enregistrée Netatmo HTTP 503, dernier succès conservé |
| NV1-004 | Reprise après 503 | PASS | SIM-02, 19:28:27 UTC, six observations, erreur effacée |
| NV1-005 | Limitation API 429 | PASS | Erreur enregistrée Netatmo HTTP 429 |
| NV1-006 | Erreur API 401 | PASS | Erreur enregistrée Netatmo HTTP 401 |
| NV1-007 | Reprise après 401 | PASS | SIM-02, 19:29:57 UTC, six observations, erreur effacée |
| NV1-008 | Isolation SIM-01 pendant pannes SIM-02 | PASS | SIM-01, collecte réussie à 19:29:12 UTC |
| NV1-009 | Intervalle automatique 0 | PASS | SIM-02, échéance vide, aucune tentative pendant fenêtre observée |
| NV1-010 | Retour à 300 secondes | PASS | Échéance restaurée |
| NV1-011 | Redémarrage de l'API et nouvelle collecte | PASS | SIM-02, 19:31:06 UTC, six observations, erreur absente |
| NV1-012 | État intégré dans le simulateur | PASS côté API | SIM-02 reçoit un rapport client OAuth avec heure de collecte et six observations |

## Contrôles restant ouverts

| ID | Scénario | Statut |
|---|---|---|
| NV1-013 | Vérification visuelle des états et intervalles dans Administration | NOT RUN |
| NV1-014 | History, assets, dashboard et absence de doublons | NOT RUN |
| NV1-015 | Timeout réseau, puis reprise | NOT RUN |
| NV1-016 | Pilotage depuis SensorSphere (consigne, mode et durée) | BLOCKED — périmètre fonctionnel à vérifier |
| NV1-017 | Endurance 24 heures | NOT RUN |
| NV1-018 | Modification d'intervalle depuis l'interface | NOT RUN |
| NV1-019 | Deux processus API concurrents et absence de doublons | NOT RUN |

## État laissé en fin de campagne

- SIM-02 : injection API restaurée à none.
- SIM-01 et SIM-02 : intervalle 300 secondes.
- Aucun push, aucune modification de TEST1, aucune suppression d'asset.
- Les heures de ce document sont en UTC ; heure française le 17 octobre : UTC+2.

## Verdict

Validation technique partielle réussie. NET-VALIDATION-1 reste OUVERTE pour les contrôles fonctionnels, d'endurance et de pilotage.
