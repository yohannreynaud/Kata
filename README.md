# -Projet_web_pam


## Description du projet

### 1. Paris'PAM - Introduction

Ce projet a été réalisé par Yohann Reynaud, Pierre Dubrez et Lisa Chauffour.

Il s'intitule "Paris' PAM" pour Paris Adventure in Memory, c'est également "map" à l'envers.

### 2. Principe

Il s'agit d'une carte de Paris, interactive, dans laquelle il est possible de naviguer et d'y ajouter des points d'intérêts enrichis (photos, texte, tags) afin de retracer un trajet effectué par exemple.

L'application se révèlerait particulièrement pratique dans un intérêt touristique notamment, afin de se souvenir de ses voyages, ainsi que des endroits visités. 

Le principe est simple : on navigue sur la carte à la manière d'une carte virtuelle classique, et par un double-clic, on peut ajouter un "point d'intérêt" , dans lequel nous pouvons ajouter une description (de ce que nous avons visité à cet endroit, par exemple) ainsi que des photos.
Liste exhaustive des fonctionnalités : 
- L'application est une PWA, elle peut donc être installée sur mobile. 
- L'application peut être utilisée hors ligne grâce à l'utilisation d'un service worker qui stocke les données en cache.
- L'application propose une carte (Leaflet) interactive, centrée sur Paris. Leaflet propose les fonctionnalités classiques d'une carte interactive : zoom, déplacement, etc.
- Il est possible, **par un double-clic**, de faire apparaître un pop-up sur la carte permettant d'ajouter un point d'intérêt avec au choix : une description, une catégorie, un ou plusieurs tags et une ou plusieurs photos. 
- On peut ensuite cliquer sur les points d'intérêts déjà créés pour voir leur description, leurs photos, leurs catégories et leurs tags.
- Il est possible de modifier les points d'intérêts déjà créés.
- Il est possible de supprimer les points d'intérêts déjà créés.
- Il est  possible de trier les points d'intérêt existants par catégories (culture, restauration, etc. elles ont été renseignée à la création du point d'intérêt par l'utilisateur).
- L'application est une PWA, elle peut donc être installée sur mobile et utilisée hors ligne.

