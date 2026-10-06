// Écrans du carnet de plongée : liste, détail, formulaire d'ajout / modification.

import * as db from "../db.js";
import { chargerEspeces, espece, correspond } from "../especes.js";
import { h, brut, toast, dateLongue, dateCourte, duree, nombre, aujourdhui, miniProfil, grandProfil, lireFormulaire } from "../ui.js";

// Plongées triées de la plus ancienne à la plus récente, avec leur numéro dans le carnet.
export async function plongeesNumerotees() {
  const liste = await db.tous("plongees");
  liste.sort((a, b) => (a.date + (a.heure || "")).localeCompare(b.date + (b.heure || "")) || a.id - b.id);
  liste.forEach((p, i) => (p.numero = i + 1));
  return liste;
}

/* ---------------- Liste ---------------- */
export async function vueCarnet(main) {
  const plongees = await plongeesNumerotees();
  const total = plongees.reduce((s, p) => s + (Number(p.duree) || 0), 0);
  const plusProfond = Math.max(0, ...plongees.map((p) => Number(p.profMax) || 0));
  const especesVues = new Set(plongees.flatMap((p) => p.especes || []));

  const pluriel = (n, mot) => `${n} ${mot}${n > 1 ? "s" : ""}`;

  main.innerHTML = h`
    <header class="entete">
      <div>
        <h1>Carnet</h1>
      </div>
      ${plongees.length ? h`<a class="bouton" href="#/carnet/nouvelle">Ajouter</a>` : ""}
    </header>
    ${plongees.length
      ? h`
        <p class="bilan">
          <b>${pluriel(plongees.length, "plongée")}</b>, <b>${duree(total)}</b> sous l'eau,
          <b>${nombre(plusProfond)} m</b> au plus profond et <b>${pluriel(especesVues.size, "espèce")}</b> croisées.
        </p>
        <ol class="liste-plongees" reversed>
          ${[...plongees].reverse().map((p) => h`
            <li>
              <a class="plongee-ligne" href="#/carnet/${p.id}">
                <span class="plongee-num">${p.numero}</span>
                <span class="pile-serree">
                  <h3>${p.site || "Site sans nom"}</h3>
                  <p>${[dateCourte(p.date), p.profMax && `${nombre(p.profMax)} m`, p.duree && `${p.duree} min`].filter(Boolean).join(", ")}</p>
                </span>
                ${miniProfil(p.profMax, p.duree)}
              </a>
            </li>`)}
        </ol>`
      : h`
        <div class="vide pile">
          <h2>Ta première plongée t'attend</h2>
          <p class="doux">Note le site, la profondeur, la durée et les espèces croisées. Tout reste sur ce téléphone, même sans réseau.</p>
          <a class="bouton" href="#/carnet/nouvelle">Ajouter une plongée</a>
        </div>`}
  `;
}

