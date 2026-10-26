# NET-ANDROID-RE-07-D — Stabilisation DEV

Date : 2026-10-26. Environnement : DEV uniquement. TEST1 et commandes de chauffage inchangés.

## Contrôles observés
- API 1.76.21 et frontend 1.122.29 initialement healthy, migration 95 appliquée.
- 9 captures historiques déjà persistées en base, contenant entre 31 et 48 points chacune, consultables dans la table dédiée.
- Historique séparé des observations live. Aucune migration nouvelle et aucune commande de chauffage exécutées.
- Compilation Docker/Vite de la nouvelle UI réussie.
- HTTPS DEV renvoie 200, les images locales sont déployées.

## Stabilisation UI
- Affiche une **seule courbe historique à la fois**, par sélection de snapshot ; le nombre total de captures est indiqué.
- Permet de changer la capture via une liste horodatée pour éviter l'empilement des neuf courbes.
- Corrige la nature réelle des IDs PostgreSQL BIGINT (chaînes JSON, pas nombres JavaScript) : la sélection utilise des identifiants `string`.
- Ajoute un message explicite en l'absence de températures numériques valides.
- Conserve l'axe horizontal **ordinal**, le badge historique et l'avertissement de fraîcheur inconnue.

## Version
- API inchangée : 1.76.21.
- Frontend stabilisé : 1.122.31.
- Migration inchangée : 95.
- Nouveau build frontend réussi, déployé sur DEV.

## Validation limitée
- Base de données, présence des captures, statut conteneurs, build Vite et accessibilité HTTPS : vérifiés.
- **Navigateur authentifié administrateur : non testé automatiquement** (aucun outil navigateur/session admin disponible dans cette exécution). Le rendu graphique, le changement effectif entre snapshots et les permissions d'un utilisateur non-admin doivent être confirmés en UI.
- La politique de rétention est appliquée à la prochaine capture, sans planification périodique garantie à ce stade.
- Aucun test chiffré complet des observations live avant/après cette stabilisation ; la séparation est assurée au niveau du modèle et de la table.

## Tests manuels d'acceptation
1. DEV > Netatmo > Connections > homefcs-01 > Historical archive : une seule courbe visible, avec sélecteur.
2. Sélectionner le premier et le dernier snapshot : l'heure et la courbe doivent changer.
3. Cliquer Capture history : nouvelle ligne disponible, puis recharger par F5 : persistance.
4. Confirmer le badge d'incertitude et l'axe ordinal, sans timestamp capteur revendiqué.
5. Confirmer absence de modification de l'état de collecte et absence de commandes chauffage.
6. Vérifier l'accès refusé pour les profils non-administrateurs.
