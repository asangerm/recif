# Récif

Carnet de plongée et quiz des espèces marines, en PWA : ça s'installe sur l'écran d'accueil du téléphone et ça marche sans réseau.

Écrit en HTML, CSS et JavaScript « à la main », sans framework ni étape de compilation : chaque fichier se lit et se modifie directement.

## Ce que fait la V1

- **Carnet** : ajouter, modifier, supprimer une plongée (site, lieu, date, heure, profondeur max, durée, température, visibilité, binôme, espèces croisées, notes). Bilan en tête de liste, profil de plongée dessiné pour chaque plongée.
- **Espèces** : environ 340 espèces des grandes zones de plongée du monde (les 74 de Méditerranée écrites à la main, plus les poissons les plus observés de chaque zone). Recherche par nom français ou latin, filtres par groupe et « déjà croisées », fiche avec description, taille, profondeur, famille, régime, habitat, zones et plongées où l'espèce a été vue.
- **Zone de plongée** (« Où plonges-tu ? » dans Jeux ou Espèces) : limite la liste, le quiz, les jeux et le téléchargement des photos aux espèces d'une zone. Pratique avant un voyage.
- **Jeux** :
  - *Espèce du jour* : une espèce à deviner par jour, la même sur tous les téléphones (pour une même zone). Chaque proposition est comparée à l'espèce à trouver : vert identique, orange en partie, rouge différent, flèches pour la taille et la profondeur. Série de jours d'affilée, historique, partage du résultat.
  - *Quiz photo* : 10 questions, photo et 4 noms. Les espèces ratées reviennent plus souvent.
  - *Zoom* : la photo commence en gros plan et se dévoile à chaque erreur.
  - *Qui suis-je ?* : indices de plus en plus précis, moins il en faut plus on marque.
  - *Plus ou moins* : laquelle est la plus grande, laquelle descend le plus profond.
  - *Chaîne alimentaire* : relier deux espèces de proie en prédateur (façon Travle).
- **Réglages** : téléchargement des photos de la zone pour le hors-ligne, export / import du carnet (et des parties de l'espèce du jour) en JSON, remise à zéro du quiz.
- **Premier lancement** : un petit mot s'affiche une seule fois (voir « Personnaliser »).

## Lancer sur ton ordinateur

```bash
cd recif
python3 -m http.server 8000
```

Puis ouvre http://localhost:8000. Il faut passer par un serveur : ouvrir `index.html` en double-cliquant ne marche pas (les modules JS et le service worker l'interdisent).

## La mettre sur son téléphone

Le mode hors-ligne exige une adresse en **HTTPS**. Le plus simple et gratuit : **GitHub Pages**.

1. Crée un dépôt GitHub **public** (avec un compte gratuit, GitHub Pages ne publie que les dépôts publics) et pousse le contenu du dossier `recif/`. Pour un dépôt privé, connecte-le plutôt à Netlify ou Cloudflare Pages.
2. Dans le dépôt : Settings › Pages › Source « Deploy from a branch », branche `main`, dossier `/ (root)`.
3. L'appli est en ligne à `https://<ton-pseudo>.github.io/<nom-du-depot>/`.
4. Sur le téléphone : ouvrir l'adresse, puis « Ajouter à l'écran d'accueil » (Safari : bouton Partager ; Chrome Android : menu ⋮ › Installer l'application).
5. Une fois en wifi : Réglages › **Télécharger les photos**.

Netlify (glisser-déposer du dossier sur app.netlify.com/drop) marche aussi.

## Personnaliser

- **Le mot du premier lancement** : `js/config.js`, variables `DEDICACE` et `SIGNATURE`. Pour le revoir pendant tes tests, efface la clé `recif-dedicace-vue` du localStorage (outils de développement › Application › Local Storage).
- **Nombre de questions du quiz** : `QUESTIONS_PAR_PARTIE` dans le même fichier.
- **Couleurs et polices** : variables en haut de `css/style.css`.

## Le catalogue d'espèces

`data/species.json` est **généré** : ne le modifie pas à la main, il serait écrasé. Il est construit par `tools/catalogue/construire.py` (Python 3, aucune installation) :

```bash
python tools/catalogue/construire.py
```

