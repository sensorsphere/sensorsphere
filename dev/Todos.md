## Todos

### SensorSphere App
* [X] dans les "current readings", ajout un filtre sur le nom
* [X] il faudrait pouvoir voir les alertes dans le dashboard
* [X] mettre des icones dans la navigation avec possibilite de la "reduire" avec un hamburger
* [X] pouvoir choisir la location dan l'edit d'un sensor
* [X] pouvoir copier une alerte
* [X] trier les elements dans les listes. ex: liste des asset dans la boite de dialogue (BDD) "New alert rule"
* [X] les elements d'une carte dans les assets ne s'affichent pas dans le meme ordre. il faudrait faire un choix : soit par ordre alphabetique, autre ?
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
* [X] pour chaque metrique, il faut pouvoir definir un indicateur de qualite. ex s'il s'agit d'un type RSSI ou battery ou temp, ..., afficher vert, orange ou rouge en fonction de sa valeur. que me proposes tu ?
* [X] dans les cartes current readings, mettre l'info "Last seen ..." sur la meme ligne que la location
* [X] pour les indicateurs de qualite, il faudrait qu'ils soient globaux par defaut car ca fait plus sens. ex un niveau de batterie ou rssi est globalement le meme type d'indicateur, et avoir la possibilite de les surcharger sur un sensor particulier, ex: une temparateur interieure ou exterieure n'a pas les memes criteres, pour savoir s'il est surcharger, avoir une petite info (ex: icone "overridden") si "surcharge"
* [X] dans les graphes history, ajouter les periodes "2 days" et "3 days" et "14 days"
* [X] pour l'instant, il faut sauvegarder les graphes definis dans "History" dans un fichier JSON cote backend car en cas de changement de navigateur actuellemen on perd tout. et d'ailleurs, il faudrait aussi pouvoir les reimporter  ou me dire ou le mettre ensuite depuis le json qui est dans localstorage
* [X] dans "Inventory" les couleurs choisies avec le theme "dark" ne sont pas tres en coherence, cf screenshot
* [X] afficher les badges "disabled" en orange
* [X] dans la page Assets, ajouter le filtre: status (enabled/disabled). ne pas ordonner les cartes par "Health" mais afficher le nombre de "Online", "Offline", ... dans le header de cette page (apres le titre "Assets" et .justifier a droite). Dans la vue Compact, affcher "Enabled" et "Disabled" plutot que des Enabled:Yes/No
* [X] dans "Inventory", afficher le health et le statut enabled/disabled sur les asset

* [X] dans les current readings ajouter les filtres "status", "health"
* [X] dans l'overview, enlever la carte "Average temperture" et             "average humidity". Afficher plutot: "Temperature Min" et "Temperature Max", idem pour humidity,et avec quel sensor pour chacun des metriques.
* [X] pour chaque page/section ou des filtres existent, prevoir une petite icone "Reset all filters"
* [X] pour les location, pouvoir chosir une icone parmi les MDI icones ou une autre librairie du meme genre. Cette icone devra s'afficher sur l'Inventory, mais aussi la carte des sensors/assets si affectee a la location
* [X] sur un graphe history, affichage de la valeur courante de chaque courbe dans la zone de titre pour plus de clarte
* [X] ajouter les icones: garage, salle a manger, living room, dressing, laundry
* [X] il faut pouvoir nommer l'instance en cours d'execution. ex: Sensor Sphere IAT, My Sensor Sphere, ..., l'affiher dans la nom de l'onglet et dans le header. il faudrait pouvoir surcharger une valeur par defaut en provenance du .env et qui serait renvoyee par une api du backend
* [ ] dans History, les echelles des courbes ne s'affichent pas correctement en d'ajout/suppression d'un metrique

# Run
* [X] Comment puis-je mettre en place une sauvagarde complete de toutes les donnees afin de pouvoir les restaurer facilement en cas de crash
* [X] il faudrait faire un arret de tous le modules ainsi qu un rebuild complet de tous ces modules, sans perte de donnees, afin de voir si ca se construit correctement et ensuite si ca se fait correctement tenter tout un build sur un autre environnement/machine


### Specif

* [ ] le flag "enabled" sur un sensor ne semble avoir aucun effet. par exemple, dans Assets apres un disable, il affiche toujours "Enabled". au passage, dans l vue "Compact", il faudrait ajouter la colonne "Enabled"
* [ ] il faudrait avoir la possibilite de "superposer" les courbes de plusieurs asset mais pour une meme metrique

* [ ] dans les cartes de current readings, si a metrique est une temperature ou humidite, ajouter la valeur min et max sur les dernieres 24h
* [ ] dans les cartes de current readings, pour les statut "offline", il faudrait afficher depuis combien de temps

si on voulait remonter les infos telles que manufacturer, model et gateway via un message MQTT, quel serait le meilleur topic pour l'annoncer et ensuite valorser automatiquemet ces infos dans les donnees du sensor ?

Avoir des progressions de valeur par heure: ex augmentation de 5 degres durant la derniere heure

### Simulator

* [X] il faudrait pouvoir "collapser" les "basic injections". idem pour les scenarios


# ESPHome
* Tenter de remonter les infos d'un capteur par MQTT afin d'alimenter automatiquement les infos d'un Sensor : quel serait le meme chemin pour les topics ?
* est-il possible d'écrire un petit programme (ex: python) permettant de se connecter a un ESPhome afin de recuperer les logs et pouvoir les filtrer ?

# Global
* [ ] Flasher 2 ESP32 relais
  * [ ] 1 garage
  * [ ] 1 first floor
  * [ ] les remonter comme des sensors: Connecter + RSSI
* [ ] Ajouter les infos des ESP32 dans les infs des sensors pour "rattachement"
* [ ] Monter une plateforme d'IAT
    * [ ] Utiliser le meme MQTT "Gateway" pour les 2 ? est-il possible de mettre 2 "connection"?
