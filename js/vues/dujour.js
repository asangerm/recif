// L'espèce du jour : une espèce à deviner par jour, la même sur tous les téléphones.
// Chaque proposition est comparée à l'espèce à trouver, caractéristique par caractéristique :
// vert = identique, orange = en partie, rouge = différent, flèche = plus grand / plus petit.

import * as db from "../db.js";
import { chargerEspeces, espece, especesDeLaZone, nombreDepuis, photo, zoneChoisie } from "../especes.js";
import { champEspece, comparer, htmlCases, sansLeNom, EMOJI } from "../outils-jeux.js";
import { h, toast, aujourdhui, dateCourte } from "../ui.js";

const ESSAIS_PHOTO = 5;       // nombre d'essais avant de pouvoir voir la photo floue
const ESSAIS_DESCRIPTION = 8; // … et la description

// Jours écoulés depuis le 1er janvier 2026 (à midi, pour ne pas dépendre des heures d'été).
const numeroDuJour = (iso) => Math.round((new Date(iso + "T12:00:00") - new Date("2026-01-01T12:00:00")) / 86400000);
const veille = (iso) => new Date(new Date(iso + "T12:00:00") - 86400000).toLocaleDateString("sv-SE");

// Les espèces sont rangées dans un ordre mélangé fixe (le même partout), puis on avance
// d'une case par jour : pas de doublon avant d'avoir fait le tour de toutes.
async function especeDuJour(date) {
  const pool = (await especesDeLaZone()).filter((e) => e.tailleCm && e.zones?.length);
  const ordre = [...pool].sort((a, b) => nombreDepuis("recif" + a.id) - nombreDepuis("recif" + b.id));
  return ordre[((numeroDuJour(date) % ordre.length) + ordre.length) % ordre.length];
}

// Partie du jour : reprise si elle existe déjà (même si la zone a changé entre-temps).
export async function partieDuJour() {
  const date = aujourdhui();
  const enregistree = await db.lire("dujour", date);
  if (enregistree && espece(enregistree.espece)) return enregistree;
  const e = await especeDuJour(date);
  return { date, espece: e.id, zone: zoneChoisie(), essais: [], fini: false, trouve: false };
}

// Série : nombre de jours d'affilée où l'espèce a été trouvée, jusqu'à aujourd'hui
// (ou hier, si la partie du jour n'est pas encore gagnée : la série n'est pas perdue avant minuit).
export async function serie() {
  const parties = new Map((await db.tous("dujour")).map((p) => [p.date, p]));
  let jour = aujourdhui();
  if (!parties.get(jour)?.trouve) jour = veille(jour);
  let n = 0;
  while (parties.get(jour)?.trouve) { n++; jour = veille(jour); }
  return n;
}

