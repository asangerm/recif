#!/usr/bin/env python3
"""
Construit data/species.json, le catalogue d'espèces de Récif.

Outil pour l'ordinateur seulement : l'appli, elle, ne fait que lire le JSON produit.

Ce qu'il fait :
  1. reprend les espèces écrites à la main (especes_manuelles.json + complements.json) ;
  2. pour chaque grande zone de plongée, prend les poissons les plus observés sur
     iNaturalist (observations « recherche » = identifications confirmées) ;
  3. complète chaque poisson avec FishBase : taille, profondeur, habitats, régime, zones ;
  4. récupère famille et ordre sur iNaturalist, et une courte description sur Wikipédia FR.

Usage :  python tools/catalogue/construire.py
Tout ce qui est téléchargé est gardé dans tools/catalogue/cache/ : relancer est rapide.
Supprime ce dossier pour repartir de données fraîches.
"""

import csv
import hashlib
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ICI = Path(__file__).resolve().parent
RACINE = ICI.parent.parent
CACHE = ICI / "cache"
SORTIE = RACINE / "data" / "species.json"

POISSONS_PAR_ZONE = 60  # combien de poissons « les plus observés » on garde par zone

# Zones de plongée, définies par les grandes zones de pêche de la FAO (celles qu'utilise FishBase),
# et les pays où l'on compte les observations iNaturalist pour choisir les espèces
# (nom anglais tel qu'iNaturalist l'écrit, ou directement son numéro : 112403 = Florida Keys,
# plutôt que toute la Floride où les observations viennent surtout de la pêche).
ZONES = [
    {"nom": "Méditerranée", "exemples": "Côte d'Azur, Corse, Croatie, Grèce, Malte", "fao": [37],
     "pays": ["France", "Spain", "Italy", "Greece", "Croatia", "Malta", "Türkiye", "Israel"]},
    {"nom": "Atlantique Nord-Est", "exemples": "Bretagne, Manche, Irlande, Portugal", "fao": [27],
     "pays": ["United Kingdom", "Ireland", "France", "Portugal", "Norway"]},
    {"nom": "Atlantique tropical Est", "exemples": "Canaries, Cap-Vert, Sénégal, Madère", "fao": [34],
     "pays": ["Spain", "Cape Verde", "Senegal", "Portugal"]},
    {"nom": "Caraïbes", "exemples": "Guadeloupe, Martinique, Mexique, Bahamas, Floride", "fao": [31],
     "pays": ["Mexico", "Bahamas", "Cuba", "Belize", "Honduras", "Puerto Rico", 112403, "Guadeloupe", "Martinique", "Curaçao"]},
    {"nom": "Océan Indien", "exemples": "Mer Rouge, Maldives, La Réunion, Maurice, Madagascar", "fao": [51, 57],
     "pays": ["Egypt", "Maldives", "Seychelles", "Mauritius", "Reunion", "Madagascar", "Mozambique", "Sri Lanka"]},
    {"nom": "Pacifique Ouest", "exemples": "Philippines, Indonésie, Grande Barrière, Japon, Nouvelle-Calédonie", "fao": [61, 71, 81],
     "pays": ["Philippines", "Indonesia", "Malaysia", "Papua New Guinea", "Palau", "Australia", "Japan", "New Caledonia", "Fiji", "Thailand"]},
    {"nom": "Pacifique Est", "exemples": "Polynésie, Hawaï, Galápagos, Costa Rica, Baja California", "fao": [67, 77, 87],
     "pays": ["French Polynesia", "Hawaii", "Costa Rica", "Ecuador", "Mexico"]},
]
HABITATS = ["Corail", "Roche", "Herbier", "Sable", "Grotte", "Pleine eau"]
REGIMES = ["Prédateur", "Omnivore", "Brouteur", "Planctonophage", "Filtreur", "Nettoyeur", "Détritivore", "Photosynthèse"]

