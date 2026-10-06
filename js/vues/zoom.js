// Zoom : la photo commence en très gros plan et se dévoile un peu plus à chaque erreur.
// Entraîne l'œil aux détails (une tache, une nageoire, une texture) plutôt qu'à la silhouette.

import { especesDeLaZone, photo } from "../especes.js";
import { champEspece, melanger, rappelZone } from "../outils-jeux.js";
import { h } from "../ui.js";

const NIVEAUX = [6, 3.6, 2.3, 1.5, 1]; // grossissement à chaque essai
const ESPECES_PAR_PARTIE = 5;

export async function vueZoom(main) {
  const pool = await especesDeLaZone();
  const tirage = melanger(pool);
  let score = 0, faites = 0;
  const bilan = [];

  // On saute les espèces sans photo : ce jeu n'a pas de sens sans image.
  async function suivanteAvecPhoto() {
    while (tirage.length) {
      const e = tirage.pop();
      const p = await photo(e).catch(() => null);
      if (p) return { e, p };
    }
    return null;
  }

  async function manche() {
    if (faites >= ESPECES_PAR_PARTIE) return fin();
    main.innerHTML = h`<a class="retour" href="#/jeux">‹ Jeux</a><p class="doux">Recherche d'une photo…</p>`;
    const t = await suivanteAvecPhoto();
    if (!t) {
      main.innerHTML = h`<a class="retour" href="#/jeux">‹ Jeux</a><div class="vide"><p>Pas assez de photos disponibles. Connecte-toi à Internet ou télécharge les photos dans les Réglages.</p></div>`;
      return;
    }
    const { e, p } = t;
    let niveau = 0;
    const essais = new Set();
    // Point de départ du zoom : vers le centre de la photo, là où est en général l'animal.
    const ox = 35 + Math.random() * 30, oy = 35 + Math.random() * 30;

    main.innerHTML = h`
      <a class="retour" href="#/jeux">‹ Jeux</a>
      <header class="entete"><div><h1>Zoom</h1>${rappelZone(pool.length)}</div><p class="doux">${faites + 1} / ${ESPECES_PAR_PARTIE}</p></header>
      <div class="vignette zoom-cadre"><img src="${p.url}" alt="Photo en gros plan de l'espèce à trouver" style="transform-origin:${ox}% ${oy}%"></div>
      <p class="doux" id="essai" style="margin:10px 0">Essai 1 sur ${NIVEAUX.length}, ${NIVEAUX.length} points en jeu</p>
      <div id="saisie" class="pile-serree"></div>
      <div class="rangee-boutons" style="margin-top:10px"><button class="bouton second" id="passer">Dézoomer</button></div>
      <div id="verdict" class="verdict" aria-live="polite"></div>
    `;
    const img = main.querySelector(".zoom-cadre img");
    const zoomer = () => { img.style.transform = `scale(${NIVEAUX[niveau]})`; };
    zoomer();

    function rater() {
      niveau++;
      if (niveau >= NIVEAUX.length) return terminer(false);
      zoomer();
      main.querySelector("#essai").textContent = `Essai ${niveau + 1} sur ${NIVEAUX.length}, ${NIVEAUX.length - niveau} point${NIVEAUX.length - niveau > 1 ? "s" : ""} en jeu`;
    }
    function terminer(trouve) {
      const points = trouve ? NIVEAUX.length - niveau : 0;
      score += points;
      faites++;
      bilan.push({ e, points });
      img.style.transform = "scale(1)";
      main.querySelector("#saisie").hidden = true;
      main.querySelector("#passer").hidden = true;
      main.querySelector("#verdict").innerHTML = h`
        <strong style="color:var(${trouve ? "--ok" : "--ko"})">${trouve ? `Bien vu, ${points} point${points > 1 ? "s" : ""} !` : `C'était ${e.fr}`}</strong>
        <p class="latin">${e.la}</p>
        <button class="bouton large" id="suivante" style="margin-top:14px">${faites >= ESPECES_PAR_PARTIE ? "Voir mon score" : "Espèce suivante"}</button>`;
      main.querySelector("#suivante").addEventListener("click", manche);
    }

    champEspece(main.querySelector("#saisie"), {
      especes: pool,
      exclues: () => essais,
      choisir: (choix) => {
        essais.add(choix.id);
        if (choix.id === e.id) terminer(true);
        else rater();
      },
    });
    main.querySelector("#passer").addEventListener("click", rater);
  }

  function fin() {
    const maxi = ESPECES_PAR_PARTIE * NIVEAUX.length;
    main.innerHTML = h`
      <a class="retour" href="#/jeux">‹ Jeux</a>
      <div class="pile" style="margin-top:20px">
        <p class="score">${score}<span class="doux" style="font-size:.45em"> / ${maxi}</span></p>
        <h2>${score >= maxi * 0.7 ? "Œil de lynx !" : "Les détails, ça s'apprend"}</h2>
        <div class="puces">${bilan.map((b) => h`<a class="puce" href="#/especes/${b.e.id}">${b.e.fr} · ${b.points}</a>`)}</div>
        <button class="bouton" id="rejouer">Rejouer</button>
      </div>`;
    main.querySelector("#rejouer").addEventListener("click", () => vueZoom(main));
  }

  manche();
}