export async function vueDuJour(main) {
  const { species } = await chargerEspeces();
  const partie = await partieDuJour();
  const cible = espece(partie.espece);
  // Si la zone a changé depuis le début de la partie, on laisse proposer toutes les espèces.
  const candidates = (partie.zone || "") === zoneChoisie() ? await especesDeLaZone() : species;
  const historique = (await db.tous("dujour")).filter((p) => p.date !== partie.date && espece(p.espece)).reverse().slice(0, 30);
  let indices = { photo: false, description: false };

  main.innerHTML = h`
    <a class="retour" href="#/jeux">‹ Jeux</a>
    <header class="entete"><div>
      <h1>Espèce du jour</h1>
      <p class="doux">${dateCourte(partie.date)}${partie.zone ? ` · ${partie.zone}` : ""}. Une nouvelle espèce chaque jour à minuit.</p>
    </div></header>
    <div id="etat"></div>
    <div id="saisie" class="pile-serree"></div>
    <div id="indices" class="pile-serree"></div>
    <div class="legende-cases doux">
      <span><i class="pastille oui"></i>identique</span>
      <span><i class="pastille proche"></i>en partie (famille : même ordre)</span>
      <span><i class="pastille non"></i>différent</span>
      <span>↑↓ l'espèce à trouver est plus grande / plus profonde, ou moins</span>
    </div>
    <ol class="propositions" id="propositions" reversed></ol>
    ${historique.length ? h`
      <section class="pile-serree" style="margin-top:32px">
        <h2>Les jours précédents</h2>
        <ul class="historique">${historique.map((p) => {
          const e = espece(p.espece);
          return h`<li><span class="doux">${dateCourte(p.date)}</span> <a href="#/especes/${e.id}">${e.fr}</a>
            <span class="${p.trouve ? "gagne" : "perdu"}">${p.trouve ? `trouvée en ${p.essais.length}` : p.fini ? "abandon" : "pas trouvée"}</span></li>`;
        })}</ul>
      </section>` : ""}
  `;

  const zoneEtat = main.querySelector("#etat");
  const zoneSaisie = main.querySelector("#saisie");
  const zoneIndices = main.querySelector("#indices");
  const liste = main.querySelector("#propositions");

  function afficherPropositions() {
    liste.innerHTML = h`${[...partie.essais].reverse().map((id) => {
      const e = espece(id);
      return h`<li class="proposition ${id === cible.id ? "gagnante" : ""}">
        <p><strong>${e.fr}</strong> <span class="latin">${e.la}</span></p>
        ${htmlCases(comparer(e, cible))}
      </li>`;
    })}`;
  }

  async function afficherIndices() {
    if (partie.fini) { zoneIndices.innerHTML = ""; return; }
    const n = partie.essais.length;
    zoneIndices.innerHTML = h`
      ${indices.photo ? h`<div class="vignette indice-photo" id="photo-floue">Chargement…</div>` : ""}
      ${indices.description ? h`<div class="indice">${sansLeNom(cible.indice || cible.desc, cible)}</div>` : ""}
      <div class="rangee-boutons">
        ${!indices.photo ? h`<button class="bouton second" id="voir-photo" ${n < ESSAIS_PHOTO ? h`disabled` : ""}>Photo floue${n < ESSAIS_PHOTO ? ` (dans ${ESSAIS_PHOTO - n} essai${ESSAIS_PHOTO - n > 1 ? "s" : ""})` : ""}</button>` : ""}
        ${!indices.description ? h`<button class="bouton second" id="voir-desc" ${n < ESSAIS_DESCRIPTION ? h`disabled` : ""}>Description${n < ESSAIS_DESCRIPTION ? ` (dans ${ESSAIS_DESCRIPTION - n})` : ""}</button>` : ""}
        ${n >= 3 ? h`<button class="bouton second" id="abandon">J'abandonne</button>` : ""}
      </div>`;
    zoneIndices.querySelector("#voir-photo")?.addEventListener("click", () => { indices.photo = true; afficherIndices(); });
    zoneIndices.querySelector("#voir-desc")?.addEventListener("click", () => { indices.description = true; afficherIndices(); });
    zoneIndices.querySelector("#abandon")?.addEventListener("click", async () => {
      if (!confirm("Abandonner ? La réponse s'affiche et la série repart de zéro.")) return;
      partie.fini = true;
      await db.ecrire("dujour", partie);
      toutAfficher();
    });
    if (indices.photo) {
      const p = await photo(cible).catch(() => null);
      const el = zoneIndices.querySelector("#photo-floue");
      if (el) el.innerHTML = p ? h`<img src="${p.url}" alt="Photo floue de l'espèce à trouver">` : "Pas de photo disponible";
    }
  }

  async function afficherEtat() {
    if (!partie.fini) {
      zoneEtat.innerHTML = partie.essais.length
        ? h`<p class="doux">${partie.essais.length} essai${partie.essais.length > 1 ? "s" : ""}. Continue !</p>`
        : h`<p>Propose une espèce au hasard pour commencer : chaque proposition t'indique ce qu'elle a en commun avec celle à trouver.</p>`;
      return;
    }
    const s = await serie();
    zoneEtat.innerHTML = h`
      <div class="resultat-jour ${partie.trouve ? "gagne" : "perdu"}">
        <a class="vignette" id="photo-cible" href="#/especes/${cible.id}">…</a>
        <div class="pile-serree">
          <p class="doux">${partie.trouve ? `Trouvée en ${partie.essais.length} essai${partie.essais.length > 1 ? "s" : ""} !` : "C'était :"}</p>
          <h2><a href="#/especes/${cible.id}">${cible.fr}</a></h2>
          <p class="latin">${cible.la}</p>
          <p>${partie.trouve ? `🔥 ${s} jour${s > 1 ? "s" : ""} d'affilée` : "Ta série repart à zéro demain."}</p>
          <button class="bouton" id="partager">Partager mon résultat</button>
        </div>
      </div>`;
    photo(cible).then((p) => {
      const el = zoneEtat.querySelector("#photo-cible");
      if (el) el.innerHTML = p ? h`<img src="${p.url}" alt="${cible.fr}">` : "";
    }).catch(() => {});
    zoneEtat.querySelector("#partager").addEventListener("click", () => partager(s));
  }

  async function partager(s) {
    const lignes = [...partie.essais].map((id) => comparer(espece(id), cible).map((c) => EMOJI[c.etat]).join(""));
    const texte = [
      `Récif · espèce du jour, ${dateCourte(partie.date)}`,
      partie.trouve ? `Trouvée en ${partie.essais.length} essai${partie.essais.length > 1 ? "s" : ""}${s ? ` 🔥 ${s}` : ""}` : "Pas trouvée cette fois",
      ...lignes,
    ].join("\n");
    if (navigator.share) {
      try { await navigator.share({ text: texte }); return; } catch (err) { if (err.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(texte); toast("Résultat copié"); } catch { toast("Partage impossible sur cet appareil"); }
  }

  function toutAfficher() {
    afficherEtat();
    afficherPropositions();
    afficherIndices();
    zoneSaisie.hidden = partie.fini;
  }

  champEspece(zoneSaisie, {
    especes: candidates,
    placeholder: "Propose une espèce",
    exclues: () => new Set(partie.essais),
    choisir: async (e) => {
      if (partie.fini) return;
      partie.essais.push(e.id);
      if (e.id === cible.id) { partie.fini = true; partie.trouve = true; }
      await db.ecrire("dujour", partie);
      toutAfficher();
      if (partie.trouve) window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });
  toutAfficher();
}
