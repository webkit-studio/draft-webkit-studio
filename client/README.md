# client – aplikace na webkit.studio/client

Astro + Cloudflare Workers + D1, nasazuje se přes Webflow Cloud z větve `main`.
Nahrazuje původní statické prostředí postavené na Supabase.

## Techstack

- Astro 7 (`output: 'server'`, `base: '/client'`), adaptér `@astrojs/cloudflare`
- Tailwind v3 přes PostCSS, preset `@relume_io/relume-tailwind`, tokeny
  z `/design/webkit/`
- D1 (SQLite), binding `DB`
- Hesla PBKDF2-SHA256 přes WebCrypto (bcrypt na Workers není)
- Session: neprůhledný token v cookie, v databázi jen jeho SHA-256

## Proměnné prostředí

Ve Webflow Cloud → Environment variables. Do repa nikdy.

| Proměnná | Povinná | K čemu |
|---|---|---|
| `SESSION_SECRET` | ano | podepisuje session; slouží i jako token pro `/setup` |
| `EXPORT_TOKEN` | ne | zapíná read-only export komentářů; bez ní je export vypnutý |

## Struktura

- `src/middleware.ts` – jediné místo, kde se rozhoduje o přístupu
- `src/lib/access.ts` – oprávnění (nahrazuje RLS, které bylo v Supabase)
- `src/lib/viewer.ts` – prohlížeče návrhů; plátno zůstává byte za bytem stejné
- `src/pages/settings/` – Můj účet, Správa projektů, Správa uživatelů
- `public/assets/comments.js` – komentáře s piny (přenesené z původního webu)

## Adresy

| Adresa | Kdo |
|---|---|
| `/client` | přesměruje podle přihlášení |
| `/client/login` | veřejná |
| `/client/setup` | veřejná, ale jen dokud je databáze prázdná |
| `/client/dashboard` | přihlášený |
| `/client/<projekt>` | kdo má přístup k projektu |
| `/client/<projekt>/<verze>/<desktop\|mobile>` | kdo má přístup k projektu |
| `/client/settings/account` | přihlášený |
| `/client/settings/projects`, `/client/settings/users` | admin |

## Export komentářů

Read-only cesta pro nástroje, které nemají session – typicky agent, který
pracuje na plátně a potřebuje si přečíst připomínky klienta.

```
GET /client/api/export/comments?project=<slug>[&version=v2][&format=json|md]
X-Export-Token: <EXPORT_TOKEN>
```

Vrací komentáře včetně odpovědí, seřazené podle `created_at` vzestupně.
Na komentář: `id`, `version`, `view`, `section`, `x`, `y`, `parentId`,
`authorName`, `body`, `resolved`, `createdAt`. Nic z tabulky `users` –
dotaz sahá výhradně do `comments`.

`format=md` vrací `text/markdown` ve stejném tvaru jako tlačítko Export
v prohlížeči návrhu. Dvě věci server vědět nemůže, protože je prohlížeč čte
z vykresleného plátna: pořadí sekcí a jméno klienta z lišty. Použije se pro
ně stejná záložní větev, jakou má prohlížeč – pořadí podle prvního výskytu
a slug projektu.

Chování, na kterém záleží:

- `EXPORT_TOKEN` nenastavený → `503 export-disabled`. Zapomenutá proměnná
  endpoint neotevře.
- chybějící nebo špatný token → `404`, ne `401`. Endpoint o sobě neříká,
  že existuje. Platí i pro jiné metody než GET.
- jiná metoda se správným tokenem → `405`.
- token se porovnává v konstantním čase a neobjeví se v odpovědi ani
  v `request_log`.

Příklad:

```sh
curl -sH "X-Export-Token: $EXPORT_TOKEN" \
  "https://webkit.studio/client/api/export/comments?project=arbosis&format=md"
```

## Vývoj

```sh
npm install
npm run build          # musí předcházet serve i migracím
npm run serve          # wrangler dev nad dist/server/wrangler.json, port 8788
npm run db:migrate     # schéma do lokální D1
npm run db:seed        # dva účty a projekty, hesla vypíše na stdout
npm test               # celá sada Playwright testů
```

Lokální proměnné patří do `client/.dev.vars` (je v `.gitignore`). Build si
soubor kopíruje do `dist/server/.dev.vars` – wrangler čte tuhle kopii, takže
změna v `client/.dev.vars` se projeví až po `npm run build`.

`npm test` běží přes `scripts/test.mjs`. Není to prostý řetěz příkazů schválně:
`wrangler dev` si občas sám shodí ProxyController prázdnou chybou a server
umře uprostřed sady. Runner proto po nezdaru rozliší, jestli server žije
(skutečné selhání testu) nebo ne (vada dev serveru → restart a jedno
zopakování). V produkci běží skutečný Worker a nic takového tam není.
