# Mój Warsztat — wersja produkcyjna do wdrożenia (PWA)

**Status: kod aplikacji i bazy przygotowany do wdrożenia; NIE jest jeszcze uruchomioną usługą.**
Aplikacja zacznie działać z rzeczywistymi kontami i prywatnymi danymi dopiero po instalacji bazy Supabase, skonfigurowaniu uwierzytelniania, podłączeniu domeny i wykonaniu testów na Waszych kontach. Nie wysyłaj samych statycznych plików właścicielowi jako „w pełni działającej aplikacji” bez backendu.

## Role

- **Właściciel** — zakłada pierwszy warsztat, widzi wszystkie jego dane, może zapraszać i usuwać administratora, edytuje profil warsztatu, łączy **własne** Google Calendar.
- **Administrator** — osoba zaproszona na konkretny, potwierdzony adres e-mail. Może obsługiwać klientów, zlecenia, wizyty, zdjęcia i części, ale nie może samodzielnie zapraszać kolejnych administratorów ani zmieniać właściciela. Nie otrzymuje tokenu kalendarza właściciela.
- Konto techniczne GitHub/Supabase (dewelopera) jest oddzielne od roli w aplikacji. Posiadacz kluczy administracyjnych backendu ma możliwość dostępu do danych przez panel — ustalcie z właścicielem, kto jest administratorem infrastruktury i jak ten dostęp jest kontrolowany.

## Funkcje

1. Konto e-mail i hasło, opcjonalnie logowanie przez Google po skonfigurowaniu Supabase Auth.
2. Oddzielny warsztat i role zabezpieczone przez Postgres Row Level Security.
3. Klienci, pojazdy z VIN, zlecenia, statusy i orientacyjny kosztorys (bez faktur / KSeF).
4. Wspólny kalendarz wizyt z eksportem `.ics` do telefonu i **ręczną** integracją Google Calendar (Google Identity Services: odczyt najbliższych wydarzeń, wysyłanie / aktualizowanie wybranych wizyt, brak automatycznego tła).
5. Zdjęcia przez aparat lub galerię, prywatny bucket.
6. Magazyn części i eksport CSV do dostawcy (prawdziwe połączenie API hurtowni wymaga danych dostępowych).
7. Szablony SMS i otwarcie aplikacji SMS na telefonie; automatyczne SMS przez serwerową funkcję + SMSAPI po dostarczeniu tokenu.
8. Responsywny interfejs PWA, instalacja na Android/iOS (przy HTTPS), service worker *wyłącznie* dla publicznych plików aplikacji.

## Zawartość

```
public/                  # Pliki publikowane na GitHub Pages
  index.html              # Aplikacja
  app.js                  # Interfejs i połączenia z API
  helpers.js              # Bezpieczne formatowanie / CSV / ICS
  style.css               # Styl responsywny
  config.js               # TYLKO publiczne ustawienia (uzupełnia administrator)
  manifest.webmanifest, sw.js, icon-*.png
supabase/
  migrations/001_initial.sql   # Tabele, polityki RLS, funkcje zaproszeń i limity SMS
  functions/send-sms/index.ts  # Wysyłka przez SMSAPI na serwerze
.github/workflows/pages.yml   # Automatyczne wdrożenie folderu public
DLA_WLASCICIELA.md         # Instrukcja dla kolegi
WDROZENIE_KROK_PO_KROKU.md # Instrukcja techniczna i odbiór bezpieczeństwa
```

## Uruchomienie lokalne interfejsu

```sh
cd public
python -m http.server 8000
```

Otwórz `http://localhost:8000`. Bez prawidłowego `config.js` pojawi się ekran instalacyjny, **nie** fikcyjny ekran logowania. Żadne dane klientów nie są zapisywane w `localStorage`; bibliotekę Supabase pobiera CDN z przypiętej wersji.

## Bezpieczeństwo i granice tej wersji

- W Supabase włącz **Confirm email** i zdefiniuj autoryzowane przekierowania HTTPS.
- W Google Cloud aktywuj Calendar API i dodaj autoryzowaną domenę, a konto właściciela jako testera, jeżeli OAuth jest w trybie testowym. Scope wydarzeń może wymagać weryfikacji Google przy szerszej publikacji.
- W `public/config.js` wolno umieszczać `supabaseUrl`, publiczny klucz `publishable` / `anon`, Google OAuth `Client ID` i przełącznik SMS. **Nigdy** `service_role`, `client_secret`, hasła, tokenu SMSAPI.
- Token Google Calendar jest przechowywany tylko w pamięci bieżącej karty; po odświeżeniu właściciel ponownie przyznaje dostęp. Brak automatycznej synchronizacji w tle i offline CRUD.
- Zdjęcia mogą mieć EXIF (w tym geolokalizację). Jeśli to niepożądane, usuń metadane zdjęć przed przesłaniem; dopisz ten wymóg do polityki wdrożenia.
- Supabase Auth może przechowywać dane sesji w pamięci przeglądarki (`localStorage`) zgodnie ze swoją konfiguracją — to **nie** są dane klientów. Stosuj HTTPS, MFA i higienę urządzeń.
- Repozytorium GitHub może być publiczne; tylko kod i publiczna konfiguracja. W Supabase jest baza i zdjęcia prywatne.
- Zaplanuj kopie zapasowe, retencję danych, rejestr czynności, umowy powierzenia, zasady dostępu i weryfikację RODO przed wprowadzeniem rzeczywistych danych.
- W projekcie nie ma jeszcze integracji API hurtowni, dwustronnej synchronizacji Google w tle, notyfikacji push, raportów finansowych ani faktur.
- Nie przeprowadzono testu end-to-end na działającej instancji Supabase/Google/SMSAPI — potrzebne są Wasze konta, klucze i domena. Wykonaj checklistę z pliku wdrożenia.

## Wydania

Zmiany w gałęzi `main` wdraża GitHub Actions (`pages.yml`). Po instalacji aplikacji na telefonie użytkownik korzysta z jednego stałego adresu; pliki interfejsu są pobierane ponownie w miarę aktualizacji. Dane bazy pozostają w Supabase i nie są zastępowane przy wydaniu nowego frontend-u. Migracje SQL wykonuj osobno, po kopii bezpieczeństwa i przetestowaniu.