INAT = "https://api.inaturalist.org/v1"
TAXONS_POISSONS = "47178,47273"  # Actinopterygii (poissons osseux), Elasmobranchii (requins et raies)
ID_REQUINS_RAIES = 47273
FISHBASE = "https://huggingface.co/datasets/cboettig/fishbase/resolve/main/data/fb/v24.07/csv/{}.csv"


# ---------------------------------------------------------------- Téléchargements

dernier_appel = {}

def telecharger(url, attente=0.0):
    """Renvoie le contenu de l'URL (bytes), depuis le cache si possible."""
    cle = hashlib.sha1(url.encode()).hexdigest()
    fichier = CACHE / "http" / cle
    if fichier.exists():
        return fichier.read_bytes()
    hote = urllib.parse.urlparse(url).netloc
    pause = attente - (time.time() - dernier_appel.get(hote, 0))
    if pause > 0:
        time.sleep(pause)
    for essai in range(4):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "RecifCatalogue/1.0 (https://asangerm.github.io/recif/; projet perso)"})
            with urllib.request.urlopen(req, timeout=60) as rep:
                contenu = rep.read()
            break
        except urllib.error.HTTPError as err:
            if err.code == 404:
                contenu = b""
                break
            if essai == 3:
                raise
            # 429 = « trop de requêtes » : on attend ce que le serveur demande (ou 30 s).
            time.sleep(int(err.headers.get("Retry-After") or 0) or (30 if err.code == 429 else 5) * (essai + 1))
        except OSError:
            if essai == 3:
                raise
            time.sleep(5 * (essai + 1))
    dernier_appel[hote] = time.time()
    fichier.parent.mkdir(parents=True, exist_ok=True)
    fichier.write_bytes(contenu)
    return contenu


def inat(chemin, **params):
    # iNaturalist demande au plus ~1 requête par seconde.
    url = f"{INAT}/{chemin}?{urllib.parse.urlencode(params)}"
    return json.loads(telecharger(url, attente=1.1) or b"{}")


def table_fishbase(nom):
    fichier = CACHE / "fishbase" / f"{nom}.csv"
    if not fichier.exists():
        print(f"  téléchargement FishBase : {nom}.csv")
        fichier.parent.mkdir(parents=True, exist_ok=True)
        fichier.write_bytes(telecharger(FISHBASE.format(nom)))
    csv.field_size_limit(10**9)
    with open(fichier, encoding="utf-8", errors="replace", newline="") as f:
        yield from csv.DictReader(f)


# ---------------------------------------------------------------- Petits outils

def identifiant(nom_latin):
    return re.sub(r"[^a-z]+", "-", nom_latin.lower()).strip("-")


def nombre(texte):
    try:
        return float(texte)
    except (TypeError, ValueError):
        return None


def texte_taille(cm):
    if cm >= 100:
        return f"jusqu'à {cm / 100:.1f} m".replace(".0 m", " m").replace(".", ",")
    return f"jusqu'à {cm:g} cm".replace(".", ",")


def lire_taille(texte):
    """« jusqu'à 1,2 m » -> 120 ; « jusqu'à 30 cm » -> 30."""
    m = re.search(r"(\d+(?:,\d+)?)\s*(cm|m)\b", texte)
    if not m:
        return None
    v = float(m.group(1).replace(",", "."))
    return v * 100 if m.group(2) == "m" else v


def lire_profondeur(texte):
    """« 5 à 50 m » -> 50."""
    nombres = re.findall(r"\d+", texte)
    return float(nombres[-1]) if nombres else None


def famille_fr(nom_latin):
    # En français, les familles en -idae s'écrivent en -idés (Serranidae -> Serranidés).
    return re.sub(r"idae$", "idés", nom_latin) if nom_latin else None


def couper_phrases(texte, maxi=320):
    phrases = re.split(r"(?<=[.!?])\s+", texte.strip())
    garde = ""
    for p in phrases:
        if garde and len(garde) + len(p) > maxi:
            break
        garde = f"{garde} {p}".strip()
    return garde


# ---------------------------------------------------------------- FishBase

