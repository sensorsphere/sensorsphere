# NET-ANDROID-RE-07-D — validation complémentaire du 27 octobre 2026

Environnement : DEV, na-01, via RDC. Pas de push, aucun changement TEST1, aucune commande de chauffage.

## État vérifié
- Git avant rapport : branche dev, arbre propre, dernier commit f5e83d2, ahead 10 de origin/dev.
- API 1.76.21 healthy ; frontend 1.122.31 healthy ; nginx et TimescaleDB healthy.
- Stack déclarée 2026.10.25.1. Migration 095 appliquée en base et table netatmo_historical_series présente.
- URL DEV HTTPS : HTTP 200.
- Sauvegarde préalable : backups/20261025T064940Z-6d914fe6, répertoire présent, restauration non testée.
- Archive : 9 captures historiques, acquisition_at NULL, aucune ligne expirée avant test.
- Authentification DEV activée : SENSORSPHERE_AUTH_ENABLED=true ; absence de session admin disponible via outils.

## Matrice de validation
| Test | Statut | Preuve / limite |
|---|---|---|
| D01 Git, conteneurs, HTTPS | PASS | git, docker compose ps, curl HTTP 200 |
| D01 migration 095 | PASS | SELECT max(version) FROM schema_migrations = 95 |
| D01 captures conservées | PASS | 9 lignes, acquisition_at NULL |
| D02 GET archive anonyme | PASS | HTTP 401 |
| D02 POST capture anonyme | PASS | HTTP 401 |
| D02 GET/POST avec session admin | BLOCKED | Session admin absente |
| D02 non-admin et connexion non autorisée | BLOCKED | Session utilisateur authentifiée absente ; réponse anonyme 401 |
| D02 panne amont Netatmo / 503 | NOT RUN | Pas d'injection de panne sur connexion réelle |
| D03 rendu navigateur, sélecteur, F5, responsive | BLOCKED | Pas de navigateur avec session admin ; pas de validation visuelle prétendue |
| D04 purge J+30 | PASS | Transaction : insertion ligne J-31, 1 expirée, DELETE 1, 0 restante, ROLLBACK |
| D04 archive après rollback | PASS | 9 lignes avant et après |
| D04 observations durant test SQL | PASS | 6 568 024 avant et durant le test |
| D04 isolation capture HTTP / collecteur / commandes | NOT RUN | Capture HTTP authentifiée non exécutée |
| D05 conteneurs DEV sains | PASS | API, frontend, nginx, TimescaleDB healthy |

## Constats
- f5e83d2 est déjà déployé avec frontend 1.122.31 : sélection d'une courbe à la fois, IDs BIGINT traités comme chaînes, légende ordinale et messages sans donnée valide. Observé dans le code, non dans le navigateur.
- La purge SQL fonctionne, mais le déclenchement se fait seulement durant une capture ; sans captures, aucune garantie de rétention stricte à 30 jours. Une purge périodique dédiée est à concevoir avant activation.
- Le message HTTP 502 pour erreur amont reste générique ; qualité réelle des messages UI non vérifiée.
- Aucun changement de code ou de configuration effectué durant cette reprise ; aucun rebuild nécessaire.

## Conditions restantes pour clôture complète
1. Depuis une session admin DEV, ouvrir Netatmo > Connections > homefcs-01 > Historical archive ; vérifier courbe, sélecteur, axe ordinal, libellés, affichages vide et mobile.
2. Effectuer Capture history, relever réponse et id, vérifier nouvelle ligne et persistance après F5.
3. Comparer compteurs observations et collecteur et journal de commandes chauffage avant/après cette capture.
4. Vérifier refus non-admin et autre connexion ainsi que scénario d'erreur upstream sans perturber la connexion réelle.
5. Mettre à jour les statuts PASS/FAIL sur preuves navigateur et API, avant clôture totale RE-07-D.
