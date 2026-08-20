Je souhaite continuer avec toi le développement de mon projet SensorSphere.

IMPORTANT :
- Le dépôt Git courant et les fichiers que je te fournirai sont la source de vérité.
- Ne suppose pas qu'un patch discuté précédemment a forcément été appliqué.
- Avant de générer un patch important, base-toi sur les fichiers actuels que je te fournis.
- Les patches doivent être des vrais patches Git commençant par "diff --git" et compatibles avec git apply.
- Je travaille depuis Windows et applique les patches sur le serveur Linux avec :

.\apply-patch-remotely.ps1 check `
  .\<patch>.patch

puis :

.\apply-patch-remotely.ps1 apply `
  .\<patch>.patch `
  -VerifyCommand "<commandes de vérification>"

Continue à me fournir ces commandes Windows pour chaque patch.

============================================================
PROJET : SensorSphere
============================================================

SensorSphere est une plateforme IoT permettant notamment :
- l'ingestion de données MQTT ;
- la gestion de sensors BLE ;
- la gestion de gateways ESP32 ;
- le stockage TimescaleDB/PostgreSQL ;
- l'affichage frontend des sensors et historiques ;
- l'analyse de couverture BLE entre sensors et gateways.

Stack :
- Docker Compose
- PostgreSQL 17 / TimescaleDB 2.21.x
- Mosquitto
- service d'ingestion Node/TypeScript
- API
- frontend React/Mantine
- nginx
- migrations SQL versionnées

Le projet principal est SensorSphere.
Le simulateur SensorSphere a été déplacé dans un dépôt Git séparé :
/home/ubuntu/sensorsphere-simulator

============================================================
MQTT / BLE GATEWAYS
============================================================

Ancien format historique :
sensors/ble_gateway/sensor/...

Nouveau format pour les gateways :
sensors/ble_gateway/{gateway_id}/sensor/...

Exemples :
sensors/ble_gateway/ble-gateway-01/sensor/temperature_c8_ac_73/state
sensors/ble_gateway/ble-gateway-01/sensor/rssi_c8_ac_73/state
sensors/ble_gateway/ble-gateway-01/sensor/wifi_rssi/state
sensors/ble_gateway/ble-gateway-01/sensor/mac_address/state
sensors/ble_gateway/ble-gateway-01/sensor/ip_address/state
sensors/ble_gateway/ble-gateway-01/sensor/board_id/state
sensors/ble_gateway/ble-gateway-01/sensor/build_date/state

Une gateway ESP32 est identifiée par gateway_id.

Dans l'architecture cible, un sensor BLE sera finalement rattaché à une seule gateway, mais nous sommes actuellement dans une phase de mesure de couverture :
plusieurs gateways peuvent écouter simultanément le même sensor afin de déterminer la meilleure gateway à laquelle l'affecter.

============================================================
GATEWAY COVERAGE
============================================================

Une page "Gateway Coverage" a été développée.

Elle permet de comparer le RSSI BLE reçu par plusieurs gateways pour chaque sensor.

La base contient notamment :
gateway_sensor_rssi_samples

avec une rétention de 30 jours.

Une table de métadonnées gateway existe également :
gateway_coverage_gateways

Elle stocke notamment des informations telles que :
- gateway_id
- board_id
- mac_address
- ip_address
- build_date
- wifi_rssi
- wifi_rssi_seen_at
- last_rssi_at
- updated_at

La page Gateway Coverage affiche une matrice :

                 gateway-01 gateway-02 gateway-03 ...
sensor A
sensor B
sensor C

Chaque cellule sensor/gateway affiche notamment :
- RSSI moyen
- min/max
- nombre de samples
- dernière réception

Les périodes disponibles comprennent notamment :
5m, 10m, 15m, 30m, 1h, 6h, 24h, 7d.

Le tableau dispose de :
- Reset global
- Delete global
- Reset par gateway
- Delete par gateway
- Refresh manuel
- auto-refresh

Reset d'une gateway :
supprime ses mesures/sensors de couverture sans supprimer la gateway.

Delete :
supprime la gateway et les données associées.

============================================================
TRIS GATEWAY COVERAGE
============================================================

Deux axes de tri sont prévus.

TRI VERTICAL DES SENSORS :
- par nom ;
- par RSSI d'une gateway donnée ;
- ascendant/descendant.

Cliquer sur une gateway permet donc d'ordonner verticalement les sensors selon le RSSI reçu par cette gateway.

TRI HORIZONTAL DES GATEWAYS :
- par nom ;
- par WiFi RSSI de la gateway ;
- par RSSI BLE d'un sensor précis.

Exemple :

sensor 11_85_11 :
gateway-01 = -32 dBm
gateway-02 = -28 dBm
gateway-03 = -33 dBm
gateway-04 = -12 dBm

Tri "best first" :
gateway-04 | gateway-02 | gateway-01 | gateway-03

Le tri peut être inversé.

Si on déclenche ensuite le tri horizontal depuis un autre sensor, les colonnes gateways sont réordonnées selon le RSSI de ce nouveau sensor.

Pour les tris horizontaux, utiliser des indicateurs horizontaux :
↔ / → / ←

Les filtres/tris actifs doivent avoir une couleur différente pour être immédiatement identifiables.

Les contrôles "Gateway order" doivent être placés dans la première cellule d'en-tête du tableau, juste au-dessus de "Sensor order".

La période sélectionnée et les tris doivent être sauvegardés côté navigateur (localStorage) afin d'être restaurés au retour sur la page.

============================================================
AFFICHAGE DU TEMPS
============================================================

Ne plus utiliser "Depuis ...".

L'affichage relatif doit être en anglais, par exemple :
12 sec ago
1 min ago
3 min ago

Couleur :
< 2 min  : normale
> 2 min  : orange
> 5 min  : rouge

Au hover, afficher la date/heure exacte.

============================================================
RESPONSIVE / LARGEUR
============================================================

Le contenu des pages doit utiliser 100 % de la largeur disponible du navigateur.

Il ne doit pas rester limité par un Container Mantine max-width.

Le tableau Gateway Coverage doit :
- prendre toute la largeur disponible ;
- conserver des largeurs de colonnes stables ;
- ne pas changer de géométrie à chaque refresh lorsque "x sec ago" évolue ;
- utiliser un scroll horizontal seulement si nécessaire.

Une réduction d'environ 20 % des largeurs initiales des colonnes a été demandée.

============================================================
SUGGESTED GATEWAY
============================================================

Nous travaillons actuellement sur cette fonctionnalité.

IMPORTANT :
La suggestion ne doit PAS dépendre uniquement de :
row.rank === 1

Elle doit pouvoir être calculée directement à partir des avgRssi disponibles.

Exemple :

gateway-01 : -62.4 dBm
gateway-02 : -60.7 dBm
gateway-03 : aucune donnée
gateway-04 : -58.4 dBm

La meilleure gateway est gateway-04.

Les gateways sans données ne doivent PAS empêcher une suggestion.

La cellule doit indiquer quelque chose comme :

ble-gateway-04
AMBIGUOUS · +2.3 dB

-58.4 dBm avg
7 samples in last 5m
3/4 gateways with data

Seuils de différence actuellement envisagés :
< 3 dB  : Ambiguous
3–8 dB  : Preferred
>= 8 dB : Strong

Si une seule gateway possède des données :
ONLY GATEWAY WITH DATA

Si aucune gateway n'a de données :
NO SUGGESTION

L'affichage des samples doit explicitement indiquer la fenêtre :
"8 samples in last 5m · 14 sec ago"
et non simplement :
"8 samples · 14 sec ago"

============================================================
FIABILITE DE LA SUGGESTION
============================================================

C'EST LE PROCHAIN SUJET A IMPLEMENTER.

Nous avons constaté qu'actuellement une suggestion peut théoriquement être faite avec trop peu de samples.

Nous voulons introduire un minimum de samples dépendant de la période sélectionnée.

Grille proposée :

5 min  : 4 samples minimum
10 min : 8
15 min : 12
30 min : 20
1 h    : 40
6 h    : 120
24 h   : 240
7 j    : 500

Ce minimum ne doit PAS empêcher l'affichage des données RSSI.

Il sert uniquement à déterminer si une gateway est "eligible" pour une recommandation fiable.

Exemple sur 24h :

gateway-01 : 687 samples -> eligible
gateway-02 : 702 samples -> eligible
gateway-03 : 18 samples  -> insufficient
gateway-04 : 641 samples -> eligible

La recommandation est calculée entre 01, 02 et 04.

La cellule Suggested Gateway pourrait afficher :

ble-gateway-04
STRONG · +9.2 dB

-57.8 dBm avg
641 samples in last 24h
3/4 gateways eligible
1 gateway insufficient samples
Minimum required: 240

Si une seule gateway est eligible :

ble-gateway-02
ONLY ELIGIBLE GATEWAY

312 samples in last 24h
1/4 gateways eligible
Minimum required: 240

Si aucune gateway n'est eligible :

NO RELIABLE SUGGESTION

Best data so far: ble-gateway-01
126/240 samples required

Il faut donc distinguer :
- données disponibles ;
- gateway eligible ;
- suggestion actuelle ;
- suggestion fiable.

============================================================
AUTRES REGLES UI
============================================================

Les niveaux RSSI utilisent des badges visuellement distincts, par exemple :
Excellent
Good
Fair
Weak

Les valeurs absentes lors d'un tri doivent rester à la fin, quel que soit le sens du tri.

Le nombre total de sensors est affiché dans l'en-tête.

Le bouton Refresh indique également l'intervalle d'auto-refresh en secondes.

============================================================
BACKUP / RESTORE
============================================================

SensorSphere possède également des scripts de backup/restore.

Le format de backup récent contient notamment :
- database.dump
- database-globals.sql
- app-data.tar.gz
- mosquitto.tar.gz
- project.tar.gz
- manifest.txt
- SHA256SUMS

Le verifier de backup avait validé un backup format version 7.

Le restore TimescaleDB a été travaillé afin de repartir d'un stockage DB propre avant pg_restore.

============================================================
MIGRATIONS
============================================================

Les migrations historiques vont au moins de 002 à 014+.

014-gateway-coverage.sql a créé :
gateway_sensor_rssi_samples

comme hypertable TimescaleDB avec rétention 30 jours.

Ne renumérote jamais arbitrairement une migration existante.
Toujours regarder les migrations réellement présentes dans le dépôt avant d'en créer une nouvelle.

============================================================
WORKFLOW DE DEVELOPPEMENT
============================================================

Je préfère avancer par petits patches incrémentaux.

Pour chaque modification :
1. expliquer brièvement ce qui va changer ;
2. fournir un fichier .patch téléchargeable ;
3. fournir la commande Windows :

.\apply-patch-remotely.ps1 check `
  .\<patch>.patch

4. puis la commande :

.\apply-patch-remotely.ps1 apply `
  .\<patch>.patch `
  -VerifyCommand "..."

5. inclure une VerifyCommand adaptée ;
6. éviter les patches dépendant d'un état supposé du fichier ;
7. si nécessaire, me demander le fichier courant avant de fabriquer le patch.

IMPORTANT :
Des patches ont déjà échoué avec :
"patch does not apply"
ou
"corrupt patch"

Donc ne fabrique pas un patch à partir d'une ancienne version supposée du fichier.

============================================================
POINT DE REPRISE
============================================================

Nous devons maintenant implémenter le système de minimum de samples par période pour "Suggested gateway".

Avant de faire le patch :
- utilise le GatewayCoveragePanel.tsx actuel que je vais te fournir ;
- vérifie également si le calcul doit rester frontend ou être déplacé/complété côté API ;
- conserve tous les tris, la persistance localStorage, le responsive et les autres comportements déjà présents dans le fichier courant.

Je vais maintenant te fournir les fichiers actuels nécessaires.