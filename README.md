# Récif — V1

Carnet de plongée et quiz des espèces marines, en PWA : ça s'installe sur l'écran d'accueil du téléphone et ça marche sans réseau.

Écrit en HTML, CSS et JavaScript « à la main », sans framework ni étape de compilation : chaque fichier se lit et se modifie directement.

## Ce que fait la V1

- **Carnet** : ajouter, modifier, supprimer une plongée (site, lieu, date, heure, profondeur max, durée, température, visibilité, binôme, espèces croisées, notes). Bilan en tête de liste, profil de plongée dessiné pour chaque plongée.
- **Espèces** : 74 espèces de Méditerranée nord-occidentale, recherche par nom français ou latin, filtres par groupe et « déjà croisées », fiche avec description, critères de reconnaissance, taille, profondeur et plongées où l'espèce a été vue.
- **Quiz** : 10 questions, photo et 4 noms (les leurres viennent du même groupe). Les espèces ratées reviennent plus souvent. Sans photo, un indice textuel prend le relais.
- **Réglages** : téléchargement de toutes les photos pour le hors-ligne, export / import du carnet en JSON, remise à zéro du quiz.
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

## Ajouter une espèce

Ajoute un objet dans `data/species.json` :

```json
{ "id": "nom-latin-en-minuscules", "fr": "Nom français", "la": "Nom latin", "groupe": "Poissons",
  "taille": "jusqu'à 30 cm", "prof": "5 – 40 m", "desc": "Description.", "indice": "Comment la reconnaître.",
  "protege": true }
```

`groupe` doit être l'un des noms de la liste `groups`. `protege` est facultatif. La photo est trouvée automatiquement à partir du nom latin.

## Publier une mise à jour

**À chaque modification, augmente `VERSION` en haut de `sw.js`** (ex. `recif-v1.0.1`). Sinon les téléphones gardent l'ancienne version en cache. Si tu ajoutes un fichier JS ou CSS, ajoute-le aussi dans la liste `FICHIERS` de `sw.js`.

## Comment c'est organisé

```
index.html            la page unique, avec la barre d'onglets
manifest.webmanifest  nom, icônes, couleurs pour l'installation
sw.js                 service worker : met l'appli en cache
css/style.css         toute la mise en forme
data/species.json     les espèces
js/app.js             point d'entrée et routeur (#/carnet, #/especes/…)
js/config.js          réglages personnels (dédicace…)
js/db.js              stockage local IndexedDB
js/especes.js         chargement des espèces, recherche de photos
js/ui.js              outils partagés : HTML sûr, formats, profil de plongée
js/vues/              un fichier par onglet
fonts/  icons/        polices et icônes, embarquées pour le hors-ligne
```

Les données (plongées, résultats du quiz, photos) sont stockées dans IndexedDB, dans le navigateur du téléphone. Rien ne part sur un serveur. Conséquence : si l'appli est désinstallée ou les données du site effacées, le carnet disparaît. D'où le bouton d'export.

## Photos

Cherchées sur iNaturalist (photo par défaut de l'espèce), sinon sur Wikipédia, puis gardées sur le téléphone. Les crédits s'affichent sous chaque photo sur les fiches. Certaines photos Wikipédia peuvent être des dessins ou des spécimens hors de l'eau.

## Limites connues de la V1

- Le profil de plongée est une forme type reconstituée à partir de la profondeur et de la durée, pas un vrai relevé d'ordinateur.
- Les descriptions et fourchettes de taille et profondeur sont indicatives, à faire relire par une plongeuse.
- Sur iPhone, Safari peut effacer les données d'un site non installé après plusieurs semaines sans visite : installer l'appli sur l'écran d'accueil évite ça.

## Pistes pour la suite

- Catalogue beaucoup plus large, importé depuis DORIS (FFESSM), WoRMS ou iNaturalist.
- Ses propres photos attachées à une plongée.
- Position GPS des sites et carte.
- Import des plongées depuis un ordinateur de plongée (export UDDF / Subsurface).
- Sauvegarde automatique vers le NAS.
