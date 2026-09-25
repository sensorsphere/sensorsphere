## Remote Desktop Commander

```sh
docker run --rm -it \
  --name remote-desktop-commander \
  --hostname $(hostname) \
  --user $(id -u):$(id -g) \
  -e HOME=$HOME \
  -v $HOME:/home/ubuntu \
  -w /home/ubuntu \
  node:22-bookworm-slim \
  npx -y @wonderwhy-er/desktop-commander@latest remote
  
```

##

```txt
C’est normal ici : le conteneur connaît l’UID/GID 1001 mais n’a pas d’entrée correspondante dans /etc/passwd. Ça ne gêne pas Git ni les écritures. Si besoin plus tard, on pourra créer une image RDC dédiée avec un utilisateur ubuntu explicite, mais ce n’est pas nécessaire pour commencer.

```