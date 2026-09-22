# Dýňová stezka Úvaly – zprovoznění (cca 15 minut)

Web je jeden soubor `index.html`. Bez nastavení běží v **ukázkovém režimu** (vymyšlená stanoviště, ukládá se jen v daném prohlížeči). Aby se stanoviště sdílela mezi všemi sousedy, propojte ho s Google Tabulkou:

## 1. Google Tabulka + skript
1. Na drive.google.com vytvořte novou prázdnou Google Tabulku, např. „Dýňová stezka 2026“.
2. **Rozšíření → Apps Script**, smažte obsah a vložte celý soubor `Code.gs`.
3. V řádku `ADMIN_KEY` změňte heslo správce (bude potřeba pro mazání nevhodných záznamů).
4. Uložte (ikona diskety).

## 2. Nasazení jako webová aplikace
1. **Nasadit → Nové nasazení → typ: Webová aplikace**.
2. *Spustit jako:* **Já**, *Kdo má přístup:* **Kdokoli**.
3. Potvrďte oprávnění (Google upozorní na neověřenou aplikaci → Rozšířené → Přejít na…).
4. Zkopírujte **URL webové aplikace** (končí `/exec`).

> Po každé úpravě `Code.gs` je potřeba **Spravovat nasazení → upravit → Nová verze**, jinak běží stará verze.

## 3. Propojení webu
V `index.html` najděte blok `CONFIG` a vložte URL:

```js
API_URL: "https://script.google.com/macros/s/…/exec",
```

### Mapa Mapy.com
1. Na **developer.mapy.com** se přihlaste Seznam účtem a v sekci API klíče vytvořte nový klíč (bezplatný tarif stačí).
2. Vložte ho do `CONFIG`: `MAPY_API_KEY: "váš-klíč",`
3. Klíč je vidět ve zdrojovém kódu stránky. Pokud to portál umožňuje, omezte ho na doménu `alescermak79-lab.github.io`.

S klíčem má mapa přepínač **Mapa / Letecká**. Bez klíče se použije náhradní mapa OpenStreetMap.

Tamtéž můžete upravit čas akce (`START`, `END`), sraz (`MEETING`) a střed mapy (`CENTER`).

## 4. Zveřejnění na GitHub Pages
1. Na GitHubu (účet alescermak79-lab) vytvořte veřejné repo, např. `dynova-stezka`.
2. Nahrajte `index.html` (Add file → Upload files).
3. Settings → Pages → Branch: `main` / root → Save.
4. Za minutu běží na `https://alescermak79-lab.github.io/dynova-stezka/`.

Odkaz pošlete do sousedské skupiny, ideálně i jako QR kód na letáček.

## Správa
- Každý soused může upravit nebo smazat jen své stanoviště (z telefonu, kde ho přidal).
- Správce otevře web s `?admin=HESLO` na konci adresy → u každého stanoviště v mapě uvidí „Smazat (správce)“.
- Všechna data vidíte přímo v Google Tabulce (list „Stanoviste“) – dá se tam i ručně opravovat.
