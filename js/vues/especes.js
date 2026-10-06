// Écrans des espèces : liste avec recherche et filtres, puis fiche détaillée.

import * as db from "../db.js";
import { chargerEspeces, espece, correspond, remplirVignette, photo } from "../especes.js";
import { h, dateCourte } from "../ui.js";
import { plongeesNumerotees } from "./carnet.js";

// L'état des filtres est gardé en mémoire pour le retrouver en revenant d'une fiche.
const etat = { requete: "", groupe: "Toutes" };

// Compte combien de fois chaque espèce a été notée dans le carnet.
async function compterVues() {
  const compte = new Map();
  for (const p of await db.tous("plongees")) for (const id of p.especes || []) compte.set(id, (compte.get(id) || 0) + 1);
  return compte;
}

// Charge les photos seulement quand la vignette arrive à l'écran.
const observateur = "IntersectionObserver" in window
  ? new IntersectionObserver((entrees) => {
      for (const ent of entrees) {
        if (!ent.isIntersecting) continue;
        observateur.unobserve(ent.target);
        remplirVignette(ent.target, espece(ent.target.dataset.id));
      }
    }, { rootMargin: "200px" })
  : null;

export async function vueEspeces(main) {
  const { species, groups, region } = await chargerEspeces();
  const vues = await compterVues();
  const filtres = ["Toutes", "Déjà croisées", ...groups.filter((g) => species.some((e) => e.groupe === g))];

  main.innerHTML = h`
    <header class="entete"><div>
      <h1>Espèces</h1>
      <p class="doux">${species.length} espèces de ${region}</p>
    </div></header>
    <input type="search" id="recherche" placeholder="Nom français ou latin" value="${etat.requete}" aria-label="Chercher une espèce" autocomplete="off">
    <div class="filtres" role="group" aria-label="Filtrer par groupe">
      ${filtres.map((f) => h`<button type="button" class="puce" data-groupe="${f}" aria-pressed="${String(etat.groupe === f)}">${f}</button>`)}
    </div>
    <ul class="grille-especes" id="grille"></ul>
  `;

  const grille = main.querySelector("#grille");
  function afficher() {
    const liste = species.filter((e) =>
      correspond(e, etat.requete) &&
      (etat.groupe === "Toutes" || (etat.groupe === "Déjà croisées" ? vues.has(e.id) : e.groupe === etat.groupe)));

    if (!liste.length) {
      grille.innerHTML = h`<li class="doux" style="grid-column:1/-1">${etat.groupe === "Déjà croisées" && !vues.size
        ? "Les espèces notées dans ton carnet apparaîtront ici."
        : "Aucune espèce ne correspond à ta recherche."}</li>`;
      return;
    }
    grille.innerHTML = h`${liste.map((e) => h`
      <li><a class="carte-espece" href="#/especes/${e.id}">
        <div class="vignette" data-id="${e.id}">${vues.has(e.id) ? h`<span class="marque-vue">Vue ×${vues.get(e.id)}</span>` : ""}</div>
        <h3>${e.fr}</h3>
        <p class="latin">${e.la}</p>
      </a></li>`)}`;
    grille.querySelectorAll(".vignette").forEach((v) => observateur ? observateur.observe(v) : remplirVignette(v, espece(v.dataset.id)));
  }

  main.querySelector("#recherche").addEventListener("input", (ev) => { etat.requete = ev.target.value; afficher(); });
  main.querySelector(".filtres").addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    etat.groupe = b.dataset.groupe;
    main.querySelectorAll(".filtres button").forEach((x) => x.setAttribute("aria-pressed", x === b));
    afficher();
  });
  afficher();
}

export async function vueFiche(main, { id }) {
  await chargerEspeces();
  const e = espece(id);
  if (!e) { location.hash = "#/especes"; return; }

  const plongees = (await plongeesNumerotees()).filter((p) => (p.especes || []).includes(e.id)).reverse();
  const quiz = await db.lire("quiz", e.id);

  main.innerHTML = h`
    <a class="retour" href="#/especes">‹ Espèces</a>
    <div class="vignette photo-fiche" id="photo">Chargement de la photo…</div>
    <p class="credit" id="credit"></p>

    <div class="pile" style="margin-top:18px">
      <header class="pile-serree">
        <h1 style="font-size:2.1rem">${e.fr}</h1>
        <p class="latin" style="font-size:1.1rem">${e.la}</p>
        <div class="rangee-boutons" style="margin-top:10px;gap:6px">
          <span class="badge">${e.groupe}</span>
          ${e.protege ? h`<span class="badge sensible">Espèce protégée ou sensible</span>` : ""}
        </div>
      </header>

      <p>${e.desc}</p>
      <div class="indice"><strong>Pour la reconnaître</strong><br>${e.indice}</div>

      <dl class="fiche-mesures">
        <div><dt>Taille</dt><dd>${e.taille}</dd></div>
        <div><dt>Profondeur</dt><dd>${e.prof}</dd></div>
        ${quiz ? h`<div><dt>Au quiz</dt><dd>${quiz.justes} bonne${quiz.justes > 1 ? "s" : ""} réponse${quiz.justes > 1 ? "s" : ""} sur ${quiz.justes + quiz.fausses}</dd></div>` : ""}
      </dl>

      <section class="pile-serree">
        <h2>Dans ton carnet</h2>
        ${plongees.length
          ? h`<div class="puces">${plongees.map((p) => h`<a class="puce" href="#/carnet/${p.id}">n° ${p.numero}, ${p.site}, ${dateCourte(p.date)}</a>`)}</div>`
          : h`<p class="doux">Pas encore croisée. Ajoute-la à une plongée quand tu la verras.</p>`}
      </section>
    </div>
  `;

  const zonePhoto = main.querySelector("#photo");
  const p = await photo(e).catch(() => null);
  if (!p) { zonePhoto.textContent = navigator.onLine ? "Pas de photo trouvée" : "Photo disponible une fois connectée"; return; }
  zonePhoto.innerHTML = h`<img src="${p.url}" alt="${e.fr} (${e.la})">`;
  main.querySelector("#credit").innerHTML = p.page
    ? h`Photo : ${p.credit}, <a href="${p.page}" target="_blank" rel="noopener">source</a>`
    : h`Photo : ${p.credit}`;
}