def charger_fishbase():
    print("FishBase…")
    especes = {}
    for r in table_fishbase("species"):
        especes[f"{r['Genus']} {r['Species']}".lower()] = r
    familles = {r["FamCode"]: r for r in table_fishbase("families")}

    zone_de_fao = {code: z["nom"] for z in ZONES for code in z["fao"]}
    zones = {}
    for r in table_fishbase("faoareas"):
        if r["Status"] in ("native", "endemic"):
            z = zone_de_fao.get(int(r["AreaCode"]))
            if z:
                zones.setdefault(r["SpecCode"], set()).add(z)

    ecologie = {}
    for r in table_fishbase("ecology"):
        ecologie.setdefault(r["SpecCode"], r)  # première fiche écologique = population de référence
    return especes, familles, zones, ecologie


def habitats_fishbase(sp, eco, zones):
    oui = lambda *cles: eco is not None and any(eco.get(k) == "-1" for k in cles)
    h = set()
    if oui("CoralReefs", "ReefFlats", "Lagoons", "HardCorals", "SoftCorals"):
        h.add("Corail")
    if oui("Rocky", "HardBottom", "Rubble", "BedsRock", "DropOffs", "Boulders"):
        h.add("Roche")
    if oui("SeaGrassBeds", "Macrophyte"):
        h.add("Herbier")
    if oui("SoftBottom", "Sand", "Mud", "Silt", "Gravel", "Coarse", "Fine"):
        h.add("Sable")
    if oui("Caves", "Cave", "Crevices", "Burrows"):
        h.add("Grotte")
    if oui("Pelagic") or sp["DemersPelag"].startswith("pelagic"):
        h.add("Pleine eau")
    if not h and sp["DemersPelag"] == "reef-associated":
        tropical = zones - {"Méditerranée", "Atlantique Nord-Est"}
        h.add("Corail" if tropical else "Roche")
    if not h and sp["DemersPelag"] in ("demersal", "benthopelagic"):
        h.add("Sable")
    return sorted(h, key=HABITATS.index)


def regime_fishbase(eco):
    if eco is None:
        return None
    t = eco.get("FeedingType", "")
    if "predator" in t:
        return "Prédateur"
    if "variable" in t:
        return "Omnivore"
    if "grazing" in t or "browsing" in t:
        return "Brouteur"
    if "plankton" in t:
        return "Planctonophage"
    if "cleaner" in t:
        return "Nettoyeur"
    if "scavenger" in t:
        return "Détritivore"
    niveau = nombre(eco.get("FoodTroph")) or nombre(eco.get("DietTroph"))
    if niveau:
        return "Prédateur" if niveau >= 3.5 else "Brouteur" if niveau <= 2.3 else "Omnivore"
    return None


def traits_poisson(sp, ecologie, zones_fb):
    code = sp["SpecCode"]
    eco = ecologie.get(code)
    zones = zones_fb.get(code, set())
    taille = nombre(sp["Length"])
    bas = nombre(sp["DepthRangeComDeep"]) or nombre(sp["DepthRangeDeep"])
    haut = nombre(sp["DepthRangeComShallow"]) if nombre(sp["DepthRangeComDeep"]) else nombre(sp["DepthRangeShallow"])
    return {
        "tailleCm": taille,
        "taille": texte_taille(taille) if taille else None,
        "profMax": bas,
        "prof": f"{haut or 0:g} à {bas:g} m" if bas else None,
        "habitats": habitats_fishbase(sp, eco, zones),
        "regime": regime_fishbase(eco),
        "zones": sorted(zones, key=[z["nom"] for z in ZONES].index),
    }


# ---------------------------------------------------------------- iNaturalist

def id_lieu(nom):
    if isinstance(nom, int):
        return nom
    rep = inat("places/autocomplete", q=nom, per_page=10)
    for p in rep.get("results", []):
        if p.get("admin_level") in (0, 10) and p["name"].lower() == nom.lower():
            return p["id"]
    for p in rep.get("results", []):
        if p.get("admin_level") in (0, 10):
            return p["id"]
    raise SystemExit(f"Lieu introuvable sur iNaturalist : {nom}")