/* ---------------- Détail ---------------- */
export async function vuePlongee(main, { id }) {
  await chargerEspeces();
  const plongees = await plongeesNumerotees();
  const p = plongees.find((x) => x.id === Number(id));
  if (!p) { location.hash = "#/carnet"; return; }

  const mesures = [
    ["Profondeur max", p.profMax && `${nombre(p.profMax)} m`],
    ["Durée", p.duree && `${p.duree} min`],
    ["Heure d'immersion", p.heure],
    ["Eau", p.temperature && `${nombre(p.temperature)} °C`],
    ["Visibilité", p.visibilite && `${nombre(p.visibilite)} m`],
    ["Binôme", p.binome],
    ["Lieu", p.lieu],
  ].filter(([, v]) => v);
  const profil = grandProfil(p.profMax, p.duree);
  const vues = (p.especes || []).map(espece).filter(Boolean);

  main.innerHTML = h`
    <a class="retour" href="#/carnet">‹ Carnet</a>
    <header class="pile-serree">
      <p class="doux">Plongée n° ${p.numero}, ${dateLongue(p.date)}</p>
      <h1>${p.site || "Site sans nom"}</h1>
    </header>

    ${profil ? h`
      <section class="profil" aria-label="Profil de la plongée">
        <div class="legende">
          <div><span class="chiffre">${nombre(p.profMax)} m</span><small>au plus profond</small></div>
          <div style="text-align:right"><span class="chiffre">${p.duree}′</span><small>sous l'eau</small></div>
        </div>
        ${profil}
        <p class="note">Profil indicatif, reconstitué à partir de la profondeur et de la durée.</p>
      </section>` : h`<hr>`}

    <div class="pile">
      ${mesures.length ? h`<dl class="fiche-mesures">${mesures.map(([k, v]) => h`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>` : ""}

      ${vues.length ? h`
        <section class="pile-serree">
          <h2>Espèces croisées</h2>
          <div class="puces">${vues.map((e) => h`<a class="puce" href="#/especes/${e.id}">${e.fr}</a>`)}</div>
        </section>` : ""}

      ${p.notes ? h`<section class="pile-serree"><h2>Notes</h2><p style="white-space:pre-line">${p.notes}</p></section>` : ""}

      <div class="rangee-boutons" style="margin-top:28px">
        <a class="bouton second" href="#/carnet/${p.id}/modifier">Modifier</a>
        <button class="bouton danger" id="supprimer">Supprimer</button>
      </div>
    </div>
  `;

  main.querySelector("#supprimer").addEventListener("click", async () => {
    if (!confirm(`Supprimer la plongée n° ${p.numero} (${p.site || "sans nom"}) ? Cette action est définitive.`)) return;
    await db.supprimer("plongees", p.id);
    toast("Plongée supprimée");
    location.hash = "#/carnet";
  });
}

/* ---------------- Formulaire ---------------- */
export async function vueFormulaire(main, { id }) {
  const { species } = await chargerEspeces();
  const existante = id ? await db.lire("plongees", Number(id)) : null;
  if (id && !existante) { location.hash = "#/carnet"; return; }

  // Pour une nouvelle plongée, on pré-remplit avec le dernier site et le dernier binôme.
  let derniere = null;
  if (!existante) {
    const liste = await plongeesNumerotees();
    derniere = liste[liste.length - 1] || null;
  }
  const p = existante || { date: aujourdhui(), lieu: derniere?.lieu || "", binome: derniere?.binome || "", especes: [] };
  const choisies = new Set(p.especes || []);

  const champ = (nom, libelle, type = "text", options = "") => h`
    <label class="champ"><span>${libelle}</span>
      <input type="${type}" name="${nom}" value="${p[nom] ?? ""}" ${brut(options)}>
    </label>`;
  const champNombre = (nom, libelle, unite, attrs) => h`
    <label class="champ"><span>${libelle}</span>
      <span class="suffixe"><input type="number" inputmode="decimal" name="${nom}" value="${p[nom] ?? ""}" ${brut(attrs)}><em>${unite}</em></span>
    </label>`;

  main.innerHTML = h`
    <a class="retour" href="${existante ? `#/carnet/${existante.id}` : "#/carnet"}">‹ Annuler</a>
    <h1>${existante ? "Modifier la plongée" : "Nouvelle plongée"}</h1>
    <form class="pile" style="margin-top:20px" novalidate>
      ${champ("site", "Site", "text", 'required autocomplete="off" placeholder="Ex. Tombant de la Pointe du Dugon"')}
      ${champ("lieu", "Lieu", "text", 'autocomplete="off" placeholder="Ex. Banyuls-sur-Mer"')}
      <div class="grille-2">
        ${champ("date", "Date", "date", "required")}
        ${champ("heure", "Heure d'immersion", "time")}
      </div>
      <div class="grille-2">
        ${champNombre("profMax", "Profondeur max", "m", 'min="0" max="150" step="0.1"')}
        ${champNombre("duree", "Durée", "min", 'min="0" max="600" step="1"')}
      </div>
      <div class="grille-2">
        ${champNombre("temperature", "Température de l'eau", "°C", 'min="-2" max="40" step="0.5"')}
        ${champNombre("visibilite", "Visibilité", "m", 'min="0" max="80" step="1"')}
      </div>
      ${champ("binome", "Binôme", "text", 'autocomplete="off"')}

      <fieldset class="champ" style="border:0;padding:0;margin-top:16px">
        <legend style="font-weight:700;font-size:.9rem;margin-bottom:6px">Espèces croisées</legend>
        <div class="puces" id="choisies"></div>
        <input type="search" id="cherche-espece" placeholder="Chercher une espèce (ex. mérou, poulpe)" style="margin-top:10px" autocomplete="off">
        <div class="recherche-especes" id="resultats" role="group" aria-label="Résultats"></div>
      </fieldset>

      <label class="champ"><span>Notes</span>
        <textarea name="notes" placeholder="Courant, ambiance, moments forts…">${p.notes || ""}</textarea>
      </label>

      <button class="bouton large" type="submit">${existante ? "Enregistrer les modifications" : "Enregistrer la plongée"}</button>
    </form>
  `;

  const zoneChoisies = main.querySelector("#choisies");
  const zoneResultats = main.querySelector("#resultats");
  const recherche = main.querySelector("#cherche-espece");

  function afficherChoisies() {
    zoneChoisies.innerHTML = choisies.size
      ? h`${[...choisies].map(espece).filter(Boolean).map((e) => h`<button type="button" class="puce active" data-id="${e.id}" aria-label="Retirer ${e.fr}">${e.fr} ✕</button>`)}`
      : h`<p class="doux" style="font-size:.9rem">Aucune pour l'instant.</p>`;
  }
  function afficherResultats() {
    const trouvees = species.filter((e) => correspond(e, recherche.value));
    zoneResultats.innerHTML = trouvees.length
      ? h`${trouvees.map((e) => h`<button type="button" data-id="${e.id}" aria-pressed="${String(choisies.has(e.id))}"><span>${e.fr} <span class="latin">${e.la}</span></span></button>`)}`
      : h`<p class="doux" style="padding:12px 14px">Aucune espèce ne correspond.</p>`;
  }
  function basculer(idEspece) {
    choisies.has(idEspece) ? choisies.delete(idEspece) : choisies.add(idEspece);
    afficherChoisies();
    afficherResultats();
  }
  zoneChoisies.addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (b) basculer(b.dataset.id); });
  zoneResultats.addEventListener("click", (ev) => { const b = ev.target.closest("button"); if (b) basculer(b.dataset.id); });
  recherche.addEventListener("input", afficherResultats);
  afficherChoisies();
  afficherResultats();

  main.querySelector("form").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const f = lireFormulaire(ev.target);
    if (!f.site.trim()) { toast("Indique le nom du site"); ev.target.site.focus(); return; }
    if (!f.date) { toast("Indique la date de la plongée"); ev.target.date.focus(); return; }
    const nombreOuVide = (v) => (v === "" ? "" : Number(v));
    const plongee = {
      ...(existante || {}),
      site: f.site.trim(),
      lieu: f.lieu.trim(),
      date: f.date,
      heure: f.heure,
      profMax: nombreOuVide(f.profMax),
      duree: nombreOuVide(f.duree),
      temperature: nombreOuVide(f.temperature),
      visibilite: nombreOuVide(f.visibilite),
      binome: f.binome.trim(),
      notes: f.notes.trim(),
      especes: [...choisies],
      modifieeLe: new Date().toISOString(),
    };
    if (!existante) plongee.creeeLe = plongee.modifieeLe;
    const nouvelId = await db.ecrire("plongees", plongee);
    toast(existante ? "Modifications enregistrées" : "Plongée enregistrée");
    location.hash = `#/carnet/${existante ? existante.id : nouvelId}`;
  });
}
