// The one place the rest of the app reads on-screen wording from. The
// wording is English (labels.en.js) or Spanish (labels.es.js); setLanguage()
// switches it. The exports are live bindings, so modules that imported them
// see the current language on their next render.

import { EN } from './labels.en.js';
import { ES } from './labels.es.js';

export const LANGUAGES = Object.freeze(['en', 'es']);
const SETS = { en: EN, es: ES };

export let language = 'en';
export let TEAM_NAMES = EN.TEAM_NAMES;
export let POWER_INFO = EN.POWER_INFO;
export let OPTION_LABELS = EN.OPTION_LABELS;
export let TEXT = EN.TEXT;
export let MENU = EN.MENU;

/** Switch every label to `lang` ('en' or 'es'); anything else falls back to English. */
export function setLanguage(lang) {
  language = LANGUAGES.includes(lang) ? lang : 'en';
  ({ TEAM_NAMES, POWER_INFO, OPTION_LABELS, TEXT, MENU } = SETS[language]);
}
