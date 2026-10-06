// Quiz : une photo (ou un indice si pas de photo), quatre noms, une seule bonne réponse.
// Les espèces ratées reviennent plus souvent, celles bien connues de moins en moins.

import * as db from "../db.js";
import { chargerEspeces, especesDeLaZone, photo } from "../especes.js";
import { rappelZone, sansLeNom } from "../outils-jeux.js";
import { h } from "../ui.js";
import { QUESTIONS_PAR_PARTIE } from "../config.js";

let portee = "Toutes"; // "Toutes", "Déjà croisées" ou un groupe

const maitrisee = (r) => r && r.justes >= 3 && r.justes >= 2 * r.fausses;

function poids(r) {
  if (!r) return 1.5; // jamais vue au quiz : on la propose volontiers
  return Math.max(0.25, 1 + 2 * r.fausses - 0.5 * r.justes);
}

// Tirage au hasard pondéré, sans remise.
function tirer(liste, n, fnPoids) {
  const reste = liste.map((x) => ({ x, w: fnPoids(x) }));
  const tires = [];
  while (tires.length < n && reste.length) {
    let r = Math.random() * reste.reduce((s, o) => s + o.w, 0);
    const i = reste.findIndex((o) => (r -= o.w) <= 0);
    tires.push(reste.splice(i === -1 ? reste.length - 1 : i, 1)[0].x);
  }
  return tires;
}
const melanger = (t) => tirer(t, t.length, () => 1);

async function resultats() {
  return new Map((await db.tous("quiz")).map((r) => [r.id, r]));
}

/* ---------------- Accueil du quiz ---------------- */
export async function vueQuiz(main) {
  const { groups } = await chargerEspeces();
  const species = await especesDeLaZone();
  const res = await resultats();
  const croisees = new Set((await db.tous("plongees")).flatMap((p) => p.especes || []));
  const nbMaitrisees = species.filter((e) => maitrisee(res.get(e.id))).length;
  const choix = ["Toutes", ...(croisees.size ? ["Déjà croisées"] : []), ...groups.filter((g) => species.filter((e) => e.groupe === g).length >= 3)];
  if (!choix.includes(portee)) portee = "Toutes";

  main.innerHTML = h`
    <a class="retour" href="#/jeux">‹ Jeux</a>
    <header class="entete"><div>
      <h1>Quiz photo</h1>
      ${rappelZone(species.length)}
      <p class="doux">${nbMaitrisees} espèce${nbMaitrisees > 1 ? "s" : ""} bien connue${nbMaitrisees > 1 ? "s" : ""} sur ${species.length}</p>
    </div></header>
    <div class="barre" aria-hidden="true"><div style="width:${Math.round((100 * nbMaitrisees) / species.length)}%"></div></div>

    <section class="pile" style="margin-top:28px">
      <h2>Sur quelles espèces ?</h2>
      <div class="puces" role="group" aria-label="Espèces du quiz">
        ${choix.map((c) => h`<button type="button" class="puce" data-portee="${c}" aria-pressed="${String(c === portee)}">${c}</button>`)}
      </div>
      <p class="doux">${QUESTIONS_PAR_PARTIE} questions. Les espèces ratées reviendront plus souvent.</p>
      <button class="bouton large" id="commencer">Commencer</button>
    </section>
  `;
  main.querySelector(".puces").addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    portee = b.dataset.portee;
    main.querySelectorAll(".puces button").forEach((x) => x.setAttribute("aria-pressed", x === b));
  });
  main.querySelector("#commencer").addEventListener("click", () => partie(main));
}

