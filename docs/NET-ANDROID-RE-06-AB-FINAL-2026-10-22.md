# NET-ANDROID-RE-06-A/B — Rapport final

Campagne terminée le 22 octobre 2026 à 00:22 heure de Paris. 49 tentatives de cycles, 48 avec résultats, une erreur Homesdata. 49 relevés dont un essai préalable. 243 réponses HTTP 200 et deux HTTP 503 sur 245 appels historiques. Aucun processus encore actif.

## RE-06-A — Températures historiques

Fenêtre glissante de deux heures, grille de 30 minutes (`step_time=1800`). Les 49 réponses A ont réussi, avec 2 à 4 points par réponse. La température terminale passe de 20,5 °C à 20,6 °C sur la période. Valeurs observées : 20,4 ; 20,5 ; 20,6 ; 20,7 ; 20,9 ; 21,0 °C. Dix transitions ont été constatées dans les relevés API. Ces heures sont des heures d'observation API, pas d'acquisition capteur.

## RE-06-B — Décalages des fenêtres

La fenêtre B fixe retourne toujours les six mêmes valeurs : 21,4 ; 21,3 ; 21,1 ; 20,9 ; 20,7 ; 20,5 °C. Les fenêtres B +60 s et B +180 s retournent ces mêmes valeurs malgré un décalage exact de `beg_time`. La fenêtre B +600 s retourne 21,3 ; 21,3 ; 21,0 ; 20,8 ; 20,6 ; 20,5 °C : les valeurs intermédiaires diffèrent. `step_time=1800` pour toutes les fenêtres.

## Bilan des requêtes

| Variante | HTTP 200 | HTTP 503 | Grille temporelle | Comparaison des valeurs avec B fixe |
|---|---:|---:|---|---|
| A glissante | 49 | 0 | Variable | Non applicable |
| B fixe | 48 | 1 | Stable pendant la campagne | Référence |
| B +60 s | 48 | 1 | +60 s, 47/47 comparaisons possibles | Identiques, 47/47 |
| B +180 s | 49 | 0 | +180 s, 48/48 | Identiques, 48/48 |
| B +600 s | 49 | 0 | +600 s, 48/48 | Intermédiaires différentes, 0/48 identiques |

Les bornes fixes du test ponctuel préalable diffèrent de celles de la campagne de quelques secondes ; la série reste néanmoins identique. Un échec `Homesdata unavailable` est enregistré vers 22:21 heure de Paris. Deux appels historiques ont répondu HTTP 503. Intervalle moyen entre cycles enregistrés : 307,4 s, maximum 601 s.

## Verdict et décision

- **PASS** : mesures historiques accessibles, évolution des valeurs, stabilité des résultats de la fenêtre fixe.
- **PASS** : `beg_time` se décale avec les bornes de la requête ; il ne prouve pas l'heure réelle d'acquisition.
- **PARTIAL** : disponibilité (un échec Homesdata, deux HTTP 503).
- **NON DÉMONTRÉ** : fraîcheur temps réel, latence de bout en bout et horodatage du capteur.

**Décision** : conserver « température historique — heure d'acquisition inconnue ». Ne pas injecter ces températures comme télémétrie instantanée ni les utiliser pour piloter le chauffage. Poursuivre NET-ANDROID-RE-06-C avec des relevés Android horodatés.

Sources internes : `data/app/netatmo-re06/samples.jsonl`, `events.jsonl`, `runner.log`. Aucune donnée sensible copiée dans ce rapport. Aucun nouveau cycle lancé, aucun commit ni push.
