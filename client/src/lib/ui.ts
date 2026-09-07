/* Drobné stavební prvky seznamů v nastavení (správa projektů a uživatelů).
   Řádek = klikací hlava + rozbalené tělo; akce se ukazují při najetí nebo
   focusu. Třídy jsou v app.css (sekce "seznamy v nastavení"). */

import { icon as svg, type IconName } from './icons';

export function ikona(tvar: IconName, trida = ''): SVGSVGElement {
  const tpl = document.createElement('template');
  tpl.innerHTML = svg(tvar, `ic ${trida}`.trim());
  return tpl.content.firstElementChild as SVGSVGElement;
}

export interface Radek {
  li: HTMLLIElement;
  hlava: HTMLDivElement;
  obsah: HTMLSpanElement;
  akce: HTMLSpanElement;
  telo: HTMLDivElement;
  prepni: (na?: boolean) => void;
}

export function radek(): Radek {
  const li = document.createElement('li');
  li.className = 'lrow';

  const hlava = document.createElement('div');
  hlava.className = 'lhead';
  hlava.setAttribute('role', 'button');
  hlava.setAttribute('tabindex', '0');
  hlava.setAttribute('aria-expanded', 'false');

  /* Pořadí v hlavě je dané: obsah, akce, šipka. */
  const obsah = document.createElement('span');
  obsah.className = 'lbody';

  const akce = document.createElement('span');
  akce.className = 'lacts';

  const sipka = ikona('chevron', 'lchev');
  hlava.append(obsah, akce, sipka);

  const telo = document.createElement('div');
  telo.className = 'ltelo';
  telo.hidden = true;

  const prepni = (na?: boolean) => {
    const otevrit = na === undefined ? telo.hidden : na;
    telo.hidden = !otevrit;
    li.classList.toggle('open', otevrit);
    hlava.setAttribute('aria-expanded', String(otevrit));
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
  wrap.className = 'field';
  const span = document.createElement('span');
  span.textContent = popis;
  const input = document.createElement('input');
  input.name = name;
  input.type = opts.type || 'text';
  input.value = opts.value || '';
  if (opts.required) input.required = true;
  input.className = 'input';
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
  if (druh === 'primary') b.className = 'btn sm';
  else if (druh === 'icon') b.className = 'btn light icon xs';
  else b.className = 'btn ghost sm';
  if (typeof obsah === 'string') b.textContent = obsah;
  else b.appendChild(obsah);
  if (popisek) {
    b.setAttribute('aria-label', popisek);
    b.title = popisek;
  }
  return b;
}

/* Skloňování podle počtu: 1, 2-4, 5 a víc. */
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
