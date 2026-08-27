# Podklady od klienta – fotky realizací

Sem nahrávej fotky realizovaných zahrad. Složka je jen pro podklady, na web se z ní nic
nepublikuje automaticky – vybrané fotky se zpracují (ořez, komprese) a teprve pak vloží
do návrhu.

## Jak pojmenovat

```
<obec>-<typ>-<poradi>.jpg
```

Příklad: `benesov-zahrada-ve-svahu-01.jpg`, `ricany-predzahradka-03.jpg`

Když jsou k jedné zahradě fotky před a po, přidej na konec `-pred` / `-po`:
`benesov-zahrada-ve-svahu-01-pred.jpg`

## Co dodat

- **Formát:** JPG nebo PNG, klidně rovnou z foťáku. Čím větší rozlišení, tím lépe –
  zmenšit se dá vždycky, dopočítat ne. Ideál delší strana od 2000 px výš.
- **Množství:** na sekci realizací stačí 6–12 zahrad, u každé 1–3 fotky.
- **Orientace:** hlavně na šířku (sekce počítá s poměrem 4:3), na výšku jako doplněk.

## Ke každé zahradě prosím i pár údajů

Stačí jeden řádek do `realizace.md` v téhle složce:

```
benesov-zahrada-ve-svahu | Benešov | 2026 | 850 m2 | návrh, terénní úpravy, opěrné zdi, trávník, výsadba | 6 týdnů
```

Tedy: slug | obec | rok | rozloha | rozsah prací | doba realizace

## Práva

U fotek, kde jsou rozpoznatelní lidé, potřebujeme souhlas se zveřejněním.
U cizích fotek (fotograf, dron na zakázku) doklad, že je Arbosis smí použít na webu.

## Použité v návrhu v2

Jedna fotka na řádek služby (hover na počítači, rozbalený řádek na mobilu).
Zpracování: EXIF orientace, převod do sRGB s vloženým profilem, vyvážení bílé,
úrovně, mírná vibrance, ořez 3:2, zmenšení na 1000 × 667, doostření, WebP q74.

| Zdroj | Cíl v `arbosis/v2/assets/realizace/` | Řádek služby |
|---|---|---|
| IMG_0055.JPG | navrhy.webp | 01 Návrhy a projektová dokumentace |
| IMG_7017.jpeg | realizace.webp | 02 Realizace zahrad na klíč |
| IMG_0086.JPG | travnik.webp | 03 Pokládka travního koberce |
| IMG_3764.jpeg | zavlaha.webp | 04 Zavlažovací systémy |
| IMG_0050.JPG | rez-stromu.webp | 05 Profesionální řez stromů |
| Obrázek 2.jpg | kaceni.webp | 06 Rizikové kácení |
| IMG_1307.jpeg | udrzba.webp | 07 Údržba a sezónní péče |

Nepoužito: `IMG_6338.jpeg` – boční průchod mezi domem a plotem, k žádné službě nesedí.

Chybí: fotka z kácení nebo prořezu ve výškách (arborista v postroji, plošina).
`kaceni.webp` je zatím jen dům se vzrostlými stromy a vznikl z předlohy 1036 × 583,
tedy z nejmenšího dodaného souboru.
