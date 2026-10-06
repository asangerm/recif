// Point d'entrée : choisit l'écran à afficher selon l'adresse (#/carnet, #/especes/…).
// Le "routeur" est volontairement minimal : une liste de motifs et la fonction à appeler.

import { vueCarnet, vuePlongee, vueFormulaire } from "./vues/carnet.js";
import { vueEspeces, vueFiche } from "./vues/especes.js";
import { vueQuiz } from "./vues/quiz.js";
import { vueReglages } from "./vues/reglages.js";
import { demanderStockagePersistant } from "./db.js";
import { DEDICACE, SIGNATURE } from "./config.js";
import { h } from "./ui.js";

const routes = [
  [/^#\/carnet$/, vueCarnet, "carnet"],
  [/^#\/carnet\/nouvelle$/, vueFormulaire, "carnet"],
  [/^#\/carnet\/(?<id>\d+)$/, vuePlongee, "carnet"],
  [/^#\/carnet\/(?<id>\d+)\/modifier$/, vueFormulaire, "carnet"],
  [/^#\/especes$/, vueEspeces, "especes"],
  [/^#\/especes\/(?<id>[\w-]+)$/, vueFiche, "especes"],
  [/^#\/quiz$/, vueQuiz, "quiz"],
  [/^#\/reglages$/, vueReglages, "reglages"],
];

let main = document.getElementById("vue");

// Numéro du dernier affichage demandé : si un écran lent finit après un autre demandé
// plus tard, il ne doit pas l'écraser. On dessine donc dans un élément à part,
// qu'on ne met en place que si on est toujours le dernier affichage demandé.
let dernierAffichage = 0;

async function afficher() {
  const numero = ++dernierAffichage;
  const adresse = location.hash || "#/carnet";
  const route = routes.find(([motif]) => motif.test(adresse));
  if (!route) { location.replace("#/carnet"); return; }
  const [motif, vue, onglet] = route;

  document.querySelectorAll(".onglets a").forEach((a) => {
    if (a.dataset.onglet === onglet) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });

  const nouveau = main.cloneNode(false); // même <main id="vue">, mais vide
  try {
    await vue(nouveau, adresse.match(motif).groups || {});
  } catch (err) {
    console.error(err);
    nouveau.innerHTML = h`<div class="vide pile"><h2>Cet écran n'a pas pu s'afficher</h2><p class="doux">${err.message}</p><a class="bouton" href="#/carnet">Revenir au carnet</a></div>`;
  }
  if (numero !== dernierAffichage) return; // un écran plus récent a été demandé entre-temps
  main.replaceWith(nouveau);
  main = nouveau;
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

// Message du premier lancement (voir js/config.js).
function dedicace() {
  if (!DEDICACE || localStorageSur("recif-dedicace-vue")) return false;
  main.innerHTML = h`
    <div class="dedicace">
      <p>${DEDICACE}</p>
      ${SIGNATURE ? h`<p class="doux" style="font-size:1.1rem">${SIGNATURE}</p>` : ""}
      <button class="bouton" id="entrer" style="align-self:start">Ouvrir mon carnet</button>
    </div>`;
  main.querySelector("#entrer").addEventListener("click", () => {
    localStorageSur("recif-dedicace-vue", "1");
    afficher();
  });
  return true;
}
function localStorageSur(cle, valeur) {
  try {
    if (valeur === undefined) return localStorage.getItem(cle);
    localStorage.setItem(cle, valeur);
  } catch { return null; }
}

window.addEventListener("hashchange", afficher);
// Toucher l'onglet de l'écran déjà dans l'adresse ne change pas l'adresse, donc pas de
// hashchange : on redessine quand même (utile si l'écran affiché ne correspond plus).
document.querySelector(".onglets").addEventListener("click", (ev) => {
  const lien = ev.target.closest("a");
  if (lien && lien.hash === location.hash) afficher();
});
if (!dedicace()) afficher();
demanderStockagePersistant();

// Service worker : permet à l'appli de s'ouvrir sans réseau.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker non enregistré", err));
}
