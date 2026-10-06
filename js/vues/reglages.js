// Réglages : photos hors-ligne, sauvegarde du carnet et des jeux, remise à zéro du quiz.

import * as db from "../db.js";
import { especesDeLaZone, photo, photosLocales, zoneChoisie } from "../especes.js";
import { h, toast, aujourdhui } from "../ui.js";

export const VERSION_APP = "1.1.0";

export async function vueReglages(main) {
  // Les photos à télécharger sont celles de la zone choisie dans Jeux ou Espèces (toutes sinon).
  const species = await especesDeLaZone();
  const zone = zoneChoisie();
  const nbPhotos = await photosLocales(species);
  const nbPlongees = (await db.tous("plongees")).length;
  const persistant = navigator.storage?.persisted ? await navigator.storage.persisted() : false;

  main.innerHTML = h`
    <header class="entete"><h1>Réglages</h1></header>

    <section class="pile">
      <h2>Photos hors-ligne</h2>
      <p>${zone ? `Zone choisie : ${zone}.` : "Toutes les zones."} <a href="#/jeux">Changer</a></p>
      <p class="doux" id="etat-photos">${nbPhotos} photo${nbPhotos > 1 ? "s" : ""} sur ${species.length} enregistrée${nbPhotos > 1 ? "s" : ""} sur ce téléphone.</p>
      <div class="barre"><div id="progres-photos" style="width:${Math.round((100 * nbPhotos) / species.length)}%"></div></div>
      <p class="doux">À faire une fois en wifi, avant de partir : les jeux auront ensuite toutes leurs photos sans réseau. Compte environ 30 Mo pour toutes les zones.</p>
      <button class="bouton" id="telecharger" ${nbPhotos >= species.length ? h`disabled` : ""}>
        ${nbPhotos >= species.length ? "Toutes les photos sont enregistrées" : "Télécharger les photos"}
      </button>
    </section>

    <hr>

    <section class="pile">
      <h2>Sauvegarde du carnet</h2>
      <p class="doux">Ton carnet (${nbPlongees} plongée${nbPlongees > 1 ? "s" : ""}) vit uniquement sur ce téléphone. Exporte-le de temps en temps et garde le fichier en lieu sûr.</p>
      <div class="rangee-boutons">
        <button class="bouton" id="exporter">Exporter le carnet</button>
        <button class="bouton second" id="importer">Importer une sauvegarde</button>
        <input type="file" id="fichier-import" accept="application/json,.json" hidden>
      </div>
      ${persistant ? "" : h`<p class="doux" style="font-size:.9rem">Astuce : installe Récif sur l'écran d'accueil pour que le téléphone ne fasse pas le ménage dans tes données.</p>`}
    </section>

    <hr>

    <section class="pile">
      <h2>Quiz</h2>
      <button class="bouton danger" id="raz-quiz">Remettre le quiz à zéro</button>
    </section>

    <hr>
    <p class="doux" style="font-size:.85rem">Récif, version ${VERSION_APP}. Photos : iNaturalist et Wikimedia Commons, sous licence de leurs auteurs.</p>
  `;

  /* -- Téléchargement des photos -- */
  main.querySelector("#telecharger")?.addEventListener("click", async (ev) => {
    const bouton = ev.target;
    if (!navigator.onLine) { toast("Connecte-toi à Internet pour télécharger les photos"); return; }
    bouton.disabled = true;
    let faites = 0;
    const barre = main.querySelector("#progres-photos");
    const etat = main.querySelector("#etat-photos");
    for (const e of species) {
      bouton.textContent = `Téléchargement… ${faites}/${species.length}`;
      await photo(e, { forcer: true }).catch(() => null);
      faites++;
      barre.style.width = `${(100 * faites) / species.length}%`;
    }
    const n = await photosLocales(species);
    etat.textContent = `${n} photo${n > 1 ? "s" : ""} sur ${species.length} enregistrée${n > 1 ? "s" : ""} sur ce téléphone.`;
    bouton.textContent = n >= species.length ? "Toutes les photos sont enregistrées" : "Réessayer pour les photos manquantes";
    bouton.disabled = n >= species.length;
    toast(n >= species.length ? "Photos prêtes pour le hors-ligne" : `${species.length - n} photos n'ont pas pu être enregistrées`);
  });

  /* -- Export -- */
  main.querySelector("#exporter").addEventListener("click", async () => {
    const sauvegarde = {
      application: "recif",
      format: 1,
      exporteLe: new Date().toISOString(),
      plongees: await db.tous("plongees"),
      quiz: await db.tous("quiz"),
      dujour: await db.tous("dujour"), // ajouté en 1.1 : les anciennes versions l'ignorent
    };
    const blob = new Blob([JSON.stringify(sauvegarde, null, 2)], { type: "application/json" });
    const nom = `recif-carnet-${aujourdhui()}.json`;
    const fichier = new File([blob], nom, { type: "application/json" });
    // Sur téléphone, la feuille de partage permet de l'envoyer par mail, Drive… Sinon simple téléchargement.
    if (navigator.canShare?.({ files: [fichier] })) {
      try { await navigator.share({ files: [fichier], title: "Sauvegarde Récif" }); return; }
      catch (err) { if (err.name === "AbortError") return; }
    }
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: nom });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast("Carnet exporté");
  });

  /* -- Import -- */
  main.querySelector("#importer").addEventListener("click", () => main.querySelector("#fichier-import").click());
  main.querySelector("#fichier-import").addEventListener("change", async (ev) => {
    const f = ev.target.files[0];
    ev.target.value = "";
    if (!f) return;
    let data;
    try { data = JSON.parse(await f.text()); } catch { toast("Ce fichier n'est pas une sauvegarde Récif"); return; }
    if (data.application !== "recif" || !Array.isArray(data.plongees)) { toast("Ce fichier n'est pas une sauvegarde Récif"); return; }
    if (!confirm(`Remplacer le carnet actuel par cette sauvegarde (${data.plongees.length} plongées) ?`)) return;
    await db.vider("plongees");
    for (const p of data.plongees) await db.ecrire("plongees", p);
    if (Array.isArray(data.quiz)) {
      await db.vider("quiz");
      for (const r of data.quiz) await db.ecrire("quiz", r);
    }
    if (Array.isArray(data.dujour)) {
      await db.vider("dujour");
      for (const r of data.dujour) await db.ecrire("dujour", r);
    }
    toast("Sauvegarde importée");
    vueReglages(main);
  });

  /* -- Remise à zéro du quiz -- */
  main.querySelector("#raz-quiz").addEventListener("click", async () => {
    if (!confirm("Effacer tous les résultats du quiz ? Le carnet n'est pas touché.")) return;
    await db.vider("quiz");
    toast("Quiz remis à zéro");
  });
}
