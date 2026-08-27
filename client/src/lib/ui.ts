/* Drobné stavební prvky seznamů v nastavení.
 *
 * Struktura je Relume (Stacked List + akordeon), vzhled z /design/webkit/:
 * radius 0, hairline místo stínu, akce se ukazují až při najetí. Sdílí to
 * správa projektů i správa uživatelů, ať se oba seznamy chovají stejně.
 *
 * Ikony jsou vepsané SVG, ne emoji ani fontová knihovna - design systém emoji
 * zakazuje a jedna knihovna navíc by se do Workeru tahala kvůli pěti tvarům. */

type Tvar = 'plus' | 'pencil' | 'trash' | 'chevron' | 'copy' | 'refresh';

const CESTY: Record<Tvar, string> = {
  plus: 'M10 4.5v11M4.5 10h11',
  pencil: 'M3 17h3l9-9-3-3-9 9v3zM12.5 5.5l3 3',
  trash: 'M3.5 5.5h13M8 5.5V3h4v2.5M5.5 5.5l.8 11h7.4l.8-11M8.5 8.5v5M11.5 8.5v5',
  chevron: 'M5 8l5 5 5-5',
  copy: 'M7 7V4h9v9h-3M4 7h9v9H4z',
  refresh: 'M16 10a6 6 0 1 1-1.8-4.3M16 3v3.5h-3.5'
};

export function ikona(tvar: Tvar, trida = ''): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `h-4 w-4 flex-none ${trida}`.trim());
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', CESTY[tvar]);
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '1.4');
  path.setAttribute('stroke-linecap', 'square');
  svg.appendChild(path);
  return svg;
}

export interface Radek {
  li: HTMLLIElement;
  /* klikací hlava řádku */
  hlava: HTMLDivElement;
  /* sem patří obsah řádku - hlava sama drží ještě akce a šipku */
  obsah: HTMLSpanElement;
  /* ikony akcí, viditelné až při najetí nebo focusu */
  akce: HTMLSpanElement;
  /* rozbalený obsah */
  telo: HTMLDivElement;
  prepni: (na?: boolean) => void;
}

export function radek(): Radek {
  const li = document.createElement('li');
  li.className = 'group border-b border-gray-300';

  const hlava = document.createElement('div');
  hlava.className =
    'flex cursor-pointer items-center gap-3 px-4 py-4 transition-colors duration-fast ease-out hover:bg-gray-100';
  hlava.setAttribute('role', 'button');
  hlava.setAttribute('tabindex', '0');
  hlava.setAttribute('aria-expanded', 'false');

  /* Pořadí v hlavě je dané: obsah, akce, šipka. Volající plní jen obsah -
     kdyby si skládal celou hlavu sám, akce by mu snadno skončily za šipkou. */
  const obsah = document.createElement('span');
  obsah.className = 'flex min-w-0 flex-1 items-center gap-3';

  const akce = document.createElement('span');
  /* Klávesnicí se k akcím musí jít dostat i bez myši - proto focus-within. */
  akce.className =
    'flex flex-none items-center gap-1 opacity-0 transition-opacity duration-fast ease-out group-hover:opacity-100 focus-within:opacity-100';

  const sipka = ikona('chevron', 'transition-transform duration-fast ease-out');
  hlava.append(obsah, akce, sipka);

  const telo = document.createElement('div');
  telo.className = 'hidden border-t border-gray-300 bg-gray-100 px-4 py-5';

  const prepni = (na?: boolean) => {
    const otevrit = na === undefined ? telo.classList.contains('hidden') : na;
    telo.classList.toggle('hidden', !otevrit);
    hlava.setAttribute('aria-expanded', String(otevrit));
    sipka.style.transform = otevrit ? 'rotate(180deg)' : '';
  };

  hlava.addEventListener('click', () => prepni());
  hlava.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      prepni();
    }
  });

  li.append(hlava, telo);
  return { li, hlava, obsah, akce, telo, prepni };
}

export interface Pole {
  wrap: HTMLLabelElement;
  input: HTMLInputElement;
}

export function poleText(
  name: string,
  popis: string,
  opts: { required?: boolean; value?: string; type?: string } = {}
): Pole {
  const wrap = document.createElement('label');
  wrap.className = 'block';
  const span = document.createElement('span');
  span.className = 'mb-1 block text-tiny text-gray-500';
  span.textContent = popis;
  const input = document.createElement('input');
  input.name = name;
  input.type = opts.type || 'text';
  input.value = opts.value || '';
  if (opts.required) input.required = true;
  input.className = 'h-11 w-full border border-gray-300 bg-white px-3 text-small outline-none';
  wrap.append(span, input);
  return { wrap, input };
}

export function tlacitko(
  obsah: string | Node,
  druh: 'primary' | 'ghost' | 'icon' = 'ghost',
  popisek?: string
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  if (druh === 'primary') {
    b.className =
      'h-11 bg-black px-5 text-small font-semibold text-white transition-colors duration-fast ease-out hover:bg-accent hover:text-accent-ink';
  } else if (druh === 'icon') {
    b.className =
      'flex h-[32px] w-[32px] items-center justify-center border border-gray-300 bg-white text-gray-500 transition-colors duration-fast ease-out hover:border-black hover:text-black';
  } else {
    b.className =
      'h-11 border border-black px-5 text-small font-semibold transition-colors duration-fast ease-out hover:bg-black hover:text-white';
  }
  if (typeof obsah === 'string') b.textContent = obsah;
  else b.appendChild(obsah);
  if (popisek) {
    b.setAttribute('aria-label', popisek);
    b.title = popisek;
  }
  return b;
}

/* Skloňování podle počtu. "1 uživatelů" je drobnost, ale je vidět na každém
   řádku seznamu. Čeština má tři tvary: 1, 2-4, 5 a víc. */
export function mnozne(n: number, tvary: [string, string, string]): string {
  if (n === 1) return tvary[0];
  if (n >= 2 && n <= 4) return tvary[1];
  return tvary[2];
}

export const UZIVATEL: [string, string, string] = ['uživatel', 'uživatelé', 'uživatelů'];
export const KOMENTAR: [string, string, string] = ['komentář', 'komentáře', 'komentářů'];

/* Mazání je nevratné, takže se na něj vždycky ptáme. */
export function potvrd(otazka: string): boolean {
  return window.confirm(otazka);
}
