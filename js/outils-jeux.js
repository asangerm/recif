// Outils partagés par les jeux : champ pour proposer une espèce, choix de la zone,
// comparaison de deux espèces (vert / orange / rouge) et petits utilitaires.

import { h, nombre } from "./ui.js";
import { chargerEspeces, correspond, normaliser, zoneChoisie, choisirZone } from "./especes.js";

/* ---------------- Champ « propose une espèce » ----------------
   Une recherche avec suggestions : on tape quelques lettres, on touche la bonne espèce.
   choisir(e) est appelé avec l'espèce touchée (ou la première suggestion avec Entrée). */
export function champEspece(conteneur, { especes, exclues = () => new Set(), placeholder = "Nom français ou latin", choisir }) {
  conteneur.innerHTML = h`
    <input type="search" class="champ-espece" placeholder="${placeholder}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="${placeholder}">
    <div class="suggestions" role="listbox" aria-label="Suggestions"></div>`;
  const champ = conteneur.querySelector("input");
  const liste = conteneur.querySelector(".suggestions");
  let trouvees = [];

  function afficher() {
    const q = champ.value.trim();
    const deja = exclues();
    trouvees = q ? especes.filter((e) => !deja.has(e.id) && correspond(e, q)).slice(0, 8) : [];
    liste.innerHTML = h`${trouvees.map((e) => h`<button type="button" role="option" data-id="${e.id}"><span>${e.fr}</span> <span class="latin">${e.la}</span></button>`)}`;
  }
  function valider(e) {
    champ.value = "";
    afficher();
    choisir(e);
  }
  champ.addEventListener("input", afficher);
  champ.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && trouvees[0]) { ev.preventDefault(); valider(trouvees[0]); }
  });
  liste.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (b) valider(trouvees.find((e) => e.id === b.dataset.id));
  });
  return { champ, vider: () => { champ.value = ""; afficher(); } };
}

/* ---------------- Choix de la zone ---------------- */
export async function htmlZone() {
  const { zones } = await chargerEspeces();
  const z = zoneChoisie();
  return h`
    <label class="choix-zone"><span>Où plonges-tu ?</span>
      <select id="zone">
        <option value="" ${z ? "" : h`selected`}>Partout dans le monde</option>
        ${zones.map((x) => h`<option value="${x.nom}" ${x.nom === z ? h`selected` : ""}>${x.nom} (${x.exemples})</option>`)}
      </select>
    </label>`;
}
export function brancherZone(main, apresChangement) {
  main.querySelector("#zone")?.addEventListener("change", (ev) => {
    choisirZone(ev.target.value);
    apresChangement();
  });
}

/* ---------------- Comparaison de deux espèces ---------------- */
const ZONES_COURTES = {
  "Méditerranée": "Médit.",
  "Atlantique Nord-Est": "Atl. NE",
  "Atlantique tropical Est": "Atl. tropical",
  "Caraïbes": "Caraïbes",
  "Océan Indien": "Indien",
  "Pacifique Ouest": "Pacif. Ouest",
  "Pacifique Est": "Pacif. Est",
};

export const texteTaille = (cm) => (cm >= 100 ? `${nombre(Math.round(cm / 10) / 10)} m` : `${nombre(Math.round(cm * 10) / 10)} cm`);
export const texteProf = (m) => `${nombre(Math.round(m))} m`;

function comparerListes(a = [], b = []) {
  const commun = a.filter((x) => b.includes(x));
  if (commun.length === a.length && a.length === b.length) return "oui";
  return commun.length ? "proche" : "non";
}
function comparerNombres(prop, cible) {
  const rapport = Math.max(prop, cible) / Math.min(prop, cible);
  return {
    etat: rapport <= 1.1 ? "oui" : rapport <= 1.5 ? "proche" : "non",
    fleche: rapport <= 1.1 ? "" : cible > prop ? "↑" : "↓", // ↑ : l'espèce à trouver est plus grande / plus profonde
  };
}

