// Beauty Scan — UI strings + AI output language for the 5 supported languages.

export type Lang = "es" | "en" | "fr" | "de" | "ja"
export const LANGS: Lang[] = ["es", "en", "fr", "de", "ja"]

export type VerdictKey = "excellent" | "good" | "mediocre" | "bad"
export type TagKey = "heavy_metal" | "allergen" | "irritant" | "endocrine_disruptor"
export type SourceKey = "obf" | "package" | "web"

export interface Strings {
  langName: string // shown on the picker button
  aiLanguage: string // language instruction for Gemini
  pickTitle: string
  promptHint: string
  promptReading: string
  scan: string
  close: string
  problems: (n: number) => string
  noProblems: string
  sensitiveHeader: string
  sensitiveDefault: string
  alternative: (x: string) => string
  score: (n: number) => string
  disclaimer: string
  noBarcode: string
  unnamed: string
  unreadable: string
  noBarcodeRead: string
  offline: string
  moveHint: string
  typeCode: string // button label: type the barcode by hand
  typeHint: string // prompt while the keyboard is open
  badCode: string // typed code fails the check digit
  readingCode: string // prompt while the barcode close-up is being read
  noData: (product: string) => string // no real ingredient list found anywhere
  notCosmetic: (product: string) => string // press-on nails, lashes, tools: no ingredient list exists
  verdict: Record<VerdictKey, string>
  tag: Record<TagKey, string>
  source: Record<SourceKey, string>
}

