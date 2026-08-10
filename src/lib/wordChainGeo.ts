// Kuratierte Liste deutscher Namen fuer Laender, Staedte und Fluesse fuers
// Wortkettenspiel (siehe src/lib/wordChain.ts) - keine Fremdsprachen-Varianten
// (z.B. "Munich"), nur die deutsche Form ("München"). Nicht erschoepfend,
// deckt aber die gaengigsten Namen ab; bei Bedarf einfach ergaenzen.

export const LAENDER = [
  "Afghanistan", "Ägypten", "Albanien", "Algerien", "Andorra", "Angola",
  "Argentinien", "Armenien", "Aserbaidschan", "Äthiopien", "Australien",
  "Bahamas", "Bahrain", "Bangladesch", "Barbados", "Belgien", "Belize",
  "Benin", "Bhutan", "Bolivien", "Botswana", "Brasilien", "Brunei",
  "Bulgarien", "Burundi", "Chile", "China", "Costa Rica", "Dänemark",
  "Deutschland", "Dominica", "Dschibuti", "Ecuador", "Eritrea", "Estland",
  "Fidschi", "Finnland", "Frankreich", "Gabun", "Gambia", "Georgien",
  "Ghana", "Grenada", "Griechenland", "Guatemala", "Guinea", "Guyana",
  "Haiti", "Honduras", "Indien", "Indonesien", "Irak", "Iran", "Irland",
  "Island", "Israel", "Italien", "Jamaika", "Japan", "Jemen", "Jordanien",
  "Kambodscha", "Kamerun", "Kanada", "Kasachstan", "Katar", "Kenia",
  "Kirgisistan", "Kolumbien", "Kongo", "Kosovo", "Kroatien", "Kuba",
  "Kuwait", "Laos", "Lesotho", "Lettland", "Libanon", "Liberia", "Libyen",
  "Liechtenstein", "Litauen", "Luxemburg", "Madagaskar", "Malawi",
  "Malaysia", "Malediven", "Mali", "Malta", "Marokko", "Mauretanien",
  "Mauritius", "Mexiko", "Moldau", "Monaco", "Mongolei", "Montenegro",
  "Mosambik", "Myanmar", "Namibia", "Nauru", "Nepal", "Neuseeland",
  "Nicaragua", "Niederlande", "Niger", "Nigeria", "Norwegen", "Oman",
  "Österreich", "Pakistan", "Palau", "Panama", "Paraguay", "Peru",
  "Philippinen", "Polen", "Portugal", "Ruanda", "Rumänien", "Russland",
  "Sambia", "Samoa", "Saudiarabien", "Schweden", "Schweiz", "Senegal",
  "Serbien", "Seychellen", "Simbabwe", "Singapur", "Slowakei", "Slowenien",
  "Somalia", "Spanien", "Sudan", "Suriname", "Syrien", "Tadschikistan",
  "Tansania", "Thailand", "Togo", "Tonga", "Tschad", "Tschechien",
  "Tunesien", "Türkei", "Turkmenistan", "Tuvalu", "Uganda", "Ukraine",
  "Ungarn", "Uruguay", "Usbekistan", "Vanuatu", "Venezuela", "Vietnam",
  "Zypern",
];

export const STAEDTE = [
  // Deutschland
  "Berlin", "Hamburg", "München", "Köln", "Frankfurt", "Stuttgart",
  "Düsseldorf", "Dortmund", "Essen", "Leipzig", "Bremen", "Dresden",
  "Hannover", "Nürnberg", "Duisburg", "Bochum", "Wuppertal", "Bielefeld",
  "Bonn", "Münster", "Karlsruhe", "Mannheim", "Augsburg", "Wiesbaden",
  "Braunschweig", "Chemnitz", "Kiel", "Aachen", "Halle", "Magdeburg",
  "Freiburg", "Krefeld", "Lübeck", "Erfurt", "Mainz", "Rostock", "Kassel",
  "Potsdam", "Saarbrücken", "Oldenburg", "Osnabrück", "Leverkusen",
  "Heidelberg", "Darmstadt", "Solingen", "Regensburg", "Paderborn",
  "Ingolstadt", "Würzburg", "Wolfsburg", "Ulm", "Heilbronn", "Pforzheim",
  "Göttingen", "Trier", "Reutlingen", "Koblenz", "Jena", "Erlangen",
  "Siegen", "Hildesheim",
  // Österreich
  "Wien", "Graz", "Linz", "Salzburg", "Innsbruck", "Klagenfurt",
  // Schweiz
  "Zürich", "Genf", "Basel", "Bern", "Lausanne", "Luzern",
  // International (deutsche Exonyme)
  "Paris", "London", "Rom", "Madrid", "Lissabon", "Athen", "Warschau",
  "Prag", "Budapest", "Bukarest", "Sofia", "Belgrad", "Zagreb", "Kiew",
  "Moskau", "Minsk", "Vilnius", "Riga", "Tallinn", "Helsinki", "Stockholm",
  "Oslo", "Kopenhagen", "Dublin", "Brüssel", "Amsterdam", "Ankara",
  "Istanbul", "Damaskus", "Bagdad", "Teheran", "Kairo", "Tripolis",
  "Tunis", "Algier", "Rabat", "Casablanca", "Lagos", "Nairobi", "Kapstadt",
  "Peking", "Shanghai", "Tokio", "Seoul", "Bangkok", "Hanoi", "Jakarta",
  "Manila", "Mumbai", "Islamabad", "Kabul", "Riad", "Jerusalem", "Havanna",
  "Lima", "Santiago", "Sydney", "Wellington", "Neapel", "Venedig",
  "Mailand", "Florenz", "Barcelona", "Danzig", "Breslau", "Krakau",
];

export const FLUESSE = [
  "Rhein", "Donau", "Elbe", "Oder", "Weser", "Main", "Mosel", "Spree",
  "Isar", "Neckar", "Ruhr", "Saale", "Havel", "Lahn", "Ems", "Werra",
  "Fulda", "Inn", "Lech", "Naab", "Regnitz", "Nil", "Amazonas",
  "Mississippi", "Wolga", "Ganges", "Euphrat", "Tigris", "Themse",
  "Seine", "Loire", "Rhone", "Tiber", "Ebro", "Dnepr", "Ural", "Kongo",
  "Sambesi", "Niger", "Orinoco", "Colorado", "Mekong", "Indus", "Jordan",
];

/** Zerlegt Mehrwort-Namen ("Costa Rica") in einzelne, im Spiel eingebbare Woerter. */
function splitToWords(names: string[]): string[] {
  return names.flatMap((name) => name.split(/[^a-zA-ZäöüÄÖÜß]+/).filter(Boolean));
}

export const GEOGRAFIE_WOERTER = new Set(
  splitToWords([...LAENDER, ...STAEDTE, ...FLUESSE]).map((w) => w.toLowerCase())
);