// Une case par caractéristique : { nom, texte, etat: "oui" | "proche" | "non" | "inconnu", fleche }
export function comparer(prop, cible) {
  const inconnu = (nom) => ({ nom, texte: "?", etat: "inconnu", fleche: "" });
  const cases = [];
  cases.push({ nom: "Groupe", texte: prop.groupe, etat: prop.groupe === cible.groupe ? "oui" : "non", fleche: "" });

  if (!prop.famille || !cible.famille) cases.push(inconnu("Famille"));
  else cases.push({
    nom: "Famille", texte: prop.famille, fleche: "",
    // orange : même ordre, donc cousines (ex. deux Perciformes de familles différentes)
    etat: prop.famille === cible.famille ? "oui" : prop.ordre && prop.ordre === cible.ordre ? "proche" : "non",
  });

  cases.push(prop.habitats?.length && cible.habitats?.length
    ? { nom: "Habitat", texte: prop.habitats.join(", "), etat: comparerListes(prop.habitats, cible.habitats), fleche: "" }
    : inconnu("Habitat"));
  cases.push(prop.regime && cible.regime
    ? { nom: "Régime", texte: prop.regime, etat: prop.regime === cible.regime ? "oui" : "non", fleche: "" }
    : inconnu("Régime"));
  cases.push(prop.zones?.length && cible.zones?.length
    ? { nom: "Zones", texte: prop.zones.map((z) => ZONES_COURTES[z] || z).join(", "), etat: comparerListes(prop.zones, cible.zones), fleche: "" }
    : inconnu("Zones"));
  cases.push(prop.tailleCm && cible.tailleCm
    ? { nom: "Taille", texte: texteTaille(prop.tailleCm), ...comparerNombres(prop.tailleCm, cible.tailleCm) }
    : inconnu("Taille"));
  cases.push(prop.profMax && cible.profMax
    ? { nom: "Prof. max", texte: texteProf(prop.profMax), ...comparerNombres(prop.profMax, cible.profMax) }
    : inconnu("Prof. max"));
  return cases;
}

export const EMOJI = { oui: "🟩", proche: "🟨", non: "🟥", inconnu: "⬜" };
const SYMBOLE = { oui: "✓", proche: "≈", non: "✗", inconnu: "" }; // en plus de la couleur, pour qui distingue mal le vert du rouge

export function htmlCases(cases) {
  return h`<div class="cases">${cases.map((c) => h`
    <div class="case ${c.etat}">
      <small>${c.nom}</small>
      <span>${c.texte}</span>
      <b aria-hidden="true">${c.fleche || SYMBOLE[c.etat]}</b>
      <span class="lecteur">${{ oui: "identique", proche: "en partie", non: "différent", inconnu: "inconnu" }[c.etat]}${c.fleche === "↑" ? ", l'espèce à trouver est au-dessus" : c.fleche === "↓" ? ", l'espèce à trouver est en dessous" : ""}</span>
    </div>`)}</div>`;
}

/* ---------------- Description sans le nom ----------------
   Pour donner la description comme indice sans révéler la réponse. */
const MOTS_COURANTS = new Set(["poisson", "commun", "commune", "grand", "grande", "petit", "petite", "rouge", "blanc", "blanche", "noir", "noire", "brun", "brune", "jaune", "bleu", "bleue", "vert", "verte", "méditerranée"]);
export function sansLeNom(texte, e) {
  if (!texte) return "";
  const mots = new Set([e.fr, e.la, e.la.split(" ")[0], ...e.fr.split(/[\s'’-]+/).filter((m) => m.length >= 5 && !MOTS_COURANTS.has(normaliser(m)))]);
  let t = texte;
  for (const m of [...mots].sort((a, b) => b.length - a.length)) {
    const motif = new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    t = t.replace(motif, "…");
  }
  return t;
}

/* ---------------- Hasard ---------------- */
export function melanger(t) {
  const r = [...t];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

// Petit mot affiché en tête des jeux quand une zone est choisie.
export function rappelZone(nb) {
  const z = zoneChoisie();
  return z ? h`<p class="doux">${nb} espèces de la zone ${z}. <a href="#/jeux">Changer</a></p>` : "";
}
