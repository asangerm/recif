// Chaîne alimentaire : relier deux espèces en passant de proie en prédateur (comme Travle
// avec les pays frontaliers). Deux espèces sont voisines si l'une mange l'autre.
// Données : FishBase (contenus d'estomacs étudiés), complétées à la main pour les invertébrés.

import { espece, especesDeLaZone } from "../especes.js";
import { champEspece, melanger, rappelZone } from "../outils-jeux.js";
import { h } from "../ui.js";

const ESSAIS_EN_PLUS = 4; // essais autorisés au-delà du minimum nécessaire

// Voisins de chaque espèce (dans les deux sens : ce qu'elle mange, ce qui la mange).
function graphe(pool) {
  const dans = new Set(pool.map((e) => e.id));
  const voisins = new Map(pool.map((e) => [e.id, new Set()]));
  for (const e of pool) {
    for (const p of e.mange || []) {
      if (!dans.has(p)) continue;
      voisins.get(e.id).add(p);
      voisins.get(p).add(e.id);
    }
  }
  return voisins;
}

// Distance (en nombre de liens) depuis une espèce vers toutes les autres.
function distances(voisins, depart, autorisees = null) {
  const d = new Map([[depart, 0]]);
  const file = [depart];
  while (file.length) {
    const x = file.shift();
    for (const v of voisins.get(x) || []) {
      if (d.has(v) || (autorisees && !autorisees.has(v))) continue;
      d.set(v, d.get(x) + 1);
      file.push(v);
    }
  }
  return d;
}

const mange = (a, b) => (espece(a).mange || []).includes(b);
function lien(a, b) {
  return mange(a, b) ? `${espece(a).fr} mange ${espece(b).fr}` : `${espece(b).fr} mange ${espece(a).fr}`;
}

// Choisit un départ et une arrivée séparés par 3 liens (2 espèces à trouver), sinon 4 ou 2.
function tirerDefi(voisins) {
  const ids = melanger([...voisins.keys()].filter((i) => voisins.get(i).size));
  for (const cible of [3, 4, 2]) {
    for (const a of ids.slice(0, 40)) {
      const d = distances(voisins, a);
      const b = melanger([...d.keys()]).find((x) => d.get(x) === cible);
      if (b) return { a, b, longueur: cible };
    }
  }
  return null;
}

