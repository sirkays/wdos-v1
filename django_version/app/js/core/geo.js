/** African countries + Nigerian states — shared by profile & apply forms. */
export const AFRICAN_COUNTRIES = [
  'Algeria', 'Angola', 'Benin', 'Botswana', 'Burkina Faso', 'Burundi',
  'Cabo Verde', 'Cameroon', 'Central African Republic', 'Chad', 'Comoros',
  'Congo (Brazzaville)', 'Congo (DRC)', "Côte d'Ivoire", 'Djibouti',
  'Egypt', 'Equatorial Guinea', 'Eritrea', 'Eswatini', 'Ethiopia', 'Gabon',
  'Gambia', 'Ghana', 'Guinea', 'Guinea-Bissau', 'Kenya', 'Lesotho',
  'Liberia', 'Libya', 'Madagascar', 'Malawi', 'Mali', 'Mauritania',
  'Mauritius', 'Morocco', 'Mozambique', 'Namibia', 'Niger', 'Nigeria',
  'Rwanda', 'São Tomé & Príncipe', 'Senegal', 'Seychelles', 'Sierra Leone',
  'Somalia', 'South Africa', 'South Sudan', 'Sudan', 'Tanzania', 'Togo',
  'Tunisia', 'Uganda', 'Zambia', 'Zimbabwe', 'Other (outside Africa)',
];

export const NG_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue',
  'Borno', 'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu',
  'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
  'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo',
  'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
];

export const COUNTRY_ISO = {
  'Algeria':'DZ','Angola':'AO','Benin':'BJ','Botswana':'BW',
  'Burkina Faso':'BF','Burundi':'BI','Cabo Verde':'CV','Cameroon':'CM',
  'Central African Republic':'CF','Chad':'TD','Comoros':'KM',
  'Congo (Brazzaville)':'CG','Congo':'CG','Congo (DRC)':'CD','DR Congo':'CD',
  "Côte d'Ivoire":'CI','Djibouti':'DJ','Egypt':'EG','Equatorial Guinea':'GQ',
  'Eritrea':'ER','Eswatini':'SZ','Ethiopia':'ET','Gabon':'GA','Gambia':'GM',
  'Ghana':'GH','Guinea':'GN','Guinea-Bissau':'GW','Kenya':'KE','Lesotho':'LS',
  'Liberia':'LR','Libya':'LY','Madagascar':'MG','Malawi':'MW','Mali':'ML',
  'Mauritania':'MR','Mauritius':'MU','Morocco':'MA','Mozambique':'MZ',
  'Namibia':'NA','Niger':'NE','Nigeria':'NG','Rwanda':'RW',
  'São Tomé & Príncipe':'ST','Senegal':'SN','Seychelles':'SC',
  'Sierra Leone':'SL','Somalia':'SO','South Africa':'ZA','South Sudan':'SS',
  'Sudan':'SD','Tanzania':'TZ','Togo':'TG','Tunisia':'TN','Uganda':'UG',
  'Zambia':'ZM','Zimbabwe':'ZW',
};

/* Phase 137 — country flags (bundled SVGs in /assets/flags, works on every device) */
const COUNTRY_ISO_ALIASES = {"Cape Verde": "CV", "Congo": "CG", "Republic of the Congo": "CG", "DR Congo": "CD", "Democratic Republic of the Congo": "CD", "Gambia": "GM", "The Gambia": "GM", "Ivory Coast": "CI", "Cote d'Ivoire": "CI", "Côte d'Ivoire": "CI", "Sao Tome and Principe": "ST", "São Tomé and Príncipe": "ST", "Eswatini": "SZ", "Tanzania": "TZ"};
export function countryIso(name, fallbackIso) {
  if (fallbackIso) return String(fallbackIso).toUpperCase();
  if (!name) return null;
  const all = { ...COUNTRY_ISO, ...COUNTRY_ISO_ALIASES };
  const k = Object.keys(all).find((n) => n.toLowerCase() === String(name).trim().toLowerCase());
  return k ? all[k] : null;
}
export function flagSrc(iso) { return iso ? `/assets/flags/${String(iso).toLowerCase()}.svg` : null; }

