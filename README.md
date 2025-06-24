# Integrator Listy Ostrzeżeń

Rozszerzenie do przeglądarek internetowych, które chroni użytkowników przed odwiedzaniem stron znajdujących się na Liście Ostrzeżeń CERT Polska - oficjalnym wykazie niebezpiecznych stron internetowych prowadzonym przez CERT Polska.

## O Liście Ostrzeżeń

Lista Ostrzeżeń to publiczny wykaz domen internetowych, które zostały zidentyfikowane jako niebezpieczne dla użytkowników. Prowadzona przez CERT Polska (Computer Emergency Response Team), zawiera adresy stron phishingowych, rozpowszechniających złośliwe oprogramowanie oraz prowadzących inne działania szkodliwe. Więcej informacji: [cert.pl/lista-ostrzezen](https://cert.pl/lista-ostrzezen/).

## Funkcje

- **Automatyczna ochrona** - blokuje dostęp do wszystkich domen z Listy Ostrzeżeń CERT Polska
- **Inteligentne aktualizacje** - lista jest odświeżana co 5 minut podczas aktywnego przeglądania oraz pobierana fragmentami dla większej wydajności
- **Strona ostrzegawcza** - przekierowuje na oficjalną stronę CERT Polska z informacją o zagrożeniu
- **Wsparcie wielu przeglądarek** - działa zarówno w Firefox, jak i przeglądarkach opartych na Chromium

## Instalacja

### Wymagania

- Node.js (wersja 14 lub nowsza)
- npm

### Kroki instalacji

1. Sklonuj repozytorium:
   ```bash
   git clone [adres-repozytorium]
   ```

2. Zainstaluj zależności:
   ```bash
   npm install
   ```

3. Zbuduj rozszerzenie:
   ```bash
   npm run build
   ```

4. Spakuj rozszerzenie do dystrybucji:
   ```bash
   npm run package
   ```

## Zasada działania

1. **Pobieranie listy** - rozszerzenie regularnie pobiera aktualną Listę Ostrzeżeń z serwisu hole.cert.pl
2. **Monitorowanie ruchu** - wszystkie próby nawigacji są sprawdzane przez rozszerzenie
3. **Blokowanie zagrożeń** - gdy użytkownik próbuje wejść na niebezpieczną stronę, zostaje przekierowany na stronę ostrzegawczą: `https://hole.cert.pl/?url=[zablokowany-adres]`

## Prywatność

Rozszerzenie działa lokalnie w przeglądarce użytkownika. Nie przesyła żadnych danych o odwiedzanych stronach do zewnętrznych serwerów. Jedyną komunikacją sieciową jest pobieranie aktualnej Listy Ostrzeżeń z hole.cert.pl.

## Licencja

MIT