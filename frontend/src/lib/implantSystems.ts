export interface ImplantSystemItem {
  id: string;
  name: string;
  nameUz: string;
  nameRu: string;
  nameEn: string;
  aliases: string[]; // For fast multilingual searching (Cyrillic, Latin, transliterations)
}

export const IMPLANT_SYSTEMS: ImplantSystemItem[] = [
  {
    id: 'straumann',
    name: 'Straumann',
    nameUz: 'Straumann (Shtraumann)',
    nameRu: 'Straumann (Штрауманн)',
    nameEn: 'Straumann',
    aliases: ['straumann', 'штрауман', 'штрауманн', 'shtrauman', 'shtraumann']
  },
  {
    id: 'nobel-biocare',
    name: 'Nobel Biocare',
    nameUz: 'Nobel Biocare (Nobel Biokare)',
    nameRu: 'Nobel Biocare (Нобель Биокаре)',
    nameEn: 'Nobel Biocare',
    aliases: ['nobel', 'nobel biocare', 'нобель', 'нобель биокар', 'нобель биокаре', 'nobel biokare']
  },
  {
    id: 'neodent',
    name: 'Neodent',
    nameUz: 'Neodent',
    nameRu: 'Neodent (Неодент)',
    nameEn: 'Neodent',
    aliases: ['neodent', 'неодент']
  },
  {
    id: 'osstem',
    name: 'Osstem',
    nameUz: 'Osstem',
    nameRu: 'Osstem (Осстем)',
    nameEn: 'Osstem',
    aliases: ['osstem', 'осстем', 'ostem', 'остем']
  },
  {
    id: 'dentium',
    name: 'Dentium',
    nameUz: 'Dentium',
    nameRu: 'Dentium (Дентиум)',
    nameEn: 'Dentium',
    aliases: ['dentium', 'дентиум']
  },
  {
    id: 'megagen',
    name: 'MegaGen',
    nameUz: 'MegaGen (Megajen)',
    nameRu: 'MegaGen (Мегаджен)',
    nameEn: 'MegaGen',
    aliases: ['megagen', 'мегаджен', 'мегаген', 'megajen']
  },
  {
    id: 'biohorizons',
    name: 'BioHorizons',
    nameUz: 'BioHorizons (BioGorizont)',
    nameRu: 'BioHorizons (Биогоризонт)',
    nameEn: 'BioHorizons',
    aliases: ['biohorizons', 'биогоризонт', 'биохорайзонс', 'biogorizont']
  },
  {
    id: 'mis-implants',
    name: 'MIS Implants',
    nameUz: 'MIS Implants (MIS)',
    nameRu: 'MIS Implants (МИС)',
    nameEn: 'MIS Implants',
    aliases: ['mis', 'mis implants', 'мис', 'мис имплантс']
  },
  {
    id: 'alpha-bio-tec',
    name: 'Alpha-Bio Tec',
    nameUz: 'Alpha-Bio Tec (Alfa-Bio)',
    nameRu: 'Alpha-Bio Tec (Альфа-Био)',
    nameEn: 'Alpha-Bio Tec',
    aliases: ['alpha bio', 'alpha-bio', 'альфа био', 'альфа-био', 'alfa bio', 'alfa-bio']
  },
  {
    id: 'zimmer-biomet',
    name: 'Zimmer Biomet',
    nameUz: 'Zimmer Biomet (Zimmer)',
    nameRu: 'Zimmer Biomet (Циммер Биомет)',
    nameEn: 'Zimmer Biomet',
    aliases: ['zimmer', 'zimmer biomet', 'циммер', 'зиммер', 'циммер биомет']
  },
  {
    id: 'dentsply-sirona-astra-tech',
    name: 'Dentsply Sirona / Astra Tech',
    nameUz: 'Dentsply Sirona / Astra Tech (Astra Tek)',
    nameRu: 'Dentsply Sirona / Astra Tech (Дентсплай / Астра Тек)',
    nameEn: 'Dentsply Sirona / Astra Tech',
    aliases: ['dentsply', 'sirona', 'astra', 'astra tech', 'дентсплай', 'сирона', 'астра', 'астра тек', 'astra tek']
  },
  {
    id: 'anthogyr',
    name: 'Anthogyr',
    nameUz: 'Anthogyr (Antojir)',
    nameRu: 'Anthogyr (Антожир)',
    nameEn: 'Anthogyr',
    aliases: ['anthogyr', 'антожир', 'антоджир', 'antojir']
  },
  {
    id: 'camlog',
    name: 'Camlog',
    nameUz: 'Camlog (Kamlog)',
    nameRu: 'Camlog (Камлог)',
    nameEn: 'Camlog',
    aliases: ['camlog', 'камлог', 'kamlog']
  },
  {
    id: 'bego',
    name: 'BEGO',
    nameUz: 'BEGO (Bego)',
    nameRu: 'BEGO (Бего)',
    nameEn: 'BEGO',
    aliases: ['bego', 'бего']
  },
  {
    id: 'bredent',
    name: 'Bredent',
    nameUz: 'Bredent',
    nameRu: 'Bredent (Бредент)',
    nameEn: 'Bredent',
    aliases: ['bredent', 'бредент']
  },
  {
    id: 'icx',
    name: 'ICX',
    nameUz: 'ICX (Aysieks)',
    nameRu: 'ICX (Айсиэкс / Исикс)',
    nameEn: 'ICX',
    aliases: ['icx', 'исикс', 'айсиэкс', 'айсикс', 'iks']
  },
  {
    id: 'bio3',
    name: 'Bio3',
    nameUz: 'Bio3 (Bio uch)',
    nameRu: 'Bio3 (Био3)',
    nameEn: 'Bio3',
    aliases: ['bio3', 'bio 3', 'био3', 'био 3']
  },
  {
    id: 'anyridge',
    name: 'AnyRidge',
    nameUz: 'AnyRidge (Enirij)',
    nameRu: 'AnyRidge (Эниридж)',
    nameEn: 'AnyRidge',
    aliases: ['anyridge', 'any ridge', 'эниридж', 'эни ридж', 'enirij']
  },
  {
    id: 'hiossen',
    name: 'Hiossen',
    nameUz: 'Hiossen',
    nameRu: 'Hiossen (Хиоссен)',
    nameEn: 'Hiossen',
    aliases: ['hiossen', 'хиоссен', 'хиосен']
  },
  {
    id: 'implant-direct',
    name: 'Implant Direct',
    nameUz: 'Implant Direct',
    nameRu: 'Implant Direct (Имплант Директ)',
    nameEn: 'Implant Direct',
    aliases: ['implant direct', 'имплант директ']
  },
  {
    id: 'ankylos',
    name: 'Ankylos',
    nameUz: 'Ankylos (Ankiloz)',
    nameRu: 'Ankylos (Анкилоз)',
    nameEn: 'Ankylos',
    aliases: ['ankylos', 'анкилоз', 'ankiloz']
  },
  {
    id: 'xive',
    name: 'Xive',
    nameUz: 'Xive (Ksiv)',
    nameRu: 'Xive (Ксив / Зайв)',
    nameEn: 'Xive',
    aliases: ['xive', 'ксив', 'зайв', 'ksiv']
  },
  {
    id: 'astra-tech-system',
    name: 'Astra Tech Implant System',
    nameUz: 'Astra Tech Implant System',
    nameRu: 'Astra Tech Implant System (Астра Тек)',
    nameEn: 'Astra Tech Implant System',
    aliases: ['astra tech implant system', 'astra tech', 'астра тек', 'astra tek']
  },
  {
    id: 'nobel-active',
    name: 'NobelActive',
    nameUz: 'NobelActive (Nobel Aktiv)',
    nameRu: 'NobelActive (Нобель Актив)',
    nameEn: 'NobelActive',
    aliases: ['nobelactive', 'nobel active', 'нобель актив', 'nobel aktiv']
  },
  {
    id: 'nobel-parallel',
    name: 'NobelParallel',
    nameUz: 'NobelParallel (Nobel Parallel)',
    nameRu: 'NobelParallel (Нобель Параллель)',
    nameEn: 'NobelParallel',
    aliases: ['nobelparallel', 'nobel parallel', 'нобель параллель']
  },
  {
    id: 'straumann-blx',
    name: 'Straumann BLX',
    nameUz: 'Straumann BLX',
    nameRu: 'Straumann BLX (Штрауман БЛХ)',
    nameEn: 'Straumann BLX',
    aliases: ['straumann blx', 'blx', 'штрауман блх', 'блэкс']
  },
  {
    id: 'straumann-blt',
    name: 'Straumann BLT',
    nameUz: 'Straumann BLT',
    nameRu: 'Straumann BLT (Штрауман БЛТ)',
    nameEn: 'Straumann BLT',
    aliases: ['straumann blt', 'blt', 'штрауман блт']
  },
  {
    id: 'straumann-bone-level',
    name: 'Straumann Bone Level',
    nameUz: 'Straumann Bone Level',
    nameRu: 'Straumann Bone Level (Штрауман Бон Левел)',
    nameEn: 'Straumann Bone Level',
    aliases: ['straumann bone level', 'bone level', 'штрауман бон левел', 'бон левел']
  },
  {
    id: 'straumann-tissue-level',
    name: 'Straumann Tissue Level',
    nameUz: 'Straumann Tissue Level',
    nameRu: 'Straumann Tissue Level (Штрауман Тиссу Левел)',
    nameEn: 'Straumann Tissue Level',
    aliases: ['straumann tissue level', 'tissue level', 'штрауман тиссу левел', 'тиссу левел']
  },
  {
    id: 'neodent-grand-morse',
    name: 'Neodent Grand Morse',
    nameUz: 'Neodent Grand Morse',
    nameRu: 'Neodent Grand Morse (Неодент Гранд Морс)',
    nameEn: 'Neodent Grand Morse',
    aliases: ['neodent grand morse', 'grand morse', 'неодент гранд морс', 'гранд морс']
  },
  {
    id: 'osstem-ts',
    name: 'Osstem TS',
    nameUz: 'Osstem TS',
    nameRu: 'Osstem TS (Осстем ТС)',
    nameEn: 'Osstem TS',
    aliases: ['osstem ts', 'ts', 'осстем тс']
  },
  {
    id: 'dentium-superline',
    name: 'Dentium SuperLine',
    nameUz: 'Dentium SuperLine',
    nameRu: 'Dentium SuperLine (Дентиум СуперЛайн)',
    nameEn: 'Dentium SuperLine',
    aliases: ['dentium superline', 'superline', 'дентиум суперлайн', 'суперлайн']
  },
  {
    id: 'dentium-implantium',
    name: 'Dentium Implantium',
    nameUz: 'Dentium Implantium',
    nameRu: 'Dentium Implantium (Дентиум Имплантиум)',
    nameEn: 'Dentium Implantium',
    aliases: ['dentium implantium', 'implantium', 'дентиум имплантиум', 'имплантиум']
  },
  {
    id: 'anyone',
    name: 'AnyOne',
    nameUz: 'AnyOne (Enivan)',
    nameRu: 'AnyOne (ЭниВан)',
    nameEn: 'AnyOne',
    aliases: ['anyone', 'any one', 'эниван', 'эни ван', 'enivan']
  },
  {
    id: 'mis-seven',
    name: 'MIS Seven',
    nameUz: 'MIS Seven (MIS 7)',
    nameRu: 'MIS Seven (МИС Севен)',
    nameEn: 'MIS Seven',
    aliases: ['mis seven', 'mis 7', 'мис севен', 'мис 7', 'seven']
  },
  {
    id: 'mis-c1',
    name: 'MIS C1',
    nameUz: 'MIS C1',
    nameRu: 'MIS C1 (МИС С1)',
    nameEn: 'MIS C1',
    aliases: ['mis c1', 'мис с1', 'c1', 'с1']
  },
  {
    id: 'alpha-bio-ice',
    name: 'Alpha-Bio ICE',
    nameUz: 'Alpha-Bio ICE',
    nameRu: 'Alpha-Bio ICE (Альфа-Био Айс)',
    nameEn: 'Alpha-Bio ICE',
    aliases: ['alpha bio ice', 'alpha-bio ice', 'ice', 'айс', 'альфа био айс']
  },
  {
    id: 'alpha-bio-spi',
    name: 'Alpha-Bio SPI',
    nameUz: 'Alpha-Bio SPI',
    nameRu: 'Alpha-Bio SPI (Альфа-Био СПИ)',
    nameEn: 'Alpha-Bio SPI',
    aliases: ['alpha bio spi', 'alpha-bio spi', 'spi', 'спи', 'альфа био спи']
  },
  {
    id: 'biohorizons-tapered-internal',
    name: 'BioHorizons Tapered Internal',
    nameUz: 'BioHorizons Tapered Internal',
    nameRu: 'BioHorizons Tapered Internal (Биогоризонт Тейперед)',
    nameEn: 'BioHorizons Tapered Internal',
    aliases: ['biohorizons tapered internal', 'tapered internal', 'биогоризонт тейперед']
  },
  {
    id: 'zimmer-tapered-screw-vent',
    name: 'Zimmer Tapered Screw-Vent',
    nameUz: 'Zimmer Tapered Screw-Vent',
    nameRu: 'Zimmer Tapered Screw-Vent (Циммер Тейперед Скру-Вент)',
    nameEn: 'Zimmer Tapered Screw-Vent',
    aliases: ['zimmer tapered screw-vent', 'screw vent', 'zimmer screw vent', 'циммер скру вент']
  }
];

