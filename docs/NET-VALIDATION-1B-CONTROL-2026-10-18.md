# NET-VALIDATION-1B — Pilotage Netatmo (DEV)

## Portée

- Pilote uniquement `sim-02` et uniquement l'endpoint `http://100.64.0.8:8092`.
- SIM-01 reste en lecture seule ; aucun thermostat réel n'est pilotable.
- Route administrateur : `POST /api/v1/integrations/netatmo/connections/sim-02/control`.
- OAuth : le nouvel appel Authorize pour SIM-02 demande `read_thermostat write_thermostat`. Réautorisation nécessaire pour les jetons historiques.
- Commande `manual` : température 7–30 °C, durée 60–86400 secondes ; `schedule`, `away`, `hg` sans paramètres supplémentaires.
- Réponse : lecture immédiate du mode, de la consigne et de la température mesurée ; journalisation côté API du mode, de la consigne, de la durée et du délai, jamais des secrets.
- L'interface demande une confirmation explicite avant émission.

## Contrôles exécutés

| Test | Statut | Constat |
|---|---|---|
| Build API et Frontend | PASS | Versions 1.76.10 / 1.122.14 construites |
| Vérification stack release | PASS | 2026.10.18.2 cohérente |
| Endpoint sans authentification | PASS | Réponse 401 Unauthorized |
| Commande SIM-01 interdite | À VALIDER | Restriction au niveau de la route |
| Commande vers endpoint autre que simulateur 8092 interdite | À VALIDER | Restriction au niveau de la route |
| Consigne manuelle et durée SIM-02 | BLOCKED | Requiert nouvelle autorisation OAuth écriture et validation interactive |
| Modes schedule, away, hg | BLOCKED | Même prérequis OAuth |
| Retour d'état/Collect et History | NOT RUN | À exécuter après commande positive |
| Contrôle fonctionnel visuel UI | NOT RUN | À valider dans navigateur |

## Instructions de validation

1. Administration → Netatmo Connections → SIM-02 → Authorize ; accepter le scope écriture.
2. Dans « Thermostat control · SIM-02 only », sélectionner Manual, 20 °C, 30 minutes, puis confirmer.
3. Vérifier la réponse `mode=manual, setpoint=20`, puis Collect et les métriques de SIM-02.
4. Tester schedule, away et hg, puis rétablir schedule.
5. Vérifier qu'aucun contrôle n'est disponible pour SIM-01 ou une connexion réelle.

Ne pas déclarer la commande de bout en bout PASS tant qu'elle n'a pas été exécutée avec un jeton d'écriture renouvelé.