def observes(zone):
    """Tous les poissons observés (identifications confirmées) dans les pays de la zone,
    du plus observé au moins observé : [{count, taxon}, …]."""
    lieux = ",".join(str(id_lieu(n)) for n in zone["pays"])
    tout = []
    for page in range(1, 11):
        rep = inat("observations/species_counts", taxon_id=TAXONS_POISSONS, place_id=lieux,
                   quality_grade="research", locale="fr", per_page=500, page=page)
        tout += rep.get("results", [])
        if len(tout) >= rep.get("total_results", 0):
            break
    return tout


def nom_francais(taxon):
    fr = taxon.get("preferred_common_name")
    if not fr or fr == taxon.get("english_common_name"):
        return None  # pas de nom français : iNaturalist a renvoyé le nom anglais
    return fr[0].upper() + fr[1:]


def taxon_par_nom(nom_latin):
    rep = inat("taxa", q=nom_latin, rank="species", per_page=5, locale="fr")
    for t in rep.get("results", []):
        # matched_term : le nom cherché peut être un ancien nom (synonyme) de l'espèce
        if nom_latin.lower() in (t["name"].lower(), (t.get("matched_term") or "").lower()):
            return t
    return None


def rangs_ancetres(taxons):
    """Pour chaque taxon, retrouve le nom de sa famille, de son ordre et de sa classe."""
    ids = sorted({a for t in taxons for a in t.get("ancestor_ids", [])})
    infos = {}
    for i in range(0, len(ids), 30):
        lot = ",".join(map(str, ids[i:i + 30]))
        for a in inat(f"taxa/{lot}").get("results", []):
            infos[a["id"]] = (a["rank"], a["name"])
    rangs = {}
    for t in taxons:
        r = {}
        for a in t.get("ancestor_ids", []):
            rang, nom = infos.get(a, (None, None))
            if rang in ("family", "order", "class"):
                r[rang] = nom
        rangs[t["id"]] = r
    return rangs


# ---------------------------------------------------------------- Qui mange qui

# Catégories de proies de FishBase -> espèces du catalogue qui en font partie.
PROIES_PAR_CATEGORIE = [
    (("sea urchin",), ["paracentrotus-lividus", "arbacia-lixula"]),
    (("sea star", "brittle star"), ["echinaster-sepositus"]),
    (("squid", "cuttle", "octop", "cephalopod"), ["octopus-vulgaris", "sepia-officinalis", "loligo-vulgaris"]),
    (("crab",), ["dardanus-calidus", "galathea-strigosa"]),
    (("lobster",), ["palinurus-elephas", "scyllarides-latus", "homarus-gammarus", "galathea-strigosa"]),
    (("shrimp", "prawn"), ["lysmata-seticaudata"]),
    (("polychaete",), ["sabella-spallanzanii", "protula-tubularia", "hermodice-carunculata"]),
    (("gastropod",), ["peltodoris-atromaculata", "flabellina-affinis", "aplysia-fasciata"]),
    (("bivalve",), ["pinna-nobilis"]),
    (("sponge",), ["crambe-crambe", "chondrosia-reniformis", "axinella-polypoides"]),
    (("polyp", "coral", "hydroid", "anemone"), ["anemonia-viridis", "parazoanthus-axinellae", "astroides-calycularis", "eunicella-singularis", "paramuricea-clavata"]),
    (("jellyfish", "medusa"), ["pelagia-noctiluca", "cotylorhiza-tuberculata"]),
    (("sea cucumber", "holothur"), ["holothuria-tubulosa"]),
    (("ascidian", "tunicate"), ["halocynthia-papillosa"]),
    (("seagrass", "sea grass"), ["posidonia-oceanica"]),
]


