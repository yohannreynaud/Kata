// Recherche de lieux, sur le modèle de l'app Flash-cards : la requête est cherchée dans le
// titre, les tags, la description et le type de chaque lieu, sans tenir compte des
// majuscules ni des accents.

// Minuscules, sans accents : "Œuvre d'Été" -> "oeuvre d'ete".
function foldText(text) {
  return (text || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').toLowerCase().trim();
}

// Mots d'un texte déjà replié : "salle d'armes" -> ["salle", "d", "armes"].
function foldedWords(text) {
  return text.split(/[^a-z0-9]+/).filter(Boolean);
}

// Ce qui permet de trouver un lieu, préparé une fois pour une frappe fluide.
// categoryLabel : le nom affiché de son type ("Œuvre", "Salle"…).
function searchEntry(poi, categoryLabel = '') {
  const title = foldText(poi.content?.title);
  const description = foldText(poi.content?.description);
  return {
    poi,
    title,
    titleWords: foldedWords(title),
    tags: (poi.content?.tags || []).map(foldText).filter(Boolean),
    description,
    descriptionWords: foldedWords(description),
    category: foldText(categoryLabel),
  };
}

// Qualité de la correspondance, plus petit = meilleur : 0 titre ou tag exact, 1 début du
// titre ou d'un tag, 2 début d'un mot du titre, 3 type du lieu, 4 début d'un mot de la
// description, 5 ailleurs dans le titre, les tags ou la description, Infinity sinon.
function matchRank(entry, query) {
  const text = foldText(query);
  if (!text) return Infinity;
  if (entry.title === text || entry.tags.includes(text)) return 0;
  if (entry.title.startsWith(text) || entry.tags.some(t => t.startsWith(text))) return 1;
  if (entry.titleWords.some(w => w.startsWith(text))) return 2;
  if (entry.category && entry.category.startsWith(text)) return 3;
  if (entry.descriptionWords.some(w => w.startsWith(text))) return 4;
  if (entry.title.includes(text) || entry.tags.some(t => t.includes(text)) || entry.description.includes(text)) return 5;
  return Infinity;
}

// Les lieux qui correspondent, les meilleurs d'abord ; à égalité, l'ordre d'entrée est gardé.
function searchPois(entries, query) {
  return entries
    .map((entry, i) => ({ entry, i, rank: matchRank(entry, query) }))
    .filter(r => r.rank !== Infinity)
    .sort((a, b) => a.rank - b.rank || a.i - b.i)
    .map(r => r.entry);
}

if (typeof module !== 'undefined') module.exports = { foldText, searchEntry, matchRank, searchPois };