export async function vueChaine(main) {
  const pool = await especesDeLaZone();
  const voisins = graphe(pool);
  const defi = tirerDefi(voisins);
  if (!defi) {
    main.innerHTML = h`<a class="retour" href="#/jeux">‹ Jeux</a><h1>Chaîne alimentaire</h1><p class="doux" style="margin-top:12px">Pas assez de liens connus entre les espèces de cette zone. Essaie « Partout dans le monde ».</p>`;
    return;
  }
  const { a, b, longueur } = defi;
  const depuisA = distances(voisins, a), depuisB = distances(voisins, b);
  const maxEssais = longueur - 1 + ESSAIS_EN_PLUS;
  const essais = [];
  let fini = false, gagne = false, indicesDonnes = 0;
  const maxIndices = Math.max(0, longueur - 2); // il reste toujours au moins une espèce à trouver soi-même

  // Vert : sur un des plus courts chemins. Orange : à un pas de côté. Rouge : hors de la route.
  function couleur(id) {
    const total = (depuisA.get(id) ?? 99) + (depuisB.get(id) ?? 99);
    return total === longueur ? "oui" : total === longueur + 1 ? "proche" : "non";
  }
  function relie() {
    const autorisees = new Set([a, b, ...essais]);
    return distances(voisins, a, autorisees).has(b);
  }
  // Un plus court chemin, pour montrer la solution.
  function solution() {
    const chemin = [a];
    let x = a;
    while (x !== b) {
      x = [...voisins.get(x)].find((v) => depuisB.get(v) === depuisB.get(x) - 1);
      chemin.push(x);
    }
    return chemin;
  }

  main.innerHTML = h`
    <a class="retour" href="#/jeux">‹ Jeux</a>
    <header class="entete"><div><h1>Chaîne alimentaire</h1>${rappelZone(pool.length)}</div></header>
    <p>Relie <a href="#/especes/${a}"><b>${espece(a).fr}</b></a> à <a href="#/especes/${b}"><b>${espece(b).fr}</b></a>
      en citant des espèces qui se mangent les unes les autres. Il en faut au moins ${longueur - 1}.</p>
    <p class="doux" id="compteur" style="margin:8px 0 14px"></p>
    <div id="saisie" class="pile-serree"></div>
    <div class="rangee-boutons" style="margin-top:10px"><button class="bouton second" id="indice">Dévoiler une espèce (coûte un essai)</button></div>
    <div id="verdict" class="verdict" aria-live="polite"></div>
    <ul class="chaine" id="chaine"></ul>
  `;

  const zoneChaine = main.querySelector("#chaine");
  function afficher() {
    const presentes = [a, ...essais, b];
    zoneChaine.innerHTML = h`${presentes.map((id) => {
      const extremite = id === a || id === b;
      const liens = presentes.filter((x) => x !== id && voisins.get(id).has(x));
      return h`<li class="maillon ${extremite ? "extremite" : couleur(id)}">
        <strong>${espece(id).fr}</strong>${extremite ? h` <span class="doux">(${id === a ? "départ" : "arrivée"})</span>` : ""}
        ${liens.length ? h`<small>${liens.map((x) => (mange(id, x) ? `mange ${espece(x).fr}` : `mangé par ${espece(x).fr}`)).join(" · ")}</small>` : h`<small class="doux">aucun lien avec les espèces citées</small>`}
      </li>`;
    })}`;
    main.querySelector("#compteur").textContent = fini ? "" : `${essais.length} essai${essais.length > 1 ? "s" : ""} sur ${maxEssais}`;
    main.querySelector("#saisie").hidden = fini;
    main.querySelector("#indice").hidden = fini || indicesDonnes >= maxIndices || essais.length >= maxEssais - 1;
  }
  function terminer() {
    fini = true;
    afficher();
    const chemin = solution();
    main.querySelector("#verdict").innerHTML = h`
      <strong style="color:var(${gagne ? "--ok" : "--ko"})">${gagne ? `Chaîne complète en ${essais.length} essai${essais.length > 1 ? "s" : ""} !` : "Pas de chaîne cette fois."}</strong>
      <p class="doux" style="margin-top:6px">${gagne ? "Une des chaînes les plus courtes :" : "Une solution :"}</p>
      <ol class="solution">${chemin.slice(1).map((x, i) => h`<li>${lien(chemin[i], x)}</li>`)}</ol>
      <button class="bouton large" id="rejouer" style="margin-top:14px">Nouveau défi</button>`;
    main.querySelector("#rejouer").addEventListener("click", () => vueChaine(main));
  }
  function proposer(id) {
    if (fini || id === a || id === b || essais.includes(id)) return;
    essais.push(id);
    if (relie()) { gagne = true; return terminer(); }
    if (essais.length >= maxEssais) return terminer();
    afficher();
  }

  champEspece(main.querySelector("#saisie"), {
    especes: pool,
    placeholder: "Une espèce qui mange ou qui est mangée…",
    exclues: () => new Set([a, b, ...essais]),
    choisir: (e) => proposer(e.id),
  });
  main.querySelector("#indice").addEventListener("click", () => {
    // On dévoile une espèce du plus court chemin pas encore citée.
    const manquante = solution().slice(1, -1).find((x) => !essais.includes(x))
      || [...voisins.keys()].find((x) => couleur(x) === "oui" && !essais.includes(x) && x !== a && x !== b);
    if (!manquante) return;
    indicesDonnes++;
    proposer(manquante); // l'espèce dévoilée compte comme un essai
  });
  afficher();
}