def liens_alimentaires(catalogue):
    """Ajoute à chaque espèce la liste « mange » : les espèces du catalogue dont elle se nourrit.
    On ne garde un lien que si les deux espèces vivent dans une même zone (elles se croisent vraiment)."""
    par_code = {e["_code"]: e for e in catalogue.values() if e.get("_code")}
    par_genre = {}
    for e in catalogue.values():
        par_genre.setdefault(e["la"].split()[0].lower(), []).append(e)
    liens = {i: set(e.get("mange", [])) for i, e in catalogue.items()}
    for r in table_fishbase("fooditems"):
        predateur = par_code.get(r["SpecCode"])
        if not predateur:
            continue
        proies = []
        if r["PreySpecCode"] in par_code:
            proies.append(par_code[r["PreySpecCode"]])
        nom = (r["Foodname"] or "").lower().split()
        if nom:  # proie identifiée au genre seulement (ex. « Chromis sp. »)
            proies += par_genre.get(nom[0], [])
        texte = f"{r['FoodII']} {r['FoodIII']} {r['Foodname']}".lower()
        for mots, ids in PROIES_PAR_CATEGORIE:
            if any(m in texte for m in mots):
                proies += [catalogue[i] for i in ids if i in catalogue]
        for proie in proies:
            if proie["id"] != predateur["id"]:
                liens[predateur["id"]].add(proie["id"])
    for i, e in catalogue.items():
        zones = set(e.get("zones") or [])
        garde = sorted(p for p in liens[i] if p in catalogue and zones & set(catalogue[p].get("zones") or []))
        if garde:
            e["mange"] = garde
        else:
            e.pop("mange", None)


# ---------------------------------------------------------------- Wikipédia

def resume_wikipedia(nom_latin):
    titre = urllib.parse.quote(nom_latin.replace(" ", "_"))
    try:
        brut = telecharger(f"https://fr.wikipedia.org/api/rest_v1/page/summary/{titre}", attente=1.0)
    except OSError as err:
        print(f"  Wikipédia indisponible pour {nom_latin} ({err}), description générée à la place")
        return None
    if not brut:
        return None
    j = json.loads(brut)
    if j.get("type") != "standard" or not j.get("extract"):
        return None
    return {"texte": couper_phrases(j["extract"]), "page": j.get("content_urls", {}).get("desktop", {}).get("page")}


def description_generee(e):
    morceaux = [f"{'Requin ou raie' if e['groupe'] == 'Requins et raies' else 'Poisson'} de la famille des {e['famille']}" if e.get("famille") else "Poisson"]
    if e.get("taille"):
        morceaux.append(e["taille"])
    phrase = ", ".join(morceaux) + "."
    if e.get("habitats"):
        phrase += f" Habitat : {', '.join(h.lower() for h in e['habitats'])}."
    if e.get("zones"):
        phrase += f" Présent en {', '.join(e['zones'])}."
    return phrase


# ---------------------------------------------------------------- Construction