### 3. Comment lancer le projet
Vous pouvez tester l'application de deux façons différentes : soit en simulant un utilisateur lambda, soit en simulant un développeur.
#### 3.1 Tester l'application sur mobile ou ordinateur (simuler un utilisateur lambda)
Paris'PAM est une PWA (Progressive Web App), elle est donc pensée pour être lancée sur mobile ! 
##### 3.1.1 Sur Mobile
Il faut installer la PWA (qui est au départ un site web) sur son téléphone. Pour cela, il faut :
- Ouvrir l'url https://yohannreynaud.github.io/Fusion-projet-web-pwa-perso/ sur un navigateur mobile (Chrome, Edge, Firefox ou Safari)
- Dans les options de l'onglet de navigation, cliquer sur "Ajouter à l'écran d'accueil" ou "Installer l'application" selon le navigateur utilisé.
- L'application est alors installée et peut être lancée depuis l'écran d'accueil du téléphone, comme n'importe quelle application mobile (c'est ça, une PWA !).

##### 3.1.2 Sur Ordinateur 
Si vous souhaitez vraiment y accéder depuis un ordinateur, c'est possible aussi. Pour cela, il faut simplement accéder à l'url https://yohannreynaud.github.io/Fusion-projet-web-pwa-perso/ depuis un navigateur sur ordinateur.

#### 3.2 Tester l'application en local (simuler un développeur)

Pour lancer le projet, il faut effectuer les commandes suivantes : 
  - Ouvrir le dossier `Fusion-projet-web-pwa-perso`.
  - Utiliser un serveur local :
    - `python -m http.server 8000`
    - ou `npx serve .` avec `npm`.
  - Puis ouvrir `http://localhost:8000` dans le navigateur.

  Aucun gestionnaire de paquets n'est requis pour ce projet. Il ne requiert qu'un navigateur du type Chrome, Edge, Firefox ou encore Safari.
  Pour les fonctionnalités PWA/offline, un navigateur supportant les service workers et les manifests est nécessaire.

Le point d'entrée principal est `index.html` à la racine du projet et les scripts principaux sont `app.js` et `db.js`, avec `sw.js` pour le service worker.

## Commentaires sur la réalisation du projet
### 1. Les difficultés rencontrées

- Sur ordinateur, ajouter les points d'intérêts était très facile et cela a tout de suite fonctionné. En revanche, nous avons eu beaucoup de mal pour rendre cela possible sur l'application Mobile. Pierre s'est chargé de comprendre ce qui ne fonctionnait pas ce qui a permis de faire fonctionner l'app mobile aussi bien que sur ordinateur.
- Le fait que tous les membres du groupe ne travaillent pas sur les mêmes systèmes d'exploitation a également été un frein, notamment pour la partie service worker. En effet, les service workers ne fonctionnent pas de la même manière sur IOS et sur Android, ce qui a rendu les tests plus compliqués. Par exemple, lorsqu'on identifiait un bug, on ne savait pas s'il provenait d'un problème global de code ou d'un problème particulier de compatibilité avec le système d'exploitation.
- La gestion du Service Worker a été un défi. Les mêmes raisons qui rendait l'utilisation d'un service worker attrayante nous ont également posé des problèmes. En effet, comme le SW stocke les données en cache, il nous a fallu trouver des solutions pour faire en sorte que les mises à jour des fichiers autres que sw.js soient prises en compte, ce qui n'était pas le cas à l'origine. Nous avons dû trouver des solutions pour forcer le SW à tout mettre à jour. Pour celà nous avions d'abord ajouté une ligne de code dans `sw.js` qui contenait un numéro de version pour que le SW détecte au rechargement de la page que son propre fichier avait été mis à jour et qu'il devait tout remettre à jour. Cependant cette solution était peu efficace et nous oubliions souvent de mettre à jour ce numéro de version. Nous avons finalement mis en place trois solutions pour palier ce problème : 
    - Une stratégie Network-first pour les fichiers autres que `sw.js` qui permet de vérifier à chaque rechargement de la page si une nouvelle version des fichiers est disponible et de la charger si c'est le cas. 
    - Une solution plus radicale qui consiste à ajouter un bouton "hard reset" dans l'interface de l'application qui permet de forcer le SW à tout mettre à jour : service worker et fichiers de l'application. 
    - De plus nous avons ajouté une recherche automatique de mise à jour du SW à intervalles réguliers pour assurer un changement plus doux entre versions de SW. Cette méthode de mise à jour, elle, n'est pas destinée à tout remettre à plat comme "hard reset" mais à assurer que les utilisateurs soient toujours sur la dernière version du SW et que les bugs soient corrigés au plus vite.

### 2. Usage ou non de l'IA

Nous avons utilisé l'IA tout au long du projet. Cela nous a aidés à comprendre la structure interne d'une application, comment y intégrer une carte OpenStreetMap via la bibliothèque *Leaflet*, et à mieux organiser le fonctionnement du front-end et du service worker.

Nous l'avons utilisée pour :
- comprendre comment structurer le projet autour de `index.html`, `app.js`, `db.js`, et `sw.js`.
- identifier les éléments nécessaires pour rendre le projet faisable sur mobile et PWA.
- clarifier le flux de données et le comportement des points d'intérêt sur la carte.
- Comprendre le fonctionnement d'un service worker. 

Plus précisément concernant le service worker, l'IA nous a non seulement permis de l'implémenter correctement, mais nous l'avons largement utilisée pour comprendre le rôle même du service worker, sa place dans l'architecture des navigateurs. Ceci nous a fait plonger dans la structure très générale des navigateurs (moteur JS, moteur Réseau, DOM, etc.). Cette étape est assurément celle qui nous a pris le plus de temps, mais également celle qui nous a le plus appris. 

### 5. Répartition du travail
- Lisa s'est chargée de générer l'apparence de l'application ainsi que l'intégration de la carte OpenStreetMap via *Leaflet*.

- Yohann s'est chargé du back-end de l'application, notamment de la gestion du service worker, de la gestion des données (stockage, récupération, etc.) et de la transformation du site web en une application (PWA).

- Pierre a corrigé les problèmes que nous avons rencontrés, notamment pour permettre d'ajouter les points d'intérêts sur la version mobile, ce qui ne fonctionnait pas à l'origine.


### 4. Améliorations potentielles

Aujourd'hui, l'application fonctionne, aussi bien sur l'ordinateur que sur mobile. Cependant, il y a encore de nombreuses améliorations possibles, dont nous proposons une liste non exhaustive : 

- On pourrait imaginer une fonctionnalité permettant, en plus d'enregistrer les points d'intérêt, d'enregristrer des trajets entiers (il s'agit de simplement relier des points d'intérêts entre eux). Cela pourrait permettre par exemple de créer des sortes de carnets de voyage ou de stocker ses souvenirs.
- On pourrait, dans la même optique, ajouter un fonctionnement en réseau, permettant aux utilisateurs de se partager leurs trajets. 
- Pour l'instant on reprend simplement la carte d'OpenStreetMap, centrée sur Paris, mais on peut techniquement enregistrer des lieux *partout dans le monde.* On pourrait permettre à l'utilisateur de choisir la zone géographique qu'il souhaite afficher, et de se centrer à chaque ouverture de l'application sur la zone géographique choisie.