/* ---------------- Partie ---------------- */
async function partie(main) {
  const species = await especesDeLaZone();
  const res = await resultats();
  const croisees = new Set((await db.tous("plongees")).flatMap((p) => p.especes || []));
  const pool = species.filter((e) =>
    portee === "Toutes" || (portee === "Déjà croisées" ? croisees.has(e.id) : e.groupe === portee));

  const questions = tirer(pool, Math.min(QUESTIONS_PAR_PARTIE, pool.length), (e) => poids(res.get(e.id))).map((bonne) => {
    // Les mauvaises réponses viennent si possible du même groupe : c'est plus formateur.
    const memeGroupe = species.filter((e) => e.groupe === bonne.groupe && e.id !== bonne.id);
    const autres = species.filter((e) => e.groupe !== bonne.groupe);
    const leurres = [...melanger(memeGroupe), ...melanger(autres)].slice(0, 3);
    return { bonne, choix: melanger([bonne, ...leurres]) };
  });

  let i = 0, score = 0;
  const ratees = [];
  // Précharge la photo de la question suivante pendant qu'on répond.
  const prechargee = (k) => questions[k] && photo(questions[k].bonne).catch(() => null);

  async function afficherQuestion() {
    const q = questions[i];
    main.innerHTML = h`
      <div class="quiz-progres" role="progressbar" aria-valuemin="0" aria-valuemax="${questions.length}" aria-valuenow="${i}"><div style="width:${(100 * i) / questions.length}%"></div></div>
      <p class="doux" style="margin-bottom:10px">Question ${i + 1} sur ${questions.length}</p>
      <div id="enigme"><div class="vignette quiz-photo">Chargement…</div></div>
      <div class="choix">${q.choix.map((e) => h`<button type="button" data-id="${e.id}" disabled>${e.fr}</button>`)}</div>
      <div class="verdict" id="verdict" aria-live="polite"></div>
    `;
    const enigme = main.querySelector("#enigme");
    const p = await Promise.race([photo(q.bonne).catch(() => null), new Promise((r) => setTimeout(() => r(null), 5000))]);
    if (questions[i] !== q) return; // l'utilisateur a déjà avancé
    const avecPhoto = Boolean(p);
    enigme.innerHTML = p
      ? h`<div class="vignette quiz-photo"><img src="${p.url}" alt="Photo de l'espèce à reconnaître"></div>`
      : h`<div class="quiz-texte"><small>Pas de photo disponible, voici un indice. Qui suis-je ?</small>${q.bonne.indice || sansLeNom(q.bonne.desc, q.bonne)}</div>`;
    prechargee(i + 1);
    // Les réponses ne deviennent cliquables qu'une fois la photo (ou l'indice) affichée.
    main.querySelectorAll(".choix button").forEach((x) => (x.disabled = false));

    main.querySelector(".choix").addEventListener("click", async (ev) => {
      const b = ev.target.closest("button");
      if (!b || b.disabled) return;
      const juste = b.dataset.id === q.bonne.id;
      main.querySelectorAll(".choix button").forEach((x) => {
        x.disabled = true;
        if (x.dataset.id === q.bonne.id) x.classList.add("juste");
      });
      if (!juste) b.classList.add("faux");

      const r = res.get(q.bonne.id) || { id: q.bonne.id, justes: 0, fausses: 0 };
      juste ? r.justes++ : r.fausses++;
      r.derniere = new Date().toISOString();
      res.set(r.id, r);
      await db.ecrire("quiz", r);
      if (juste) score++; else ratees.push(q.bonne);

      const derniere = i === questions.length - 1;
      main.querySelector("#verdict").innerHTML = h`
        <div class="pile-serree">
          <strong style="color:var(${juste ? "--ok" : "--ko"})">${juste ? "Bien vu !" : `C'était ${q.bonne.fr}`}</strong>
          <p class="latin">${q.bonne.la}</p>
          <p>${avecPhoto ? q.bonne.indice || q.bonne.desc : q.bonne.desc}</p>
        </div>
        <button class="bouton large" id="suivante" style="margin-top:16px">${derniere ? "Voir mon score" : "Question suivante"}</button>`;
      const suivante = main.querySelector("#suivante");
      suivante.focus();
      suivante.addEventListener("click", () => { i++; derniere ? afficherFin() : afficherQuestion(); });
    });
  }

  function afficherFin() {
    const parfait = score === questions.length;
    main.innerHTML = h`
      <div class="pile" style="margin-top:20px">
        <p class="score">${score}<span class="doux" style="font-size:.45em"> / ${questions.length}</span></p>
        <h2>${parfait ? "Sans faute, bravo !" : score >= questions.length * 0.7 ? "Très belle partie" : "Chaque partie te fait progresser"}</h2>
        ${ratees.length ? h`
          <section class="pile-serree">
            <p class="doux">À revoir :</p>
            <div class="puces">${ratees.map((e) => h`<a class="puce" href="#/especes/${e.id}">${e.fr}</a>`)}</div>
          </section>` : ""}
        <div class="rangee-boutons">
          <button class="bouton" id="rejouer">Rejouer</button>
          <button class="bouton second" id="changer">Changer d'espèces</button>
        </div>
      </div>`;
    main.querySelector("#rejouer").addEventListener("click", () => partie(main));
    main.querySelector("#changer").addEventListener("click", () => vueQuiz(main));
  }

  if (!questions.length) { main.innerHTML = h`<p class="doux">Aucune espèce pour ce choix.</p>`; return; }
  prechargee(0);
  afficherQuestion();
}
