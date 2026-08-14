## Todos

### SensorSphere App
* [X] dans les "current readings", ajout un filtre sur le nom
* [X] il faudrait pouvoir voir les alertes dans le dashboard
* [X] mettre des icones dans la navigation avec possibilite de la "reduire" avec un hamburger
* [X] pouvoir choisir la location dan l'edit d'un sensor
* [X] pouvoir copier une alerte
* [X] trier les elements dans les listes. ex: liste des asset dans la boite de dialogue (BDD) "New alert rule"
* [0] les elements d'une carte dans les assets ne s'affichent pas dans le meme ordre. il faudrait faire un choix : soit par ordre alphabetique, autre ?
* [X] peux tu creer 2 themes bases sur les images jointes
* [X] dans les sensors, ajouter des filtres: manufacturer, model, location, gateway, enabled, status
* [X] dans les sensors, ajouter un filtre de recherche par nom
* [X] dans les graphes history, on a l'impression qu'ils sont charges 2 fois lors du refresh de la page.
* [X] dans la page history, il faurait pouvoir choisir la frequence de rafraichissement des graphes
* [X] il faut pouvoir "collapse" les graphes dans History
* [X] il faut pouvoir reorganiser les graphes dans la page: monter / descendre
* [X] il faut ajouter un bouton "refresh" => refresh immediat
* [X] il faut ajouter un bouton "collapse all" / "expand all"
* [X] il faudrait pouvoir creer plusieurs onglets d'history contenan chacun leurs propres graphes et pouvoir reorganiser les onglets (deplacement droite/gauche)
* [X] dans les cartes de current readings, ajouter le RSSI si existant sur le sensor
* [ ] pour chaque metrique, il faut pouvoir definir un indicateur de qualite. ex s'il s'agit d'un type RSSI ou battery ou temp, ..., afficher vert, orange ou rouge en fonction de sa valeur. que me proposes tu ?

### Specif

* [ ] il faudrait avoir la possibilite de "superposer" les courbes de plusieurs asset mais pour une meme metrique

* [ ] dans les cartes de current readings, si a metrique est une temperature ou humidite, ajouter la valeur min et max sur les dernieres 24h
* [ ] dans les cartes de current readings, pour les statut "offline", il faudrait afficher depuis combien de temps

si on voulait remonter les infs telles que manufacturer, model et gateway via un message MQTT, quel serait le meilleur topic pour l'annoncer et ensuite valorser automatiquemet ces infos dans les donnees du sensor ?

### Simulator

* [X] il faudrait pouvoir "collapser" les "basic injections". idem pour les scenarios


# ESPHome
* Tenter de remonter les infos d'un capteur par MQTT afin d'alimenter automatiquement les infos d'un Sensor : .