Le script reprend les espèces écrites à la main (`tools/catalogue/especes_manuelles.json`, prioritaires), ajoute les poissons les plus observés de chaque zone sur iNaturalist, puis complète avec FishBase (taille, profondeur, habitat, régime, répartition, qui mange qui), la famille sur iNaturalist et une courte description sur Wikipédia. Les téléchargements sont gardés dans `tools/catalogue/cache/` (ignoré par git) : la première fois prend une dizaine de minutes, ensuite quelques secondes.

- Zones, pays pris en compte et nombre de poissons par zone : en haut de `construire.py` (`ZONES`, `POISSONS_PAR_ZONE`).
- Caractéristiques des espèces qui ne sont pas des poissons (poulpe, gorgones…) : `tools/catalogue/complements.json`.

Après une régénération, augmente `VERSION` dans `sw.js` comme pour toute modification.

## Ajouter une espèce à la main

Ajoute un objet dans `tools/catalogue/especes_manuelles.json`, puis relance le script :

```json
{ "id": "nom-latin-en-minuscules", "fr": "Nom français", "la": "Nom latin", "groupe": "Poissons",
  "taille": "jusqu'à 30 cm", "prof": "5 – 40 m", "desc": "Description.", "indice": "Comment la reconnaître.",
  "protege": true }
```

`groupe` doit être l'un des noms de la liste `groups`. `protege` est facultatif. La photo est trouvée automatiquement à partir du nom latin. Si FishBase ne la connaît pas (ce n'est pas un poisson), ajoute ses caractéristiques dans `complements.json`.

## Publier une mise à jour

**À chaque modification, augmente `VERSION` en haut de `sw.js`** (ex. `recif-v1.0.1`). Sinon les téléphones gardent l'ancienne version en cache. Si tu ajoutes un fichier JS ou CSS, ajoute-le aussi dans la liste `FICHIERS` de `sw.js`.

## Comment c'est organisé

```
index.html            la page unique, avec la barre d'onglets
manifest.webmanifest  nom, icônes, couleurs pour l'installation
sw.js                 service worker : met l'appli en cache
css/style.css         toute la mise en forme
data/species.json     les espèces (généré, voir « Le catalogue d'espèces »)
js/app.js             point d'entrée et routeur (#/carnet, #/especes/…, #/jeux/…)
js/config.js          réglages personnels (dédicace…)
js/db.js              stockage local IndexedDB
js/especes.js         chargement des espèces, zone choisie, recherche de photos
js/outils-jeux.js     outils des jeux : champ de saisie, comparaisons, choix de zone
js/ui.js              outils partagés : HTML sûr, formats, profil de plongée
js/vues/              un fichier par écran (carnet, espèces, jeux, dujour, quiz, zoom…)
tools/catalogue/      script qui construit data/species.json (pas embarqué dans l'appli)
fonts/  icons/        polices et icônes, embarquées pour le hors-ligne
```

Les données (plongées, résultats du quiz, parties de l'espèce du jour, photos) sont stockées dans IndexedDB, dans le navigateur du téléphone. Rien ne part sur un serveur. Conséquence : si l'appli est désinstallée ou les données du site effacées, le carnet disparaît. D'où le bouton d'export.

## Photos

Cherchées sur iNaturalist (une photo sous licence libre de l'espèce), sinon sur Wikipédia, puis gardées sur le téléphone. Les crédits s'affichent sous chaque photo sur les fiches. Certaines photos Wikipédia peuvent être des dessins ou des spécimens hors de l'eau.

## Limites connues

- Le profil de plongée est une forme type reconstituée à partir de la profondeur et de la durée, pas un vrai relevé d'ordinateur.
- Les descriptions et fourchettes de taille et profondeur sont indicatives, à faire relire par une plongeuse.
- Les données FishBase et iNaturalist ont quelques erreurs. Les zones ne sont gardées que si iNaturalist confirme des observations, mais certains liens « qui mange qui » sont établis au niveau du genre (« mange des Chromis ») et peuvent être approximatifs.
- Une soixantaine de nouvelles espèces n'ont pas d'article Wikipédia en français : leur description est générée à partir de leurs caractéristiques.
- Sur iPhone, Safari peut effacer les données d'un site non installé après plusieurs semaines sans visite : installer l'appli sur l'écran d'accueil évite ça.

## Pistes pour la suite

- Invertébrés du monde entier (nudibranches, tortues…) : il faudrait une source de caractéristiques équivalente à FishBase.
- Ses propres photos attachées à une plongée.
- Position GPS des sites et carte.
- Import des plongées depuis un ordinateur de plongée (export UDDF / Subsurface).
- Sauvegarde automatique vers le NAS.
