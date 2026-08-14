## Todos

* [ ] pour chaque metrique, il faut pouvoir definir un indicateur de qualite. ex s'il s'agit d'un type RSSI ou battery ou temp, ..., afficher vert, orange ou rouge en fonction de sa valeur
* [ ] il faudrait povuoir graphr autre chose que temp ou humidite. ex graphe level batterie

* graphe history, afficher toutes les 2 heures sur les abscisses
* les elements d'une carte latest asset observation ne s'affichent pas dans le meme ordre
* il faudrait avoir la possibilite de "superposer" les courbes de plusieurs asset mais pour un meme metric
* pour les capteurs de temperature, dans le ltest observation, ajouter le temp min et max sur les dernieres 24h
* pour les tatut "offline", il faudrait afficher depuis combien de temps

### SensorSphere App
* [X] dans les "current readings", ajout un filtre sur le nom
* [X] il faudrait pouvoir voir les alertes dans le dashboard
* [X] mettre des icones dans la navigation avec possibilite de la "reduire" avec un hamburger
* [ ] pouvoir choisir la location dan l'edit d'un sensor
* [ ] pouvoir copier une alerte
* [ ] trier les elements dans les listes. ex: liste des asset dans la boite de dialogue (BDD) "New alert rule"

### Simulator

* [ ] il faudrait pouvoir "collapser" les "basic injections". idem pour les scenarios


# ESPHome
* Tenter de remonter les infos d'un capteur par MQTT afin d'alimenter automatiquement les infos d'un Sensor : 