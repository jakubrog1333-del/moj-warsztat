# Wdrożenie — administrator techniczny (krok po kroku)

## 0. Uzgodnij odpowiedzialność

- Właściciel warsztatu musi wiedzieć, kto administruje projektem Supabase, kto ma dostęp do kopii zapasowych i kto może odtwarzać lub usuwać dane. Uprawnienia do infrastruktury są szersze niż rola `admin` w UI.
- Ustal regulamin przetwarzania danych osobowych, politykę retencji, obowiązek informacyjny RODO i umowy z dostawcami usług.
- Nie wpisuj realnych danych przed zakończeniem odbioru.

## 1. Supabase — nowy projekt

1. Załóż projekt w [Supabase](https://supabase.com/), region w UE, jeśli odpowiada Waszym wymaganiom. Zapewnij odpowiednie kopie zapasowe / plan usługi.
2. W **SQL Editor** wklej i wykonaj `supabase/migrations/001_initial.sql` na **pustym projekcie**.
3. Sprawdź, czy tabela `workshops` oraz wszystkie prywatne tabele mają RLS **enabled** oraz czy istnieje prywatny bucket `damage-photos`.
4. W **Authentication → Providers** włącz Email (oraz opcjonalnie Google) i wymagane potwierdzenie adresu e-mail.
5. W **Authentication → URL Configuration** ustaw URL aplikacji na opublikowany GitHub Pages HTTPS. Dodaj go do redirect allow list. Dla testów lokalnych dopisz `http://localhost:8000/**`.
6. W **Project Settings / API** skopiuj **Project URL** i **publishable key / anon key**. Nigdy nie publikuj `service_role` / `secret key`.

## 2. GitHub Pages — publikacja

1. Utwórz repozytorium (np. `moj-warsztat`). Wgraj **cały projekt** z paczki, w tym `.github/workflows/pages.yml` i katalog `public`.
2. Uzupełnij w `public/config.js`:

   ```js
   window.WARSZTAT_CONFIG = {
     supabaseUrl: 'https://TWOJ-PROJEKT.supabase.co',
     supabasePublishableKey: 'sb_publishable_...', // lub historyczny klucz anon
     googleClientId: 'TWOJ-CLIENT-ID.apps.googleusercontent.com',
     smsEnabled: false,
   };
   ```

3. W GitHub **Settings → Pages → Build and deployment** wybierz **GitHub Actions**; workflow `pages.yml` publikuje `public` na `main`.
4. Poczekaj na zakończenie akcji **Publish PWA to GitHub Pages** i otwórz wynikowy URL HTTPS na telefonie.
5. Wróć do Supabase Auth URL Configuration i dodaj dokładny opublikowany adres do dozwolonych przekierowań. Dla projektu `github.io/nazwa-repo/` uwzględnij ścieżkę repozytorium.
6. Po każdej zmianie kodu twórz commit w `main` — aplikacja zostanie zaktualizowana. Nie wgrywaj `.env`, zdjęć, CSV klientów, tokenów ani kopii baz danych.

## 3. Konta i role

1. Kolega otwiera URL HTTPS, tworzy konto na swój e-mail i potwierdza rejestrację.
2. Wybiera **Utwórz warsztat jako właściciel**.
3. Wchodzi do **Ustawień → Zaproś administratora**, wpisuje **Twój** potwierdzony e-mail i przekazuje Ci link.
4. Ty zakładasz konto na dokładnie wskazany e-mail. Zaproszenie można przyjąć tylko raz, w ciągu 48 godzin, po potwierdzeniu adresu.
5. Właściciel kontroluje i może cofnąć Twój dostęp do warsztatu.
6. Test: drugie, obce konto nie może odczytać klientów ani zdjęć warsztatu; admin nie może nadać sobie roli owner.

## 4. Kalendarz Google właściciela

1. Utwórz projekt w [Google Cloud Console](https://console.cloud.google.com/).
2. Włącz **Google Calendar API**.
3. Skonfiguruj Google Auth Platform / ekran zgody OAuth, zakres uprawnień do wydarzeń w kalendarzu (`https://www.googleapis.com/auth/calendar.events`). Sprawdź, czy potrzebny jest proces weryfikacji Google, i dodaj konto właściciela jako testera, jeśli wymagane.
4. Utwórz **OAuth Client ID → Web application**. W **Authorized JavaScript origins** dodaj pochodzenie domeny, np. `https://twoj-login.github.io` (bez ścieżki repo). Dla lokalnego testowania `http://localhost:8000`.
5. Publiczny Client ID wstaw do `public/config.js`. Nie wstawiaj client secret.
6. Właściciel uruchamia PWA na swoim telefonie, wybiera w Kalendarzu **Połącz Google**, autoryzuje **własne** konto. Może potem pobrać terminy Google i zapisywać wybrane wizyty warsztatu do własnego kalendarza. Brak automatycznej synchronizacji w tle — nie obiecuj jej.
7. Jeśli chcesz **logowanie do aplikacji przez Google**, to osobna konfiguracja dostawcy Google w **Supabase Auth**. Samo ustawienie Client ID Calendar nie włącza logowania Google.

## 5. SMSAPI (opcjonalnie, po poprawnym skonfigurowaniu serwera)

1. Załóż firmowe konto SMSAPI. Uzyskaj token OAuth API. Jeśli stosujesz niestandardową nazwę nadawcy, zarejestruj ją u dostawcy.
2. Zainstaluj [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started) lub uruchom wdrożenie przez dostępną procedurę projektu.
3. Zainstaluj sekrety funkcji po stronie Supabase, **nigdy na GitHub Pages**:

   ```sh
   supabase secrets set SMSAPI_TOKEN='...' SMSAPI_SENDER='...' ALLOWED_ORIGINS='https://twoj-login.github.io' --project-ref TWOJ_PROJECT_REF
   supabase functions deploy send-sms --project-ref TWOJ_PROJECT_REF
   ```

4. Projekt funkcji korzysta dodatkowo z `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` dostarczanych w środowisku Supabase Functions. Sprawdź dostępność tych zmiennych w aktualnym środowisku — jeśli którejś brakuje, ustaw ją jako **server secret** (nie we frontendzie).
5. **Dopiero po udanym teście** zmień `smsEnabled` na `true` w `public/config.js`, opublikuj nową wersję. Zanim wyślesz pierwszego SMS, potwierdź numer, treść, rozliczenia i odpowiednie podstawy prawne.

## 6. Magazyn / dostawcy

Eksport CSV działa. Bez dostępu do API hurtowni nie ma realnego pobierania cen, stanów i zamawiania części. Nie wstawiaj kluczy dostawców do JS. Zintegruj przez osobny serwer / Edge Function, po uzgodnieniu API i warunków handlowych.

## 7. Testy odbiorowe przed danymi klientów

- [ ] Konto właściciela może się zarejestrować, potwierdzić e-mail, zalogować i utworzyć warsztat.
- [ ] Zaproszenie administratora trafia tylko na konkretny e-mail, działa raz, wygasa po 48 h.
- [ ] Obce konto nie może czytać/zmieniać zleceń ani pobierać zdjęć przez REST/storage.
- [ ] Administrator nie może utworzyć zaproszenia / zmienić właściciela.
- [ ] CRUD: klient → pojazd → zlecenie → wizyta → zdjęcie; usuwanie respektuje powiązania.
- [ ] Kalendarz `.ics` otwiera się na Androidzie/iOS; Google pyta o zgodę i zapisuje dokładnie wskazany termin.
- [ ] Po wylogowaniu pobranie zdjęcia po zalogowaniu obcym kontem jest zabronione.
- [ ] PWA działa na HTTPS, ekran instalacji działa; bez internetu widać co najwyżej interfejs, nie ma fałszywych „zapisów offline”.
- [ ] SMSAPI działa tylko z serwera, limit wysyłki działa, klucze nie są dostępne w przeglądarce ani repo.
- [ ] Backup Supabase, scenariusz odtworzenia, polityka retencji, MFA kont technicznych, dostęp administracyjny i umowy RODO są zatwierdzone.
- [ ] Testy w kilku przeglądarkach, aktualizacja schematu i plan wycofania zmian są zatwierdzone.

## 8. Źródła referencyjne

- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/storage/security/access-control
- https://supabase.com/docs/guides/auth/social-sign-in/auth-google
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/workspace/calendar/api/v3/reference/events/insert
- https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- https://www.smsapi.pl/docs/