// Deduplicate any accidental duplicates by name
const uniqueMap = new Map<string, ImplantSystemItem>();
IMPLANT_SYSTEMS.forEach(item => {
  if (!uniqueMap.has(item.name.toLowerCase())) {
    uniqueMap.set(item.name.toLowerCase(), item);
  }
});
export const DEDUPED_IMPLANT_SYSTEMS = Array.from(uniqueMap.values());

/**
 * Filter implant systems by query string across UZ, RU, and EN representations.
 */
export function filterImplantSystems(query: string, lang: 'uz' | 'ru' | 'en' = 'ru'): ImplantSystemItem[] {
  const cleanQ = query.trim().toLowerCase();
  if (!cleanQ) {
    // Return all sorted by current language representation
    return [...DEDUPED_IMPLANT_SYSTEMS].sort((a, b) => {
      const nameA = lang === 'uz' ? a.nameUz : lang === 'en' ? a.nameEn : a.nameRu;
      const nameB = lang === 'uz' ? b.nameUz : lang === 'en' ? b.nameEn : b.nameRu;
      return nameA.localeCompare(nameB);
    });
  }

  return DEDUPED_IMPLANT_SYSTEMS.filter(item => {
    if (item.name.toLowerCase().includes(cleanQ)) return true;
    if (item.nameUz.toLowerCase().includes(cleanQ)) return true;
    if (item.nameRu.toLowerCase().includes(cleanQ)) return true;
    if (item.nameEn.toLowerCase().includes(cleanQ)) return true;
    return item.aliases.some(alias => alias.toLowerCase().includes(cleanQ));
  }).sort((a, b) => {
    // Prioritize exact prefix matches
    const nameA = a.name.toLowerCase();
    const nameB = b.name.toLowerCase();
    const aStarts = nameA.startsWith(cleanQ);
    const bStarts = nameB.startsWith(cleanQ);
    if (aStarts && !bStarts) return -1;
    if (!aStarts && bStarts) return 1;
    return nameA.localeCompare(nameB);
  });
}