/* Phase 145 — the three most used languages per country, as language codes the
   room and the interface support (en fr pt ar sw ha yo ig). First = default. */
export const COUNTRY_LANGS = {
  NG: ['en', 'ha', 'yo'], GH: ['en', 'fr', 'sw'], KE: ['sw', 'en', 'ar'], UG: ['en', 'sw', 'fr'], TZ: ['sw', 'en', 'ar'],
  RW: ['fr', 'en', 'sw'], BI: ['fr', 'sw', 'en'], CD: ['fr', 'sw', 'pt'], CG: ['fr', 'pt', 'en'], CM: ['fr', 'en', 'ha'],
  SN: ['fr', 'ar', 'en'], ML: ['fr', 'ar', 'en'], NE: ['fr', 'ha', 'ar'], BF: ['fr', 'ar', 'en'], BJ: ['fr', 'yo', 'en'],
  TG: ['fr', 'en', 'yo'], CI: ['fr', 'en', 'ar'], GN: ['fr', 'ar', 'en'], GW: ['pt', 'fr', 'en'], GM: ['en', 'fr', 'ar'],
  SL: ['en', 'fr', 'ar'], LR: ['en', 'fr', 'ar'], TD: ['fr', 'ar', 'ha'], CF: ['fr', 'ar', 'en'], GA: ['fr', 'en', 'pt'],
  GQ: ['fr', 'pt', 'en'], ST: ['pt', 'fr', 'en'], AO: ['pt', 'fr', 'en'], MZ: ['pt', 'en', 'sw'], CV: ['pt', 'fr', 'en'],
  ZA: ['en', 'pt', 'fr'], ZM: ['en', 'sw', 'pt'], ZW: ['en', 'pt', 'sw'], MW: ['en', 'sw', 'pt'], BW: ['en', 'fr', 'pt'],
  NA: ['en', 'pt', 'fr'], LS: ['en', 'fr', 'pt'], SZ: ['en', 'pt', 'fr'], MG: ['fr', 'en', 'ar'], KM: ['fr', 'ar', 'sw'],
  MU: ['en', 'fr', 'ar'], SC: ['en', 'fr', 'ar'], DJ: ['fr', 'ar', 'en'], SO: ['ar', 'en', 'sw'], ER: ['ar', 'en', 'fr'],
  ET: ['en', 'ar', 'fr'], SS: ['en', 'ar', 'sw'], SD: ['ar', 'en', 'fr'], EG: ['ar', 'en', 'fr'], LY: ['ar', 'en', 'fr'],
  TN: ['ar', 'fr', 'en'], DZ: ['ar', 'fr', 'en'], MA: ['ar', 'fr', 'en'], MR: ['ar', 'fr', 'en'],
};
export const LANG_NAMES = { en: 'English', fr: 'Français', pt: 'Português', ar: 'العربية', sw: 'Kiswahili', ha: 'Hausa', yo: 'Yorùbá', ig: 'Igbo' };
export function countryLangs(iso) { return COUNTRY_LANGS[String(iso || '').toUpperCase()] || ['en', 'fr', 'pt']; }

/* Phase 169 — African Union regions, for coverage by region */
export const AF_REGIONS = {
  'West Africa': ['BJ', 'BF', 'CV', 'CI', 'GM', 'GH', 'GN', 'GW', 'LR', 'ML', 'MR', 'NE', 'NG', 'SN', 'SL', 'TG'],
  'East Africa': ['BI', 'KM', 'DJ', 'ER', 'ET', 'KE', 'MG', 'MU', 'RW', 'SC', 'SO', 'SS', 'SD', 'TZ', 'UG'],
  'Central Africa': ['AO', 'CM', 'CF', 'TD', 'CG', 'CD', 'GQ', 'GA', 'ST'],
  'Southern Africa': ['BW', 'SZ', 'LS', 'MW', 'MZ', 'NA', 'ZA', 'ZM', 'ZW'],
  'North Africa': ['DZ', 'EG', 'LY', 'MA', 'TN'],
};
export function regionOf(iso) { for (const [r, l] of Object.entries(AF_REGIONS)) if (l.includes(String(iso || '').toUpperCase())) return r; return 'Other'; }
