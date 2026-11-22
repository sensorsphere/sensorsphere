# NET-ANDROID-RE-06-C-FINAL — Rapport de validation croisée

Date : 24 octobre 2026. Environnement : SensorSphere DEV, connexion réelle Netatmo `homefcs-01`.
Phase terminée : analyse A/B/C. Aucune action sur les commandes de chauffage.

## Synthèse exécutive

- **RE-06-A : PASS (accès et évolution historique)**. 49 réponses A avec valeurs terminales de 20,4 à 21,0 °C et dix transitions de température.
- **RE-06-B : PASS (dépendance à la fenêtre de requête)**. La grille `beg_time` se décale avec les paramètres `date_begin/date_end`; les valeurs peuvent être identiques pour +60/+180 secondes ou différentes pour +600 secondes. Ces grilles ne sont pas des preuves d'acquisition capteur.
- **RE-06-C : PASS (concordance relative sur quatre relevés)**. Les quatre observations Android et API du 24 octobre présentent +0,1 °C en faveur de l'Android.
- **Disponibilité : PARTIAL**. 243 réponses HTTP 200 et deux HTTP 503 sur 245 requêtes historiques enregistrées; une tentative de cycle sans résultat suite à une erreur `homesdata`.
- **Fraîcheur temps réel : NON DÉMONTRÉE**. Pas de timestamp d'acquisition fiable, ni de mesure de latence prouvée.

## Preuves RE-06-A/B

Observation du 21 octobre 2026 20:20 au 22 octobre 00:22 (Europe/Paris), avec 49 enregistrements, dont un essai ponctuel initial et 48 cycles avec résultat. Les historiques ont fourni 243 réponses HTTP 200 et deux HTTP 503; un cycle de la campagne a échoué sur `homesdata` et n'a pas produit d'enregistrement de mesures.

- Série fixe : `21.4, 21.3, 21.1, 20.9, 20.7, 20.5` °C.
- +60 secondes : même série 47/47 comparaisons exploitables, décalage `beg_time` exact de 60 s.
- +180 secondes : même série 48/48, décalage exact de 180 s.
- +600 secondes : série `21.3, 21.3, 21.0, 20.8, 20.6, 20.5` °C, différente de la fixe dans les 48 comparaisons.
- L'écart des grilles ne représente pas nécessairement le décalage de mesure.

Rapport A/B détaillé : `docs/NET-ANDROID-RE-06-AB-FINAL-2026-10-22.md`.

## Preuves RE-06-C — samedi 24 octobre 2026, heure Europe/Paris

| Netatmo Energy (Android) | Mesure Android | Heure consultation API | Mesure historique API | Écart Android - API | Écart des consultations |
|---|---:|---|---:|---:|---:|
| 09:42 | 20,5 °C | 09:41:41,710 | 20,4 °C | +0,1 °C | 18 s |
| 09:54 | 20,6 °C | 09:55:25,551 | 20,5 °C | +0,1 °C | 86 s |
| 10:04 | 20,7 °C | 10:05:26,524 | 20,6 °C | +0,1 °C | 87 s |
| 10:14 | 20,8 °C | 10:15:06,449 | 20,7 °C | +0,1 °C | 66 s |

Les heures Android ont été fournies à la minute : les secondes supposées `00` servent seulement au calcul approximatif des décalages. Les différences ne sont donc pas des mesures à la seconde près.

- Différence moyenne signée : +0,1 °C.
- Écart absolu moyen : 0,1 °C.
- Amplitude des deux séries durant les quatre consultations : +0,3 °C.
- Quatre observations ne permettent pas d'établir une correction systématique de +0,1 °C ni un retard déterministe.
- Les consultations proches et l'évolution identique constituent un indice de cohérence, pas une preuve de fraîcheur d'acquisition.

## Règles d'architecture recommandées pour SensorSphere

1. Conserver la source `netatmo:getroommeasure:historical` et une classe de qualité `historical_unverified_timestamp`.
2. Afficher « Température historique — heure d'acquisition inconnue », avec heure de **consultation** distincte.
3. Ne **jamais** horodater une observation historique comme une acquisition en temps réel uniquement sur la base de l'heure de la requête.
4. Ne pas réutiliser `beg_time + index * step_time` comme timestamp capteur sans nouvelle preuve indépendante.
5. Exclure ces valeurs du pilotage, de la réconciliation des commandes, de l'état `reachable`, du calcul de santé et du statut `last success` du collecteur temps réel.
6. Prévoir dans une prochaine phase un stockage ou une série séparée, avec l'hypothèse d'agrégation, le pas de grille, le type de métrique, les bornes de requête et les avertissements visibles.
7. Ne pas appliquer une correction fixe de +0,1 °C.
8. Les erreurs 503 doivent apparaître comme indisponibilité ponctuelle du fournisseur, sans réécriture rétroactive des valeurs.

## Décision

**NET-ANDROID-RE-06-A/B/C : validé pour l'étude de faisabilité et la concordance comparative.**
**Non validé pour la télémétrie temps réel ni l'horodatage précis des capteurs.**

Prochaine phase proposée : `NET-ANDROID-RE-07`, conception et tests d'un historique séparé, opt-in, avec provenance et incertitude explicites. La mise en production des graphiques doit attendre une politique d'horodatage/stockage validée.

## Traçabilité

- `data/app/netatmo-re06/samples.jsonl`
- `data/app/netatmo-re06/events.jsonl`
- `data/app/netatmo-re06/re06-c-live.jsonl`
- Relevés manuels Android communiqués dans cette conversation.
- Données Netatmo lues exclusivement; aucune commande envoyée, aucune modification de TEST1, aucune injection dans les métriques temps réel.
