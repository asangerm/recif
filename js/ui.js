// Petits outils partagés par tous les écrans.

/* ---- Fabriquer du HTML sans risque ----
   h`<p>${texte}</p>` échappe automatiquement les valeurs insérées (un nom de site
   contenant "<" ne cassera rien). Un h`` imbriqué est inséré tel quel. */
class Html {
  constructor(v) { this.v = v; }
  toString() { return this.v; }
}
const echapper = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function inserer(v) {
  if (v == null || v === false) return "";
  if (v instanceof Html) return v.v;
  if (Array.isArray(v)) return v.map(inserer).join("");
  return echapper(v);
}
// brut("...") : insère du HTML écrit à la main, sans échappement (à réserver au texte fixe).
export const brut = (v) => new Html(v);

export function h(morceaux, ...valeurs) {
  return new Html(morceaux.reduce((acc, m, i) => acc + m + (i < valeurs.length ? inserer(valeurs[i]) : ""), ""));
}

/* ---- Message temporaire en bas de l'écran ---- */
let minuteur;
export function toast(message) {
  const el = document.getElementById("toast");
  el.textContent = message;
  el.classList.add("visible");
  clearTimeout(minuteur);
  minuteur = setTimeout(() => el.classList.remove("visible"), 2600);
}

/* ---- Formats ---- */
const fmtDate = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtDateCourte = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric" });
const enDate = (iso) => new Date(iso + "T12:00:00");
export const dateLongue = (iso) => (iso ? fmtDate.format(enDate(iso)) : "");
export const dateCourte = (iso) => (iso ? fmtDateCourte.format(enDate(iso)) : "");
export function duree(minutes) {
  const m = Math.round(minutes || 0);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}
export const nombre = (n) => String(n).replace(".", ",");
export const aujourdhui = () => new Date().toLocaleDateString("sv-SE"); // format AAAA-MM-JJ

/* ---- Profil de plongée ----
   On ne connaît que la profondeur max et la durée : le profil est donc une forme
   "type" (descente, fond, remontée progressive, palier de sécurité à 5 m),
   pas l'enregistrement réel d'un ordinateur de plongée. */
export function pointsProfil(prof, dureeMin) {
  const M = Number(prof), D = Number(dureeMin);
  if (!(M > 0) || !(D > 0)) return null;
  const pts = [[0, 0], [0.1 * D, M], [0.3 * D, 0.93 * M], [0.46 * D, 0.76 * M], [0.62 * D, 0.55 * M]];
  if (M > 8 && D >= 20) {
    pts.push([0.76 * D, Math.max(0.32 * M, 7)], [D - 4, 5], [D - 1, 5]);
  } else {
    pts.push([0.8 * D, 0.3 * M]);
  }
  pts.push([D, 0]);
  return pts;
}

export function cheminProfil(pts, largeur, hauteur, marge = 0) {
  const D = pts[pts.length - 1][0];
  const M = Math.max(...pts.map((p) => p[1]));
  return pts
    .map(([t, p], i) => `${i ? "L" : "M"}${((t / D) * largeur).toFixed(1)},${(marge + (p / M) * (hauteur - marge)).toFixed(1)}`)
    .join(" ");
}

export function miniProfil(prof, dureeMin) {
  const pts = pointsProfil(prof, dureeMin);
  if (!pts) return h`<span></span>`;
  return h`<svg class="mini-profil" viewBox="-2 -2 96 48" aria-hidden="true"><path d="${cheminProfil(pts, 92, 42, 2)}"/></svg>`;
}

export function grandProfil(prof, dureeMin) {
  const pts = pointsProfil(prof, dureeMin);
  if (!pts) return null;
  const L = 320, G = 36, H = 150, M = Number(prof); // G : place réservée aux graduations
  const pas = M > 30 ? 10 : 5;
  const graduations = [];
  for (let p = pas; p < M; p += pas) graduations.push(p);
  const y = (p) => (p / M) * H;
  const trace = cheminProfil(pts, L - G, H);
  return h`
    <svg viewBox="0 -8 ${L} ${H + 30}" role="img" aria-label="Profil indicatif : ${nombre(M)} mètres pendant ${dureeMin} minutes">
      <defs>
        <linearGradient id="degrade-eau" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#F2B705" stop-opacity=".05"/>
          <stop offset="1" stop-color="#F2B705" stop-opacity=".28"/>
        </linearGradient>
      </defs>
      <line class="grad" x1="0" y1="0" x2="${L - G}" y2="0"/>
      ${graduations.map((p) => h`<line class="grad" x1="0" y1="${y(p)}" x2="${L - G}" y2="${y(p)}"/><text x="${L}" y="${y(p) + 4}" text-anchor="end">${p} m</text>`)}
      <path class="eau" d="${trace} Z"/>
      <path class="trace" d="${trace}"/>
      <text x="0" y="${H + 20}">0 min</text>
      <text x="${L - G}" y="${H + 20}" text-anchor="end">${dureeMin} min</text>
    </svg>`;
}

/* ---- Lecture d'un formulaire en objet ---- */
export function lireFormulaire(form) {
  const obj = {};
  for (const [cle, val] of new FormData(form)) obj[cle] = val;
  return obj;
}
