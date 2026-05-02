---
title: Integritetspolicy
---

# Integritetspolicy — Tipspromenaden

**Senast uppdaterad:** 2026-04-30

Den här policyn beskriver hur Tipspromenaden samlar in, använder och lagrar
personuppgifter. Den uppfyller kraven i EU:s dataskyddsförordning (GDPR).

---

## 1. Personuppgiftsansvarig

Tipspromenaden drivs av **Niklas Eriksson** som privatperson, hemmahörande i
Sverige. Kontakt:
**[tipspromenaden.app@gmail.com](mailto:tipspromenaden.app@gmail.com)**.

Vi är inte skyldiga att utse dataskyddsombud (DPO) — vi behandlar inte
personuppgifter i den omfattning eller känslighet som GDPR Art. 37 kräver.

## 2. Vilka personuppgifter samlas in — och varför

Tabellen nedan listar varje datakategori, ändamål och rättslig grund (GDPR
Art. 6).

| Data | Ändamål | Rättslig grund |
|---|---|---|
| **Smeknamn** (självvalt) | Visas i topplistan så deltagare kan se sitt eget och andras resultat | Avtal (Art. 6.1.b) — för att leverera tjänsten du bett om |
| **Anonymt UID** (Firebase Auth) | Koppla dig till dina svar utan att kräva inloggning | Avtal (Art. 6.1.b) |
| **Svar och poäng** | Beräkna och visa resultat | Avtal (Art. 6.1.b) |
| **Tidsstämplar** (start/slut) | Sortera topplistan efter snabbast tid | Avtal (Art. 6.1.b) |
| **GPS-position** (under promenad) | Avgöra när du är vid en kontrollpunkt så frågan låses upp. Lämnar **aldrig** din enhet. | Avtal (Art. 6.1.b) |
| **E-post** (vid Google-inloggning) | Identifiera dig som ägare av promenader du skapar | Avtal (Art. 6.1.b) |
| **Promenader du skapar** (titel, frågor, koordinater) | Lagra ditt innehåll så du och andra kan spela | Avtal (Art. 6.1.b) |
| **Steg under aktiv promenad** (om du gett behörigheten "Fysisk aktivitet") | Visa antal steg i resultatet och topplistan | Samtycke (Art. 6.1.a) — du kan neka behörigheten utan att appens kärna slutar fungera |
| **Display-namn från Google** (om Google-inloggad) | Föreslås som default-smeknamn — du kan ändra | Avtal (Art. 6.1.b) |

### 2.1 Vad vi INTE samlar in

- Användningsanalys (Google Analytics, Firebase Analytics eller liknande)
- Reklam-ID eller spårare
- Kontaktlistor, kalender, media, mikrofon
- Kamera utöver QR-kodsscanning (bilden lämnar aldrig enheten)
- Krasch- eller diagnostikdata

## 3. Tredje part och tredjelandsöverföring

Appen använder **Google Firebase** (Firestore, Authentication, Storage) som
personuppgiftsbiträde för att lagra promenader, sessioner och frågebilder.
Google Cloud-tjänster behandlar data både i EU och i USA.

