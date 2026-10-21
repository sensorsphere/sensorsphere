# NET-ANDROID-RE-06-C — Comparaison avec l'application Android

## Protocole

1. Pendant l'acquisition A/B (ou à des instants enregistrés comparables), ouvrir **Netatmo Energy** sur son propre téléphone.
2. Attendre que l'écran du thermostat ait fini son éventuelle actualisation. Noter l'heure locale **à la minute**, la température mesurée de la pièce (pas la consigne) et éventuellement si l'application semble hors ligne.
3. Répéter 4 à 6 fois à au moins 10-15 minutes d'intervalle. Ne pas modifier les consignes ni le chauffage.
4. Fournir les relevés dans le modèle JSON ci-dessous, avec un décalage de fuseau explicite :
   `[{"at":"2026-10-21T20:40:00+02:00","temperatureCelsius":20.5}]`
5. Sauvegarder ces données dans le volume de diagnostic (hors dépôt Git), par exemple `/app/data/netatmo-re06/manual-android.json`.
6. Exécuter le comparateur hors ligne depuis un conteneur Node ou depuis l'API :
   `node scripts/diagnostics/netatmo-re06-compare.mjs samples.jsonl manual-android.json comparison.json`
   en adaptant les chemins au montage. Le comparateur **ne réalise aucune requête réseau**.

## Règles de comparaison

- Comparer chaque lecture Android au cycle `A_sliding` de `getroommeasure` le plus proche.
- Différence temporelle ≤ 3 minutes : `paired`.
- Entre 3 et 6 minutes : `distant_pair`, exclu des moyennes.
- Plus de 6 minutes : `not_comparable`, exclu des moyennes.
- Différence positive = température Android supérieure à la température historique API.
- Les valeurs `beg_time`/`step_time` ne sont **pas** utilisées comme preuve de l'heure d'acquisition.
- Les écarts peuvent refléter des différences d'échantillonnage ou d'agrégation ; une concordance n'est **pas** une preuve de fraîcheur.
- Le diagnostic reste strictement indépendant de la télémétrie, des commandes et de TEST1.

## État actuel

Outil de comparaison prêt. Aucun relevé manuel authentifié de l'application Android n'a été fourni pour cette phase. La validation comparative reste donc en attente de ces observations.