export const STRINGS: Record<Lang, Strings> = {
  es: {
    langName: "Español",
    aiLanguage: "Spanish (Argentina, voseo)",
    pickTitle: "Elegí tu idioma · Choose your language",
    promptHint: "Mirá el producto y hacé pinch para escanear",
    promptReading: "Leyendo el producto…",
    scan: "ESCANEAR",
    close: "CERRAR",
    problems: (n) => `Ingredientes problemáticos (${n})`,
    noProblems: "Sin ingredientes problemáticos",
    sensitiveHeader: "Para piel sensible",
    sensitiveDefault: "Sin reacciones conocidas para piel sensible.",
    alternative: (x) => `Alternativa mejor: ${x}`,
    score: (n) => `Puntaje ${n}/100`,
    disclaimer: "Solo informativo, no es consejo médico",
    noBarcode: "sin código de barras",
    unnamed: "Producto sin nombre",
    unreadable: "No pude leer el producto — acercalo con la etiqueta hacia vos",
    noBarcodeRead: "No pude leer el código de barras — acercalo a unos 20 cm, con buena luz",
    offline: "Sin conexión — probá de nuevo",
    moveHint: "Agarrá la tarjeta con pinch para moverla",
    typeCode: "CÓDIGO",
    typeHint: "Escribí los números del código de barras",
    badCode: "Ese código no es válido — revisá los números",
    readingCode: "Ampliando el código de barras…",
    noData: (p) => `No encontré la lista real de ingredientes${p ? " de " + p : ""} — escaneá el código o la lista del envase`,
    notCosmetic: (p) => `${p || "Este producto"}: no es un cosmético con fórmula (uñas postizas, pestañas, accesorios), no tiene lista de ingredientes para puntuar`,
    verdict: {excellent: "Excelente", good: "Bueno", mediocre: "Mediocre", bad: "Malo"},
    tag: {heavy_metal: "Metal pesado", allergen: "Alérgeno", irritant: "Irritante", endocrine_disruptor: "Disruptor endocrino"},
    source: {
      obf: "Fuente: Open Beauty Facts",
      package: "Fuente: Leído del envase",
      web: "Fuente: web",
    },
  },
  en: {
    langName: "English",
    aiLanguage: "English",
    pickTitle: "Choose your language",
    promptHint: "Look at the product and pinch to scan",
    promptReading: "Reading the product…",
    scan: "SCAN",
    close: "CLOSE",
    problems: (n) => `Problem ingredients (${n})`,
    noProblems: "No problem ingredients",
    sensitiveHeader: "For sensitive skin",
    sensitiveDefault: "No known reactions for sensitive skin.",
    alternative: (x) => `Better alternative: ${x}`,
    score: (n) => `Score ${n}/100`,
    disclaimer: "For information only, not medical advice",
    noBarcode: "no barcode",
    unnamed: "Unnamed product",
    unreadable: "Couldn't read the product — bring it closer, label facing you",
    noBarcodeRead: "Couldn't read the barcode — hold it about 20 cm away, in good light",
    offline: "No connection — try again",
    moveHint: "Pinch the card to move it",
    typeCode: "CODE",
    typeHint: "Type the barcode numbers",
    badCode: "That code isn't valid — check the numbers",
    readingCode: "Zooming in on the barcode…",
    noData: (p) => `Couldn't find the real ingredient list${p ? " for " + p : ""} — scan the barcode or the ingredient list`,
    notCosmetic: (p) => `${p || "This product"}: not a formulated cosmetic (press-on nails, lashes, tools), so there is no ingredient list to score`,
    verdict: {excellent: "Excellent", good: "Good", mediocre: "Poor", bad: "Bad"},
    tag: {heavy_metal: "Heavy metal", allergen: "Allergen", irritant: "Irritant", endocrine_disruptor: "Endocrine disruptor"},
    source: {
      obf: "Source: Open Beauty Facts",
      package: "Source: Read from the package",
      web: "Source: web",
    },
  },
  fr: {
    langName: "Français",
    aiLanguage: "French",
    pickTitle: "Choisissez votre langue",
    promptHint: "Regardez le produit et pincez pour scanner",
    promptReading: "Lecture du produit…",
    scan: "SCANNER",
    close: "FERMER",
    problems: (n) => `Ingrédients à risque (${n})`,
    noProblems: "Aucun ingrédient à risque",
    sensitiveHeader: "Pour peau sensible",
    sensitiveDefault: "Aucune réaction connue pour les peaux sensibles.",
    alternative: (x) => `Meilleure alternative : ${x}`,
    score: (n) => `Note ${n}/100`,
    disclaimer: "À titre informatif, pas un avis médical",
    noBarcode: "sans code-barres",
    unnamed: "Produit sans nom",
    unreadable: "Produit illisible — approchez-le, étiquette vers vous",
    noBarcodeRead: "Code-barres illisible — tenez-le à environ 20 cm, avec une bonne lumière",
    offline: "Pas de connexion — réessayez",
    moveHint: "Pincez la carte pour la déplacer",
    typeCode: "CODE",
    typeHint: "Tapez les chiffres du code-barres",
    badCode: "Code invalide — vérifiez les chiffres",
    readingCode: "Zoom sur le code-barres…",
    noData: (p) => `Liste d'ingrédients réelle introuvable${p ? " pour " + p : ""} — scannez le code-barres ou la liste`,
    notCosmetic: (p) => `${p || "Ce produit"} : pas un cosmétique formulé (faux ongles, cils, accessoires), aucune liste d'ingrédients à noter`,
    verdict: {excellent: "Excellent", good: "Bon", mediocre: "Médiocre", bad: "Mauvais"},
    tag: {heavy_metal: "Métal lourd", allergen: "Allergène", irritant: "Irritant", endocrine_disruptor: "Perturbateur endocrinien"},
    source: {
      obf: "Source : Open Beauty Facts",
      package: "Source : lu sur l'emballage",
      web: "Source : web",
    },
  },
  de: {
    langName: "Deutsch",
    aiLanguage: "German",
    pickTitle: "Wähle deine Sprache",
    promptHint: "Schau das Produkt an und pinche zum Scannen",
    promptReading: "Produkt wird gelesen…",
    scan: "SCANNEN",
    close: "SCHLIESSEN",
    problems: (n) => `Bedenkliche Inhaltsstoffe (${n})`,
    noProblems: "Keine bedenklichen Inhaltsstoffe",
    sensitiveHeader: "Für empfindliche Haut",
    sensitiveDefault: "Keine bekannten Reaktionen bei empfindlicher Haut.",
    alternative: (x) => `Bessere Alternative: ${x}`,
    score: (n) => `Bewertung ${n}/100`,
    disclaimer: "Nur zur Information, keine medizinische Beratung",
    noBarcode: "kein Barcode",
    unnamed: "Produkt ohne Namen",
    unreadable: "Produkt nicht lesbar — näher heran, Etikett zu dir",
    noBarcodeRead: "Barcode nicht lesbar — halte ihn ca. 20 cm entfernt, bei gutem Licht",
    offline: "Keine Verbindung — versuch es nochmal",
    moveHint: "Pinche die Karte, um sie zu verschieben",
    typeCode: "CODE",
    typeHint: "Tippe die Barcode-Ziffern ein",
    badCode: "Ungültiger Code — prüfe die Ziffern",
    readingCode: "Barcode wird vergrößert…",
    noData: (p) => `Keine echte Inhaltsstoffliste gefunden${p ? " für " + p : ""} — scanne den Barcode oder die Liste`,
    notCosmetic: (p) => `${p || "Dieses Produkt"}: kein formuliertes Kosmetikum (Kunstnägel, Wimpern, Zubehör), keine Inhaltsstoffliste zum Bewerten`,
    verdict: {excellent: "Ausgezeichnet", good: "Gut", mediocre: "Mittelmäßig", bad: "Schlecht"},
    tag: {heavy_metal: "Schwermetall", allergen: "Allergen", irritant: "Reizstoff", endocrine_disruptor: "Hormonstörer"},
    source: {
      obf: "Quelle: Open Beauty Facts",
      package: "Quelle: von der Verpackung gelesen",
      web: "Quelle: Web",
    },
  },
  ja: {
    langName: "日本語",
    aiLanguage: "Japanese",
    pickTitle: "言語を選んでください",
    promptHint: "製品を見てピンチでスキャン",
    promptReading: "製品を読み取り中…",
    scan: "スキャン",
    close: "閉じる",
    problems: (n) => `注意が必要な成分（${n}）`,
    noProblems: "注意が必要な成分はありません",
    sensitiveHeader: "敏感肌の方へ",
    sensitiveDefault: "敏感肌への既知の反応はありません。",
    alternative: (x) => `おすすめの代替品：${x}`,
    score: (n) => `スコア ${n}/100`,
    disclaimer: "情報提供のみ。医療アドバイスではありません",
    noBarcode: "バーコードなし",
    unnamed: "名称不明の製品",
    unreadable: "製品を読み取れません — ラベルをこちらに向けて近づけてください",
    noBarcodeRead: "バーコードを読み取れません — 明るい場所で約20cmまで近づけてください",
    offline: "接続できません — もう一度お試しください",
    moveHint: "カードをピンチして移動できます",
    typeCode: "コード入力",
    typeHint: "バーコードの数字を入力してください",
    badCode: "無効なコードです — 数字を確認してください",
    readingCode: "バーコードを拡大中…",
    noData: (p) => `${p ? p + "の" : ""}実際の成分リストが見つかりません — バーコードか成分表をスキャンしてください`,
    notCosmetic: (p) => `${p || "この製品"}：つけ爪・つけまつげ・道具など処方化粧品ではないため、評価する成分リストがありません`,
    verdict: {excellent: "とても良い", good: "良い", mediocre: "普通", bad: "悪い"},
    tag: {heavy_metal: "重金属", allergen: "アレルゲン", irritant: "刺激物", endocrine_disruptor: "内分泌かく乱物質"},
    source: {
      obf: "出典：Open Beauty Facts",
      package: "出典：パッケージから読み取り",
      web: "出典：ウェブ",
    },
  },
}
