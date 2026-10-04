# Base de données

## sensors

Métadonnées des capteurs.

## measurements

Hypertable TimescaleDB contenant une ligne par capteur et par minute lorsqu'une
valeur a changé depuis le précédent flush.

## Storage & Retention

La définition fonctionnelle, le diagnostic de référence DEV et la roadmap
DB-1 à DB-4 sont documentés dans :

    docs/database/storage-retention.md
