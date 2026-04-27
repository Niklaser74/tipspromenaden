# Testpilot-hantering via Google Group

Setup för att samla anmälningar i en Google-grupp istället för att
hantera varje testare manuellt i Play Console. Engångsjobb ~15 min,
sen är det ett klick per ny testare.

## Varför

Play Console "Closed testing" kan kopplas till antingen en e-postlista
(manuellt copy/paste i konsolen) eller en **Google Group** (alla
medlemmar i gruppen är testare automatiskt). Med Group:en händer flödet:

1. Testaren ber om att gå med i gruppen (via web eller mejl)
2. Du får notifikation, klickar **Approve**
3. Personen är på sekunden testare och kan installera via opt-in-URL:en

Ingen mer "öppna mail → kopiera adress → öppna Play Console → klistra in
→ spara" — bara en knapp per godkännande.

---

## Steg 1 — Skapa gruppen

1. Gå till https://groups.google.com (logga in med
   `tipspromenaden.app@gmail.com`)
2. Klicka **Create group** uppe till vänster
3. Fyll i:
   - **Group name:** `Tipspromenaden testpiloter`
   - **Group email:** `tipspromenaden-testers` (slutar på `@googlegroups.com`)
   - **Group description:** "Testpiloter för Tipspromenaden-appen i sluten testning"
4. **Privacy settings:**
   - Who can search for the group: **Group members**
   - Who can join the group: **Anyone can ask** ← viktigt
   - Allow external members: **Yes** (annars kan bara folk på
     samma domän gå med — vi vill att vem som helst med Google-konto kan)
5. **Posting permissions:** sätt allt till "Group owners" — det här är
   en distributionslista, inte en diskussionsgrupp
6. Klicka **Create group**

Notera gruppens fullständiga adress: blir
`tipspromenaden-testers@googlegroups.com`.

---

## Steg 2 — Koppla gruppen till Play Console

1. Play Console → välj appen → **Test and release** → **Closed testing**
2. Välj din track (t.ex. "Closed testing")
3. **Testers**-fliken → klicka **Add Google Group**
4. Klistra in `tipspromenaden-testers@googlegroups.com`
5. Klicka **Save changes** + **Send for review** om Play Console kräver det

Befintliga testare i email-listan kan ligga kvar — de fungerar parallellt
med gruppmedlemmarna. Men för enkelhets skull: när alla nuvarande
testare är i gruppen, ta bort email-listan så det blir ett ställe att
underhålla.

---

## Steg 3 — Uppdatera flygbladets QR (valfritt men rekommenderat)

QR-koden i Hammardammen-flygbladet pekar idag på `mailto:`. Bättre att
peka direkt på gruppens "Ask to join"-sida så slipper du extrahera
mejladresser ur GMail.

URL:en blir: `https://groups.google.com/g/tipspromenaden-testers`

Be Claude regenerera QR + flygblad med den URL:en istället för
mailto:n när gruppen är skapad.

---

## Steg 4 — Hantera join-requests

Notifikationer kommer både som mejl till `tipspromenaden.app@gmail.com`
och i grupp-administratörens inkorg på Google Groups.

**Godkänn:**
1. Gå till https://groups.google.com/g/tipspromenaden-testers/pending
2. Bocka för pending requests
3. Klicka **Approve** uppe till höger

Personen får automatiskt ett välkomstmejl från Google Groups. Du behöver
också skicka **opt-in-URL:en** för Play Closed Testing — den hittar du i
Play Console → Closed testing → "How testers join" → kopiera länken.

**Tips:** sätt upp ett färdigt mall-svar i Gmail med opt-in-URL:en så
det är två klick att svara på en ny testare:
> Hej och välkommen som testpilot! Här är länken där du går med i
> testet och får appen i Play Store: <opt-in-URL>. När du tryckt
> "Become a tester" tar det några minuter innan appen dyker upp för dig.

---

## Bonus — gruppen blir också din testar-CRM

Group-medlemslistan i Google Groups är samtidigt din kompletta lista
över aktiva testare. Behöver du höra av dig (t.ex. "ny build ute, kör
en runda till") kan du mejla `tipspromenaden-testers@googlegroups.com`
och alla får mailet. Inga utskickslistor att underhålla separat.
