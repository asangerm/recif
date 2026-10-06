// Plus ou moins : deux espèces, laquelle est la plus grande / descend le plus profond ?
// On enchaîne tant qu'on a juste. Pour se faire une idée des ordres de grandeur.

import { especesDeLaZone, photo } from "../especes.js";
import { melanger, rappelZone, texteTaille, texteProf } from "../outils-jeux.js";
import { h } from "../ui.js";

const QUESTIONS = [
  { cle: "tailleCm", question: "Laquelle est la plus grande ?", texte: texteTaille },
  { cle: "profMax", question: "Laquelle descend le plus profond ?", texte: texteProf },
];
const CLE_RECORD = "recif-record-plusoumoins";
const lireRecord = () => { try { return Number(localStorage.getItem(CLE_RECORD)) || 0; } catch { return 0; } };
const ecrireRecord = (n) => { try { localStorage.setItem(CLE_RECORD, String(n)); } catch { /* tant pis */ } };

// Deux espèces assez différentes pour que la question ait une vraie réponse (au moins 30 % d'écart).
function tirerPaire(pool, q) {
  const avec = pool.filter((e) => e[q.cle]);
  for (let essai = 0; essai < 50; essai++) {
    const [a, b] = melanger(avec);
    if (a && b && Math.max(a[q.cle], b[q.cle]) / Math.min(a[q.cle], b[q.cle]) >= 1.3) return [a, b];
  }
  return null;
}

export async function vuePlusOuMoins(main) {
  const pool = await especesDeLaZone();
  let serie = 0;
  let recordAvant = lireRecord(); // record au début de la série, pour fêter un nouveau record

  async function manche() {
    const q = QUESTIONS[Math.floor(Math.random() * QUESTIONS.length)];
    const paire = tirerPaire(pool, q);
    if (!paire) { main.innerHTML = h`<a class="retour" href="#/jeux">‹ Jeux</a><p class="doux">Pas assez d'espèces dans cette zone.</p>`; return; }

    main.innerHTML = h`
      <a class="retour" href="#/jeux">‹ Jeux</a>
      <header class="entete"><div><h1>Plus ou moins</h1>${rappelZone(pool.length)}<p class="doux">Série : ${serie} · record : ${lireRecord()}</p></div></header>
      <h2 style="margin-bottom:14px">${q.question}</h2>
      <div class="duel">${paire.map((e) => h`
        <button type="button" class="duel-carte" data-id="${e.id}">
          <span class="vignette" data-photo="${e.id}">…</span>
          <strong>${e.fr}</strong>
          <span class="latin">${e.la}</span>
          <span class="valeur" hidden>${q.texte(e[q.cle])}</span>
        </button>`)}</div>
      <div id="verdict" class="verdict" aria-live="polite"></div>
    `;
    for (const e of paire) {
      photo(e).then((p) => {
        const el = main.querySelector(`[data-photo="${e.id}"]`);
        if (el) el.innerHTML = p ? h`<img src="${p.url}" alt="">` : "Pas de photo";
      }).catch(() => {});
    }

    main.querySelector(".duel").addEventListener("click", (ev) => {
      const b = ev.target.closest(".duel-carte");
      if (!b || main.querySelector(".duel").dataset.fini) return;
      main.querySelector(".duel").dataset.fini = "1";
      const gagnante = paire[0][q.cle] > paire[1][q.cle] ? paire[0] : paire[1];
      const juste = b.dataset.id === gagnante.id;
      main.querySelectorAll(".duel-carte").forEach((x) => {
        x.querySelector(".valeur").hidden = false;
        x.classList.add(x.dataset.id === gagnante.id ? "juste" : "faux");
      });
      if (juste) serie++;
      if (serie > lireRecord()) ecrireRecord(serie); // enregistré tout de suite, même si on quitte en cours de série
      main.querySelector("#verdict").innerHTML = juste
        ? h`<strong style="color:var(--ok)">Juste ! Série : ${serie}</strong><button class="bouton large" id="suite" style="margin-top:14px">Suivante</button>`
        : h`<strong style="color:var(--ko)">Raté. Série terminée : ${serie}${serie > recordAvant ? " (nouveau record !)" : ""}</strong><button class="bouton large" id="suite" style="margin-top:14px">Rejouer</button>`;
      main.querySelector("#suite").addEventListener("click", () => { if (!juste) { serie = 0; recordAvant = lireRecord(); } manche(); });
    });
  }
  manche();
}