def main():
    manuelles = json.loads((ICI / "especes_manuelles.json").read_text(encoding="utf-8"))
    complements = json.loads((ICI / "complements.json").read_text(encoding="utf-8"))
    fb, familles_fb, zones_fb, ecologie = charger_fishbase()

    # 1. Les espèces écrites à la main d'abord : leurs textes sont prioritaires.
    catalogue = {}
    for e in manuelles["species"]:
        catalogue[e["id"]] = {**e, "manuelle": True}

    # 2. Les poissons les plus observés de chaque zone.
    vus_dans = {}  # nom latin -> zones où l'espèce a au moins 2 observations confirmées
    for zone in ZONES:
        print(f"Zone {zone['nom']}…")
        tous = observes(zone)
        for r in tous:
            if r["count"] >= 2:
                vus_dans.setdefault(r["taxon"]["name"].lower(), set()).add(zone["nom"])
        gardes = 0
        for r in tous:
            if gardes >= POISSONS_PAR_ZONE:
                break
            t = r["taxon"]
            sp = fb.get(t["name"].lower())
            fr = nom_francais(t)
            if not sp or sp["Saltwater"] != "1" or sp["Fresh"] == "1" or not fr:
                continue  # inconnu de FishBase, poisson d'eau douce, ou sans nom français
            if zone["nom"] not in zones_fb.get(sp["SpecCode"], set()):
                continue  # observée dans un des pays, mais côté eau douce ou autre océan
            gardes += 1
            i = identifiant(t["name"])
            if i not in catalogue:
                catalogue[i] = {"id": i, "fr": fr, "la": t["name"], "_taxon": t}
        print(f"  {gardes} poissons")

    # 3. Taxonomie iNaturalist pour toutes les espèces.
    print("Familles et ordres…")
    for e in catalogue.values():
        if "_taxon" not in e:
            e["_taxon"] = taxon_par_nom(e["la"]) or {"id": None, "ancestor_ids": []}
    rangs = rangs_ancetres([e["_taxon"] for e in catalogue.values() if e["_taxon"]["id"]])

    print("Caractéristiques et descriptions…")
    sans_traits = []
    for e in catalogue.values():
        t = e.pop("_taxon")
        r = rangs.get(t["id"], {})
        e["inat"] = t["id"]
        e["famille"] = famille_fr(r.get("family"))
        e["ordre"] = r.get("order")
        sp = fb.get(e["la"].lower()) or fb.get((t.get("name") or "").lower())  # nom iNaturalist si FishBase en utilise un autre
        if sp:
            e["_code"] = sp["SpecCode"]
            traits = traits_poisson(sp, ecologie, zones_fb)
            if r.get("class") == "Elasmobranchii" or ID_REQUINS_RAIES in t.get("ancestor_ids", []):
                e["groupe"] = "Requins et raies"
            else:
                e.setdefault("groupe", "Poissons")
            # FishBase contient quelques erreurs de répartition (la girelle commune « aux
            # Philippines ») : on ne garde une zone que si l'espèce y a aussi été photographiée.
            confirmees = [z for z in traits["zones"] if z in vus_dans.get(e["la"].lower(), set()) | vus_dans.get((t.get("name") or "").lower(), set())]
            traits["zones"] = confirmees or traits["zones"]
            for cle, val in traits.items():
                if val and not e.get(cle):
                    e[cle] = val
        if e["id"] in complements:
            e.update(complements[e["id"]])
        # Pour les espèces manuelles, les chiffres suivent le texte affiché sur la fiche.
        if e.get("manuelle"):
            e["tailleCm"] = lire_taille(e["taille"]) or e.get("tailleCm")
            e["profMax"] = lire_profondeur(e["prof"]) or e.get("profMax")
        if not e.get("desc"):
            w = resume_wikipedia(e["la"])
            if w:
                e["desc"], e["sourceDesc"] = w["texte"], w["page"]
            else:
                e["desc"] = description_generee(e)
        if not all(e.get(k) for k in ("tailleCm", "profMax", "habitats", "regime", "zones")):
            sans_traits.append(e["id"])
        e.pop("manuelle", None)

    print("Qui mange qui…")
    liens_alimentaires(catalogue)
    for e in catalogue.values():
        e.pop("_code", None)

    especes = sorted(catalogue.values(), key=lambda e: e["fr"])
    groupes = ["Poissons", "Requins et raies"] + [g for g in manuelles["groups"] if g != "Poissons"]
    sortie = {
        "version": 2,
        "region": "plongées du monde entier",
        "groups": [g for g in groupes if any(e["groupe"] == g for e in especes)],
        "zones": [{"nom": z["nom"], "exemples": z["exemples"]} for z in ZONES],
        "habitats": HABITATS,
        "regimes": REGIMES,
        "species": especes,
    }
    SORTIE.write_text(json.dumps(sortie, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"\n{len(especes)} espèces écrites dans {SORTIE.relative_to(RACINE)}")
    if sans_traits:
        print(f"{len(sans_traits)} avec des caractéristiques incomplètes : {', '.join(sans_traits)}")


if __name__ == "__main__":
    sys.exit(main())
