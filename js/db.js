// Stockage local avec IndexedDB : tout reste sur le téléphone, rien n'est envoyé ailleurs.
// Quatre "tables" (object stores) :
//   plongees : les plongées du carnet
//   quiz     : les résultats du quiz par espèce { id, justes, fausses, derniere }
//   photos   : les photos des espèces téléchargées pour le hors-ligne { id, blob, credit, page }
//   dujour   : les parties de « l'espèce du jour » { date, espece, essais: [ids], fini, trouve }

const NOM_BASE = "recif";
const VERSION_BASE = 2; // 2 : ajout de la table dujour
let promesseBase;

function ouvrir() {
  if (!promesseBase) {
    promesseBase = new Promise((resoudre, rejeter) => {
      const req = indexedDB.open(NOM_BASE, VERSION_BASE);
      // Appelé à la création de la base ou quand VERSION_BASE augmente :
      // c'est ici qu'on ajoutera de nouvelles tables dans les versions futures.
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("plongees")) {
          db.createObjectStore("plongees", { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("quiz")) db.createObjectStore("quiz", { keyPath: "id" });
        if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" });
        if (!db.objectStoreNames.contains("dujour")) db.createObjectStore("dujour", { keyPath: "date" });
      };
      req.onsuccess = () => resoudre(req.result);
      req.onerror = () => rejeter(req.error);
    });
  }
  return promesseBase;
}

// Exécute une opération sur une table et renvoie une promesse du résultat.
async function operation(table, mode, action) {
  const db = await ouvrir();
  return new Promise((resoudre, rejeter) => {
    const tx = db.transaction(table, mode);
    const req = action(tx.objectStore(table));
    tx.oncomplete = () => resoudre(req?.result);
    tx.onerror = () => rejeter(tx.error);
  });
}

export const tous = (table) => operation(table, "readonly", (s) => s.getAll());
export const lire = (table, id) => operation(table, "readonly", (s) => s.get(id));
export const ecrire = (table, objet) => operation(table, "readwrite", (s) => s.put(objet));
export const supprimer = (table, id) => operation(table, "readwrite", (s) => s.delete(id));
export const vider = (table) => operation(table, "readwrite", (s) => s.clear());

// Demande au navigateur de ne pas effacer nos données quand l'espace manque.
export async function demanderStockagePersistant() {
  if (navigator.storage?.persist) {
    try { return await navigator.storage.persist(); } catch { return false; }
  }
  return false;
}
