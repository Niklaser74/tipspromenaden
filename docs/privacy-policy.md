---
title: Integritetspolicy
---

# Integritetspolicy — Tipspromenaden

**Senast uppdaterad:** 2026-04-27

Play Store kräver att integritetspolicyn är tillgänglig på en **offentlig URL**.
Enklast: publicera denna fil via **GitHub Pages** på projekt-repot eller lägg
upp den på `tipspromenaden.se/privacy` när domänen är aktiv.

---

## 1. Vem vi är

Tipspromenaden är en app för digitala tipspromenader utvecklad av
**Tipspromenaden** (privatperson), kontakt:
**[tipspromenaden.app@gmail.com](mailto:tipspromenaden.app@gmail.com)**.

## 2. Vilken data vi samlar in

### 2.1 Platsinformation (GPS)

Appen använder telefonens GPS för att avgöra när du befinner dig vid en
kontroll. Platsdatan:

- Används **endast lokalt på din enhet** medan en promenad pågår
- **Sparas inte** på våra servrar
- **Delas inte** med tredje part
- Slutar samlas in så fort du stänger appen eller avslutar promenaden

### 2.2 Deltagar-ID och namn

När du startar eller joinar en promenad skapas ett anonymt Firebase-konto
(UID). Du anger ett **smeknamn** som visas i topplistan. Detta sparas i
Firebase Firestore kopplat till aktuell promenad-session.

### 2.3 E-post (endast vid Google-inloggning)

Om du väljer att logga in med Google för att skapa egna promenader sparar vi
din e-postadress som kontoidentifierare. Detta är valfritt — alla kan delta i
promenader utan att logga in.

### 2.4 Promenaddata

Promenader du **skapar** (titel, frågor, kontrollpunkter med koordinater,
svarsalternativ) sparas i Firestore kopplat till ditt konto.

### 2.5 Svar och poäng

När du deltar i en promenad sparas dina svar, poäng och tidsstämplar så att
topplistan fungerar.

### 2.6 Stegräkning (från och med version 1.2.0)

Om din enhet har en hårdvaru-stegräknare och du ger appen behörigheten
**Fysisk aktivitet** läses antalet steg du tar **under en pågående
promenad**. Värdet:

- Sparas tillsammans med dina övriga deltagaruppgifter (samma plats som
  poäng och svar) och visas i resultatet och topplistan för den
  promenaden.
- **Räknas bara mellan när du startar och avslutar en promenad** — inte
  hela dagen, inte i bakgrunden, inte mellan promenader.
- **Delas inte** med tredje part, kopplas inte till några hälsotjänster
  (Google Fit, Health Connect, Apple Health) och används inte för någon
  form av medicinsk eller diagnostisk slutsats.
- Är **valfritt** — du kan neka behörigheten utan att appens kärna slutar
  fungera. Stegfältet utelämnas då helt.

## 3. Vi samlar INTE in

- Användningsanalys (Google Analytics, Firebase Analytics eller liknande)
- Reklam-ID eller spårare
- Kontaktlistor, kalender, media, mikrofon
- Kamera utöver QR-kodsscanning (bilden lämnar aldrig enheten)
- Krasch- eller diagnostikdata

## 4. Tredje part

Appen använder **Google Firebase** (Firestore, Authentication) för att lagra
promenader och sessioner. Google behandlar data enligt sin egen
integritetspolicy: https://policies.google.com/privacy

Inga andra tredjepartstjänster tar emot dina data.

## 5. Lagring och radering

- Anonyma konton och deras sessionsdata raderas automatiskt efter 90 dagar
  inaktivitet.
- Promenader du skapat som inloggad användare lagras tills du raderar dem i
  appen.
- Vill du att vi raderar all din data direkt? Skicka e-post till
  **tipspromenaden.app@gmail.com** med ditt UID (finns under Inställningar i appen) så
  raderar vi manuellt inom 30 dagar.

## 6. Barn

Appen riktar sig till familjer och barn deltar ofta via förälderns konto
(Family Link). Vi samlar inte medvetet in personuppgifter från barn under 13
år utöver det smeknamn och de svar som behövs för att promenaden ska fungera.

## 7. Dina rättigheter (GDPR)

Som användare i EU har du rätt att:

- Få veta vilka data vi har om dig (rätt till information)
- Få dina data rättade eller raderade
- Få en kopia i maskinläsbart format (dataportabilitet)
- Klaga till Integritetsskyddsmyndigheten (IMY) om du anser att vi hanterar
  dina data fel

Kontakta **tipspromenaden.app@gmail.com** för att utöva dessa rättigheter.

## 8. Säkerhet

All dataöverföring sker via krypterad HTTPS/TLS. Firebase-reglerna är
konfigurerade så att användare endast kommer åt sina egna
deltagardata och promenader de själva skapat.

## 9. Ändringar i policyn

Om vi gör väsentliga ändringar uppdaterar vi datumet överst och meddelar
aktiva användare i appen.

---

## Engelsk översättning

_(Samma innehåll på engelska bör läggas till innan publik release. För
intern testning räcker svensk version — barnen i testet förstår svenska.)_
