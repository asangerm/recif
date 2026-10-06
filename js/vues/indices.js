// Qui suis-je ? Les indices arrivent un par un, du plus vague au plus parlant.
// Moins il en faut, plus on marque de points.

import { especesDeLaZone, photo } from "../especes.js";
import { champEspece, melanger, rappelZone, sansLeNom, texteTaille, texteProf } from "../outils-jeux.js";
import { h } from "../ui.js";

const ESPECES_PAR_PARTIE = 5;

function listeIndices(e) {
  const liste = [];
  if (e.zones?.length) liste.push(h`On me croise en <b>${e.zones.join(", ")}</b>.`);
  if (e.habitats?.length || e.regime) liste.push(h`${e.habitats?.length ? h`Je vis surtout : <b>${e.habitats.join(", ").toLowerCase()}</b>. ` : ""}${e.regime ? h`Régime : <b>${e.regime.toLowerCase()}</b>.` : ""}`);
  if (e.tailleCm || e.profMax) liste.push(h`${e.tailleCm ? h`Je mesure jusqu'à <b>${texteTaille(e.tailleCm)}</b>. ` : ""}${e.profMax ? h`On me trouve jusqu'à <b>${texteProf(e.profMax)}</b>.` : ""}`);
  if (e.famille) liste.push(h`Je fais partie de la famille des <b>${e.famille}</b>${e.ordre ? h` (ordre des ${e.ordre})` : ""}.`);
  if (e.indice || e.desc) liste.push(h`${sansLeNom(e.indice || e.desc, e)}`);
  liste.push("photo");
  return liste;
}

export async function vueIndices(main) {
  const pool = await especesDeLaZone();
  const tirage = melanger(pool.filter((e) => e.zones?.length && e.famille)).slice(0, ESPECES_PAR_PARTIE);
  let i = 0, score = 0;
  const bilan = [];

  async function manche() {
    if (i >= tirage.length) return fin();
    const e = tirage[i];
    const indices = listeIndices(e);
    let vus = 1;
    const essais = new Set();

    main.innerHTML = h`
      <a class="retour" href="#/jeux">‹ Jeux</a>
      <header class="entete"><div><h1>Qui suis-je ?</h1>${rappelZone(pool.length)}</div><p class="doux">${i + 1} / ${tirage.length}</p></header>
      <ol class="indices" id="liste"></ol>
      <p class="doux" id="points" style="margin:10px 0"></p>
      <div id="saisie" class="pile-serree"></div>
      <div class="rangee-boutons" style="margin-top:10px"><button class="bouton second" id="encore">Un autre indice</button></div>
      <div id="verdict" class="verdict" aria-live="polite"></div>
    `;
    const zoneListe = main.querySelector("#liste");

    async function afficher() {
      zoneListe.innerHTML = h`${indices.slice(0, vus).map((x) => x === "photo"
        ? h`<li><div class="vignette quiz-photo" id="photo">Chargement…</div></li>`
        : h`<li>${x}</li>`)}`;
      const pts = indices.length - vus + 1;
      main.querySelector("#points").textContent = `${pts} point${pts > 1 ? "s" : ""} en jeu`;
      main.querySelector("#encore").hidden = vus >= indices.length;
      if (indices[vus - 1] === "photo") {
        const p = await photo(e).catch(() => null);
        const el = main.querySelector("#photo");
        if (el) el.innerHTML = p ? h`<img src="${p.url}" alt="Photo de l'espèce à trouver">` : "Pas de photo disponible";
      }
    }
    function indiceSuivant() {
      if (vus >= indices.length) return terminer(false);
      vus++;
      afficher();
    }
    function terminer(trouve) {
      const points = trouve ? indices.length - vus + 1 : 0;
      score += points;
      bilan.push({ e, points });
      i++;
      main.querySelector("#saisie").hidden = true;
      main.querySelector("#encore").hidden = true;
      main.querySelector("#verdict").innerHTML = h`
        <strong style="color:var(${trouve ? "--ok" : "--ko"})">${trouve ? `Trouvé, ${points} point${points > 1 ? "s" : ""} !` : `C'était ${e.fr}`}</strong>
        <p class="latin">${e.la}</p>
        <button class="bouton large" id="suivante" style="margin-top:14px">${i >= tirage.length ? "Voir mon score" : "Espèce suivante"}</button>`;
      main.querySelector("#suivante").addEventListener("click", manche);
    }

    champEspece(main.querySelector("#saisie"), {
      especes: pool,
      exclues: () => essais,
      choisir: (choix) => {
        essais.add(choix.id);
        if (choix.id === e.id) terminer(true);
        else indiceSuivant(); // une erreur dévoile l'indice suivant
      },
    });
    main.querySelector("#encore").addEventListener("click", indiceSuivant);
    afficher();
  }

  function fin() {
    const maxi = tirage.reduce((s, e) => s + listeIndices(e).length, 0);
    main.innerHTML = h`
      <a class="retour" href="#/jeux">‹ Jeux</a>
      <div class="pile" style="margin-top:20px">
        <p class="score">${score}<span class="doux" style="font-size:.45em"> / ${maxi}</span></p>
        <h2>${score >= maxi * 0.6 ? "Tu les connais par cœur" : "Chaque partie te fait progresser"}</h2>
        <div class="puces">${bilan.map((b) => h`<a class="puce" href="#/especes/${b.e.id}">${b.e.fr} · ${b.points}</a>`)}</div>
        <button class="bouton" id="rejouer">Rejouer</button>
      </div>`;
    main.querySelector("#rejouer").addEventListener("click", () => vueIndices(main));
  }

  if (!tirage.length) { main.innerHTML = h`<a class="retour" href="#/jeux">‹ Jeux</a><p class="doux">Pas assez d'espèces dans cette zone.</p>`; return; }
  manche();
}
