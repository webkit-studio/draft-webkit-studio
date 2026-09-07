/* Portál projektu: Průběh, Úkoly, Dokumenty, Poznámky.
 *
 * Struktura zrcadlí Notion (stránka projektu v DB Projekty a její Portál
 * klienta): typy a stavy jsou 1:1 podle tamních vlastností, aby se sem
 * synchronizace jednou napojila bez překladu. Zatím tu data nejsou -
 * loadPortal vrací prázdno. S ?demo=1 vrací ukázková data, aby šel
 * posoudit layout s obsahem. Ukázka je jasně označená a nikam se neukládá. */

export type TaskStatus =
  | 'K řešení' | 'Pracujeme na tom' | 'Čeká' | 'Ke kontrole' | 'Hotovo' | 'Zrušeno' | 'Archiv';

export type DocType = 'Nabídka' | 'Smlouva' | 'Faktura' | 'Brief' | 'Podklad' | 'Objednávka' | 'Návod';

export interface Phase {
  id: string;
  name: string;
  state: 'done' | 'current' | 'next';
  /* zobrazované datum: "6. 9." u hotových, plán u dalších */
  date?: string;
  /* kolik úkolů fáze je hotových / celkem */
  done?: number;
  total?: number;
}

export interface Task {
  id: string;
  name: string;
  status: TaskStatus;
  phase?: string;
  due?: string;
  assignee?: string;
  description?: string;
  /* Notion "Cena za úkol" */
  price?: number;
}

export interface Doc {
  id: string;
  name: string;
  type: DocType;
  created: string;
  updated?: string;
  note?: string;
  amount?: number;
  due?: string;
  files: number;
}

export interface Note {
  id: string;
  title: string;
  excerpt: string;
  created: string;
  author: string;
}

export interface Portal {
  source: 'empty' | 'demo';
  phases: Phase[];
  tasks: Task[];
  docs: Doc[];
  notes: Note[];
}

/* Barvy štítků podle skupin stavů v Notionu (to_do / in_progress / complete). */
export const STATUS_CHIP: Record<TaskStatus, string> = {
  'K řešení': '',
  'Pracujeme na tom': 'blue',
  'Čeká': 'warn',
  'Ke kontrole': 'orange',
  'Hotovo': 'ok',
  'Zrušeno': 'danger',
  'Archiv': ''
};

export const DOC_CHIP: Record<DocType, string> = {
  'Nabídka': 'blue',
  'Smlouva': 'purple',
  'Faktura': 'ok',
  'Brief': 'warn',
  'Podklad': '',
  'Objednávka': 'brown',
  'Návod': 'orange'
};

export const OPEN_STATUSES: TaskStatus[] = ['K řešení', 'Pracujeme na tom', 'Čeká', 'Ke kontrole'];

export const SECTIONS = [
  { id: 'overview', slug: '', label: 'Přehled', icon: 'home' },
  { id: 'navrhy', slug: 'navrhy', label: 'Návrhy', icon: 'layers' },
  { id: 'ukoly', slug: 'ukoly', label: 'Úkoly', icon: 'check' },
  { id: 'dokumenty', slug: 'dokumenty', label: 'Dokumenty', icon: 'file' },
  { id: 'poznamky', slug: 'poznamky', label: 'Poznámky', icon: 'note' }
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

/* Obálka projektu: pár barev odvozený ze slugu, ať má každý projekt svou
   tvář a přitom drží paletu webu. */
const PALETTES: [string, string][] = [
  ['#1D2BE8', '#8A96FF'],
  ['#101321', '#1D2BE8'],
  ['#5B67F5', '#C7CCFF'],
  ['#1523B8', '#7F8BFF'],
  ['#3A3F52', '#8A96FF'],
  ['#2A36E0', '#B9C1FF']
];

export function gradientFor(slug: string): { g1: string; g2: string; hx: number; hy: number } {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [g1, g2] = PALETTES[h % PALETTES.length];
  return { g1, g2, hx: 55 + (h % 35), hy: 10 + ((h >> 3) % 40) };
}

export function formatKc(n: number): string {
  return new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 }).format(n);
}

function demo(project: string): Portal {
  return {
    source: 'demo',
    phases: [
      { id: 'p1', name: 'Analýza', state: 'done', date: '14. 8.', done: 6, total: 6 },
      { id: 'p2', name: 'Zadání', state: 'done', date: '28. 8.', done: 4, total: 4 },
      { id: 'p3', name: 'Realizace', state: 'current', date: 'do 30. 9.', done: 3, total: 8 },
      { id: 'p4', name: 'Předání', state: 'next', date: 'říjen', done: 0, total: 3 }
    ],
    tasks: [
      { id: 't1', name: 'Odsouhlasit texty hlavní stránky', status: 'Ke kontrole', phase: 'Realizace', due: '9. 9.', assignee: 'Klient' },
      { id: 't2', name: 'Dodat fotky týmu v tiskové kvalitě', status: 'Čeká', phase: 'Realizace', due: '12. 9.', assignee: 'Klient' },
      { id: 't3', name: 'Napojit formulář na CRM', status: 'Pracujeme na tom', phase: 'Realizace', due: '16. 9.', assignee: 'Lukáš S.' },
      { id: 't4', name: 'Připravit stránky služeb', status: 'K řešení', phase: 'Realizace', due: '20. 9.', assignee: 'Lukáš S.' },
      { id: 't5', name: 'Nastavit doménu a DNS', status: 'K řešení', phase: 'Předání', assignee: 'Lukáš S.' },
      { id: 't6', name: 'Schválit wireframe', status: 'Hotovo', phase: 'Zadání', due: '26. 8.', assignee: 'Klient' },
      { id: 't7', name: 'Vyplnit brief', status: 'Hotovo', phase: 'Analýza', due: '12. 8.', assignee: 'Klient' }
    ],
    docs: [
      { id: 'd1', name: `Cenová nabídka – ${project}`, type: 'Nabídka', created: '8. 8. 2026', amount: 148000, files: 1 },
      { id: 'd2', name: 'Podmínky spolupráce', type: 'Smlouva', created: '11. 8. 2026', files: 1 },
      { id: 'd3', name: 'Faktura 2026-014', type: 'Faktura', created: '1. 9. 2026', amount: 74000, due: '15. 9. 2026', files: 1 },
      { id: 'd4', name: 'Brief webu', type: 'Brief', created: '12. 8. 2026', files: 2 },
      { id: 'd5', name: 'Logo a manuál značky', type: 'Podklad', created: '13. 8. 2026', note: 'od klienta', files: 4 }
    ],
    notes: [
      { id: 'n1', title: 'Schůzka 4. 9.', excerpt: 'Prošli jsme druhou verzi návrhu. Hlavní stránka drží, u služeb chce klient víc fotek z realizací a kratší texty.', created: '4. 9. 2026', author: 'Lukáš S.' },
      { id: 'n2', title: 'Rozhodnutí: jedna poptávková stránka', excerpt: 'Místo formuláře na každé stránce bude jedna poptávka s výběrem termínu. Důvod: méně polí, víc odeslání.', created: '28. 8. 2026', author: 'Lukáš S.' },
      { id: 'n3', title: 'Přístupy', excerpt: 'Webflow, doména a Google Search Console jsou nasdílené na inbox@. Analytics doplníme po spuštění.', created: '20. 8. 2026', author: 'Lukáš S.' }
    ]
  };
}

export function loadPortal(project: string, showDemo: boolean): Portal {
  if (showDemo) return demo(project);
  return { source: 'empty', phases: [], tasks: [], docs: [], notes: [] };
}
