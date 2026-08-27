# Podklady od klienta – loga a symboly partnerů

Sem nahraj originální loga a symboly, které dodá klient. Zpracované verze pro web
si z nich připravím a uložím do `arbosis/v2/assets/loga/`.

## Pojmenování

`<slug>.<pripona>` – slug bez diakritiky a mezer, malá písmena.

Dnes používané slugy: `reinvest`, `auto-opat`, `felix`, `geosan`, `aquasys`, `hecht`.
U nové firmy zvol slug podle názvu, např. `stavby-novak`.

Když je od jedné firmy víc variant, přidej příponu:
`geosan-symbol.svg`, `geosan-inverzni.svg`, `geosan-horizontalni.svg`

## Co je nejlepší dodat

1. **SVG** – ideál, škáluje se a jde obarvit.
2. **PNG s průhledným pozadím** v co největším rozlišení (delší strana od 1000 px).
3. Cokoliv dalšího jen jako nouzovka – z JPG na bílém pozadí se použitelné logo nevyrobí.

Pokud existuje brand manuál nebo balík „logo ke stažení", nahraj ho celý, vyberu si z něj.

## Poznámka k barvám

Do pásu na webu se loga zobrazují jednobarevně (tmavě zelená na krémové). U jednobarevných
SVG to řeším přes `currentColor`. U vícebarevných log (Hecht, Auto Opat, Geosan) potřebuju
buď jednobarevnou variantu z brand manuálu, nebo souhlas klienta s převodem do jedné barvy.