**Tredjelandsöverföring:** Överföring till USA sker under
[**EU-US Data Privacy Framework**](https://commission.europa.eu/document/fa09cbad-dd7d-4684-ae58-be7c0d0bd3cf_en)
(adekvansbeslut antaget 2023-07-10) under vilket Google LLC är certifierat,
samt Googles standardavtalsklausuler enligt
[Googles Data Processing Addendum](https://cloud.google.com/terms/data-processing-addendum).

Google behandlar data enligt sin egen integritetspolicy:
[https://policies.google.com/privacy](https://policies.google.com/privacy).

Inga andra tredjepartstjänster tar emot dina data.

## 4. Lagringstid

| Data | Lagras i |
|---|---|
| **Promenader du skapat som inloggad** | Tills du raderar dem (eller raderar kontot). Permanent annars. |
| **Anonyma sessioner och dina deltagardata** | Tills du raderar kontot via appen (Inställningar → Radera konto) eller begär det via e-post. Inaktiva anonyma sessioner förblir lagrade tills vidare — vi har ingen automatisk TTL-radering än. |
| **Frågebilder du laddat upp** | Samma livstid som tillhörande promenad |
| **Loggar hos Firebase** | Enligt Googles standardretention (typiskt 30–180 dagar) |
| **Eventuella backups hos Google** | Enligt Googles interna retention, max enligt deras [DPA](https://cloud.google.com/terms/data-processing-addendum) |

## 5. Radering och dina rättigheter (GDPR Art. 15-21)

Som användare i EU/EES har du rätt att:

- **Få information** om vilka data vi har om dig (Art. 15)
- **Begära rättelse** av felaktiga uppgifter (Art. 16)
- **Bli glömd** — radera dina data (Art. 17)
- **Begränsa behandlingen** (Art. 18)
- **Få en kopia** i maskinläsbart format — dataportabilitet (Art. 20)
- **Invända** mot behandling (Art. 21)
- **Klaga till tillsynsmyndighet** —
  [Integritetsskyddsmyndigheten (IMY)](https://www.imy.se/privatperson/utfora-arende/lamna-ett-klagomal/)

### 5.1 Hur du raderar din data

1. **I appen:** Inställningar → Radera konto. Tar bort:
   - Ditt Firebase Auth-konto
   - Promenader du skapat
   - Sessioner du startat
   - Dina deltagardata i sessioner du är ägare av

2. **Det som INTE raderas automatiskt:** deltagardata du lämnat i *andra*
   personers sessioner (t.ex. när du gått en promenad någon annan skapat).
   Skicka e-post till tipspromenaden.app@gmail.com med ditt UID om du vill
   ha även dem borttagna — vi raderar manuellt inom 30 dagar.

3. **Anonym användare:** Du kan radera din egen anonyma identitet via samma
   knapp. Eller skicka e-post med ditt UID (visas i appen under
   Inställningar).

### 5.2 Utöva andra rättigheter

Skicka e-post till
[tipspromenaden.app@gmail.com](mailto:tipspromenaden.app@gmail.com).
Vi svarar inom 30 dagar enligt GDPR Art. 12.3.

## 6. Barn under 13 år

Tjänsten är inte avsedd att användas av barn under 13 år utan vårdnadshavares
medverkan. Om barnet använder ett Google-konto via **Family Link** sköter
Google de samtycken som krävs. Anonyma sessioner kräver bara ett självvalt
smeknamn — vi gör ingen separat åldersverifiering där.

Vårdnadshavare som upptäcker att deras barn under 13 har lämnat data utan
deras samtycke kan kontakta oss för omedelbar radering.

## 7. Säkerhet

- All dataöverföring sker via krypterad HTTPS/TLS
- Firebase-säkerhetsregler säkerställer att du bara kan se egna privata
  data (publika walks är öppna by design — det är så QR-delning fungerar)
- Inga lokala kopior av dina data lämnar din enhet utöver Firebase-synk
- Vi rekommenderar att du själv skyddar din enhet med skärmlås

## 8. Cookies och lokal lagring

Appen och webbskaparen (`tipspromenaden.app/skapa`) använder din enhets
lokala lagring (AsyncStorage på mobil, IndexedDB/localStorage i webbläsare)
för att hålla dig inloggad och cacha promenader offline. Detta är
**strikt nödvändig** funktionalitet och kräver inget cookie-samtycke
enligt ePrivacy-direktivet. Vi använder **inga** analytics-, reklam-
eller spårnings-cookies.

## 9. Ändringar i policyn

Vid väsentliga ändringar uppdateras datumet överst, vi meddelar aktiva
användare i appen, och tidigare versioner kvarstår tillgängliga via
git-historiken på vårt offentliga GitHub-repo.

---

## English summary

This privacy policy is published in Swedish as our primary user base is in
Sweden. An English translation is in preparation. Until then, the key
points: we collect only what's needed to run quiz walks (nickname, answers,
GPS during a walk, optionally email if you sign in with Google). We use
Google Firebase as data processor (data stored in EU + USA under the
EU-US Data Privacy Framework). You can delete your account and data at any
time via Settings → Delete account, or by emailing
**tipspromenaden.app@gmail.com**. Full GDPR rights apply. Complaints to
[IMY (Swedish DPA)](https://www.imy.se/en/).
