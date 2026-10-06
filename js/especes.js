// Données des espèces + récupération des photos.
//
// Les photos ne sont pas livrées avec l'appli : on les cherche en ligne la première fois
// (iNaturalist, sinon Wikipédia), puis on garde l'image dans IndexedDB pour le hors-ligne.

import * as db from "./db.js";

let donnees;           // contenu de data/species.json
const index = new Map(); // id -> espèce

export async function chargerEspeces() {
  if (!donnees) {
    const rep = await fetch("data/species.json");
    donnees = await rep.json();
    donnees.species.sort((a, b) => a.fr.localeCompare(b.fr, "fr"));
    donnees.species.forEach((e) => index.set(e.id, e));
  }
  return donnees;
}

export const espece = (id) => index.get(id);

// Recherche tolérante : ignore majuscules et accents, cherche dans le nom français et latin.
export const normaliser = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
export function correspond(e, requete) {
  const q = normaliser(requete.trim());
  return !q || normaliser(e.fr).includes(q) || normaliser(e.la).includes(q);
}

/* ---------------- Photos ---------------- */

const enMemoire = new Map(); // id -> { url, credit, page } déjà résolu pendant la session
const RECHERCHE_ABSENTE_APRES_JOURS = 7;

// File d'attente : au plus 2 recherches réseau en même temps, pour rester poli avec les API.
let actives = 0;
const enAttente = [];
function limiter(tache) {
  return new Promise((resoudre, rejeter) => {
    enAttente.push({ tache, resoudre, rejeter });
    suivante();
  });
}
function suivante() {
  if (actives >= 2 || !enAttente.length) return;
  const { tache, resoudre, rejeter } = enAttente.shift();
  actives++;
  tache().then(resoudre, rejeter).finally(() => { actives--; suivante(); });
}

async function viaINaturalist(e) {
  const url = `https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(e.la)}&rank=species&per_page=5`;
  const rep = await fetch(url);
  if (!rep.ok) return null;
  const { results = [] } = await rep.json();
  const taxon = results.find((t) => t.name?.toLowerCase() === e.la.toLowerCase() && t.default_photo);
  if (!taxon) return null;
  // Seules les photos sous licence libre (license_code rempli) sont téléchargeables :
  // les autres sont « tous droits réservés » et leur serveur refuse qu'on les enregistre.
  let p = taxon.default_photo;
  if (!p.license_code) {
    const detail = await fetch(`https://api.inaturalist.org/v1/taxa/${taxon.id}`);
    if (!detail.ok) return null;
    const photos = (await detail.json()).results?.[0]?.taxon_photos ?? [];
    p = photos.map((tp) => tp.photo).find((ph) => ph.license_code);
    if (!p) return null;
  }
  return {
    url: p.medium_url || p.url,
    credit: p.attribution || "iNaturalist",
    page: `https://www.inaturalist.org/taxa/${taxon.id}`,
  };
}

async function viaWikipedia(e, langue) {
  const titre = encodeURIComponent(e.la.replace(/ /g, "_"));
  const rep = await fetch(`https://${langue}.wikipedia.org/api/rest_v1/page/summary/${titre}`);
  if (!rep.ok) return null;
  const json = await rep.json();
  const src = json.thumbnail?.source;
  if (!src) return null;
  // Wikimedia n'accepte que certaines largeurs (500 en fait partie, pas 640).
  // Si l'image d'origine est plus petite, on la prend telle quelle.
  const origine = json.originalimage;
  return {
    url: origine && origine.width <= 500 ? origine.source : src.replace(/\/\d+px-/, "/500px-"),
    credit: "Wikipédia / Wikimedia Commons",
    page: json.content_urls?.desktop?.page,
  };
}

// Essaie les sources dans l'ordre et garde la première image qu'on arrive à télécharger.
// Si aucune ne se télécharge, renvoie quand même la première trouvée (affichée depuis Internet).
async function chercherPhoto(e) {
  let premiere = null;
  for (const essai of [() => viaINaturalist(e), () => viaWikipedia(e, "fr"), () => viaWikipedia(e, "en")]) {
    try {
      const source = await essai();
      if (!source) continue;
      premiere ??= source;
      const rep = await fetch(source.url, { mode: "cors" });
      if (rep.ok) return { ...source, blob: await rep.blob() };
    } catch { /* on passe à la source suivante */ }
  }
  return premiere;
}

/**
 * Renvoie { url, credit, page } pour afficher la photo d'une espèce, ou null.
 * L'url est soit une image locale (blob, marche hors-ligne), soit l'image distante
 * si le téléchargement local n'a pas été possible.
 * forcer : relance la recherche même si aucune photo n'avait été trouvée récemment.
 */
export async function photo(e, { forcer = false } = {}) {
  // forcer : on ne se contente pas d'une photo seulement affichée depuis Internet.
  if (enMemoire.has(e.id) && (!forcer || enMemoire.get(e.id).locale)) return enMemoire.get(e.id);

  const stockee = await db.lire("photos", e.id);
  if (stockee?.blob) {
    const r = { url: URL.createObjectURL(stockee.blob), credit: stockee.credit, page: stockee.page, locale: true };
    enMemoire.set(e.id, r);
    return r;
  }
  const ilYAJours = (d) => (Date.now() - d) / 86400000;
  if (!forcer && stockee?.absente && ilYAJours(stockee.date) < RECHERCHE_ABSENTE_APRES_JOURS) return null;
  if (!navigator.onLine) return null;

  return limiter(async () => {
    const source = await chercherPhoto(e);
    if (!source) {
      await db.ecrire("photos", { id: e.id, absente: true, date: Date.now() });
      return null;
    }
    let r = { url: source.url, credit: source.credit, page: source.page, locale: false };
    if (source.blob) {
      await db.ecrire("photos", { id: e.id, blob: source.blob, credit: source.credit, page: source.page });
      r = { url: URL.createObjectURL(source.blob), credit: source.credit, page: source.page, locale: true };
    }
    enMemoire.set(e.id, r);
    return r;
  });
}

// Remplit un élément .vignette avec la photo dès qu'elle est disponible.
export function remplirVignette(el, e) {
  photo(e).then((p) => {
    if (!p) { el.textContent = "Pas de photo"; return; }
    const img = new Image();
    img.alt = `${e.fr} (${e.la})`;
    img.loading = "lazy";
    img.src = p.url;
    el.replaceChildren(...[img, ...el.querySelectorAll(".marque-vue")]);
  }).catch(() => { el.textContent = "Pas de photo"; });
}

// Nombre de photos déjà enregistrées pour le hors-ligne.
export async function photosLocales() {
  const toutes = await db.tous("photos");
  return toutes.filter((p) => p.blob).length;
}
