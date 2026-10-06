// Onglet Jeux : l'espèce du jour en tête, puis les autres jeux.

import { espece, especesDeLaZone } from "../especes.js";
import { htmlZone, brancherZone } from "../outils-jeux.js";
import { partieDuJour, serie } from "./dujour.js";
import { h } from "../ui.js";

const JEUX = [
  { lien: "#/jeux/quiz", titre: "Quiz photo", texte: "Une photo, quatre noms. Les espèces ratées reviennent plus souvent." },
  { lien: "#/jeux/zoom", titre: "Zoom", texte: "La photo commence en très gros plan et se dévoile à chaque erreur. Pour apprendre à reconnaître un détail." },
  { lien: "#/jeux/indices", titre: "Qui suis-je ?", texte: "Les indices arrivent un par un : moins il t'en faut, plus tu marques de points." },
  { lien: "#/jeux/plusoumoins", titre: "Plus ou moins", texte: "Deux espèces : laquelle est la plus grande ? Laquelle descend le plus profond ?" },
  { lien: "#/jeux/chaine", titre: "Chaîne alimentaire", texte: "Relie deux espèces en passant de proie en prédateur." },
];

export async function vueJeux(main) {
  await especesDeLaZone();
  const partie = await partieDuJour();
  const s = await serie();
  const nb = (await especesDeLaZone()).length;

  const etatJour = partie.trouve
    ? `Trouvée en ${partie.essais.length} essai${partie.essais.length > 1 ? "s" : ""} : ${espece(partie.espece).fr}`
    : partie.fini ? "Pas trouvée aujourd'hui. Nouvelle espèce à minuit."
    : partie.essais.length ? `${partie.essais.length} essai${partie.essais.length > 1 ? "s" : ""}, pas encore trouvée` : "À deviner";

  main.innerHTML = h`
    <header class="entete"><h1>Jeux</h1></header>
    <div class="pile">
      ${await htmlZone()}
      <p class="doux" style="margin-top:6px">${nb} espèces dans les jeux, le quiz et la liste des espèces.</p>

      <a class="carte-jour" href="#/jeux/dujour">
        <span class="serie" aria-label="Série de ${s} jours">🔥 ${s}</span>
        <small>Espèce du jour</small>
        <strong>${etatJour}</strong>
        <span>Devine l'espèce du jour à partir de ses points communs avec tes propositions.</span>
      </a>

      <ul class="liste-jeux">
        ${JEUX.map((j) => h`<li><a href="${j.lien}"><strong>${j.titre}</strong><span class="doux">${j.texte}</span></a></li>`)}
      </ul>
    </div>
  `;
  brancherZone(main, () => vueJeux(main));
}
