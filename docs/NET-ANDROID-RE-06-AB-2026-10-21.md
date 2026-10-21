# NET-ANDROID-RE-06-A/B — Campagne de fraîcheur de température

Date de démarrage : 2026-10-21, 20h21 (Europe/Paris).
Périmètre : connexion réelle homefcs-01 sur l'environnement DEV, lecture seule.

## Fonctionnement
- Script : `scripts/diagnostics/netatmo-re06.mjs`, copié dans le conteneur API DEV à `/app/apps/api/dist/netatmo-re06.mjs`.
- Processus autonome : `node dist/netatmo-re06.mjs --loop`, exécuté par `docker exec -d`.
- Fréquence : un cycle toutes les 5 minutes après le précédent, durée : environ 4 heures.
- Un cycle réalise cinq requêtes API `getroommeasure` en GET :
  - A : fenêtre glissante des deux dernières heures ;
  - B : fenêtre fixe de trois heures, puis la même fenêtre décalée de 60, 180 et 600 secondes.
- Récupération des paramètres de maison/pièce par `homesdata`; seul le premier logement et sa première pièce sont suivis.
- Aucune commande de chauffage, aucun changement de consigne, aucune écriture dans la base SensorSphere, aucune ingestion.
- Journal persistant : `/home/ubuntu/sensorsphere/data/app/netatmo-re06/samples.jsonl`, `events.jsonl`, `runner.log`. Autorisations privées.
- Les journaux ne contiennent ni OAuth token ni identifiant de module, maison ou pièce.

## Première observation (20h20 heure de Paris)
- Les cinq appels ont retourné HTTP 200.
- Valeur terminale : 20,5 °C pour A et les quatre variantes B.
- Quatre points dans la fenêtre A, six points dans chacune des fenêtres B.
- En décalant B de 60, 180 et 600 secondes, `beg_time` se décale du même nombre de secondes, malgré la même valeur terminale.
- Cette grille temporelle **n'établit pas** l'heure exacte de mesure.

## Vérification et fin de campagne
- Vérifier le processus : `docker compose exec -T api sh -c "ps -ef | grep '[n]etatmo-re06.mjs'"`.
- Vérifier le nombre de cycles : `docker compose exec -T api sh -c "wc -l /app/data/netatmo-re06/samples.jsonl"`.
- Un enregistrement `{"event":"finished","cycles":...}` sera écrit dans `events.jsonl` lors d'une terminaison normale.
- Un redémarrage du conteneur API arrêtera la campagne : elle n'est pas sous systemd ni sous un autre superviseur.
- Le script n'est pas intégré au scheduler normal : aucune collecte continue après cette campagne.

## Suite
Comparer les séries sur plusieurs cycles. Identifier les éventuelles variations et vérifier les décalages de grille avant de conclure sur la fraîcheur. Aucune valeur ne doit être présentée comme instantanée uniquement en raison de la fin de la fenêtre glissante.
