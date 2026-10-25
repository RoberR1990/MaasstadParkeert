# Maasstad Parkeert — ontwerpdocument (fase 1)

Status: concept v0.1 · eigenaar: Robert Riteco (Stadsbeheer, Parkeren) · alle getallen zijn **fictieve aannames**, bedoeld om bij te stellen.

## 1. Kern

**"Bouwen is makkelijk, beheren is het vak."**
Je beheert 10 jaar (2026–2036) de parkeervoorzieningen van Maasstad: herkenbaar Rotterdam, maar verzonnen. Alles wat je bouwt kost daarna elk jaar geld en mensen. Wie bouwt zonder te beheren, scoort hoog in jaar 3 en zakt in jaar 7 in.

- Doelgroep: collega's Parkeren / Stadsbeheer.
- Speelduur: ~15 min. 1 jaar ≈ 90 s, 40 kwartalen, pauze altijd mogelijk.
- Stijl: SimCity-achtig, 3D low-poly miniatuurstad (diorama, zacht licht, tilt-shift; referenties Mini Motorways / Islanders / Townscaper). Three.js + TypeScript, UI-laag in HTML/CSS.
- Kwaliteitslat: voelt als een professioneel indiespel — tutorial, geluid, animaties, verzorgde UI.
- Losse game, met online scorebord.

## 2. Spelverloop

```
Start (scenario van de week) ─► [kwartaal-tick] ─► gebeurteniskaart? ─► rekenmodel ─► kaart/meters updaten
                                     ▲                                                     │
                                     └──── speler bouwt / huurt in / zet beleid (altijd) ◄─┘
Elk 4e kwartaal: begrotingsmoment (jaarbudget erbij, kort jaaroverzicht).
Na kwartaal 40: eindscore + nabespreking ("wat heb je geleerd").
```

## 3. De stad: 9 wijken

| id | naam (fictief) | lijkt op | karakter | startsituatie |
|---|---|---|---|---|
| centrum | Binnenstad | Centrum/Coolsingel | winkels, bezoekers, hoge druk | betaald, hoog tarief, 2 garages |
| kopbrug | Kop van de Brug | Kop van Zuid | torens, kantoren | betaald, 1 garage |
| havenkwartier | Merwehaven | M4H | leeg haventerrein, **groeit hard vanaf jaar 2** | niet betaald |
| oudwest | Oud-West | Oude Westen/Delfshaven | dicht, vooroorlogs, veel fietsen | betaald, vergunningen vol |
| noord | Bergkade | Noord/Blijdorp | gemengd wonen | deels betaald |
| plaswijk | Plaswijk | Kralingen | ruim, studenten | niet betaald |
| pleinzuid | Pleinzuid | Zuidplein | winkelcentrum, groei | niet betaald |
| kuipwijk | Kuipwijk | Feijenoord/De Kuip | stadion, evenementen | niet betaald |
| rand | Ommeland | Ommoord/Alexander | rand, metro-eindpunt | P+R-kandidaat |

De rivier deelt de stad in Noord en Zuid. De brug en de tunnel zijn knelpunten bij evenementen.

## 4. Knoppen

### 4a. Bouwen (capex · bouwtijd · jaarlijkse opex · personeelsvraag)
| asset | bouw | tijd | opex/jr | vraagt | effect |
|---|---|---|---|---|---|
| Wijkgarage (400 pl.) | 12 M€ | 4 kw | 0,25 M€ | 0,5 FTE schoonmaak, 0,3 FTE onderhoud | +400 capaciteit; optie: −150 straatplekken (leefbaarheid +) |
| Betaalautomaat | 15 k€ | 1 kw | 1 k€ | 1 monteur per 60 | maakt betalen mogelijk; **belang daalt** (app-aandeel 55%→85%) |
| Scanauto | 80 k€ | 1 kw | 15 k€ | 1 handhaver + 0,5 FTE backoffice | dekt 4.000 betaalde plekken |
| Fietsenstalling bewaakt (1.000) | 3 M€ | 3 kw | 0,1 M€ | 1 FTE beheer/schoonmaak | +1.000 fietsplekken |
| Fietsnietjes (100) | 50 k€ | 1 kw | 2 k€ | — | +100, alleen buiten |
| P+R (500) | 4 M€ | 3 kw | 0,15 M€ | 0,3 FTE | vermindert autobezoek centrum, alleen met OV-niveau ≥ 2 in `rand` |
| Deelmobiliteitshub | 0,3 M€ | 1 kw | 50 k€ | — | −10% autobezit nieuwbouw in die wijk |

### 4b. Beleid (per wijk, max 1 wijziging per wijk per jaar)
- **Tarief:** laag €2 · midden €4 · hoog €6 per uur. Hoger tarief geeft minder vraag en meer inkomsten. Ondernemers worden minder blij en bezoekers mijden de wijk.
- **Betaald parkeren invoeren:** kwartaal 1–2 dalen bewoners en wethouder. Daarna daalt de druk, en mits er automaten zijn en er gehandhaafd wordt, komen er inkomsten.
- **Vergunningplafond:** ruim · normaal · krap.
- **Parkeernorm nieuwbouw:** hoog · midden · laag. Laag geeft minder auto's, maar alleen als OV of deelmobiliteit op orde is. Anders parkeren de auto's in de buurwijken.

### 4c. OV (niet van de gemeente)
- **Meebetalen aan extra frequentie/lijn:** 2 M€/jr. OV-niveau van een wijk +1 (max 3) na 2 kwartalen, maar alleen zolang je betaalt.
- **Lobby bij vervoerder:** gratis, 30% kans per jaar op +1. Uitgelegd als "jij beslist hier niet".

### 4d. Mensen
| rol | kosten/FTE/jr | functie |
|---|---|---|
| Monteur | 70 k€ | automaten en garagetechniek |
| Schoonmaker | 50 k€ | netheid garages en stallingen |
| Handhaver | 60 k€ | rijdt scanauto, naleving |
| Klantcontact | 55 k€ | bezwaren en meldingen |

Werven duurt 2 kwartalen (vacature → instroom) en er komen max 3 FTE per rol per kwartaal bij (krappe arbeidsmarkt). Ontslaan gaat direct, maar de tevredenheid van het team daalt.

## 5. Rekenregels (per kwartaal, per wijk)

1. **Autovraag** = bewoners_auto × vergunningfactor + bezoekers × tariefFactor × (1 − OVeffect − P+Reffect). OVeffect = 0,08 per OV-niveau.
2. **Bezetting** = vraag / (straat + garage), waarbij foutparkeerders (1 − naleving) een deel van de plekken innemen.
3. **Zoektijd (min)** = 2 bij bezetting ≤ 80%, daarna steil oplopend: 2 + 40 × (bezetting − 0,8)², met een maximum van 20.
4. **Naleving** = 0,6 + 0,35 × min(1, dekking). Dekking = scanauto-capaciteit / betaalde plekken. Zonder handhaver doet een scanauto niets.
5. **Storingen automaten** = 2% basis + 10% × max(0, 1 − monteurratio). Storing kost inkomsten en ergert bezoekers.
6. **Achterstallig onderhoud** (per garage/stalling): neemt elk kwartaal toe met (1 − onderhoudsratio) × 1 punt en daalt met 0,5 als de ratio ≥ 1. Bij **≥ 8 punten** volgt de gebeurtenis "Garage (deels) dicht": −50% capaciteit tot de reparatie (2 M€).
7. **Netheid** (0–100) volgt de schoonmaakratio, met een vertraging van 1 kwartaal.
8. **Fietstekort** = fietsvraag − fietsplekken. Fietsvraag groeit 3% per jaar, plus vraag uit nieuwbouw.
9. **Inkomsten** = Σ betaalde bezette uren × tarief × naleving × (1 − storingen) + garages + vergunningen. Ze gaan naar het **parkeerfonds** (in het echt gaan ze naar de algemene middelen; dit wordt benoemd in de nabespreking).
10. **Klantcontact:** bezwaren = boetes × 4%. Kan klantcontact het niet aan, dan ontstaat er een achterstand en dalen de wethouder- en bewonerscijfers.

## 6. De blije Rotterdammer (0–100 per persona)

| persona | stuurt op | gewicht |
|---|---|---|
| Bewoner | zoektijd woonwijken, vergunning-wachtlijst, netheid, fietsen op straat | 25% |
| Ondernemer | bereikbaarheid winkelwijken (zoektijd + tarief) | 20% |
| Bezoeker | zoektijd centrum/evenementen, storingen, garagestaat | 15% |
| Fietser | fietstekort | 15% |
| Stad (leefbaarheid) | blik op straat, groen (straatplekken weg = +) | 10% |
| Wethouder | begroting sluit, incidenten, klachtenachterstand | 15% |

**Blije Rotterdammer** = het gewogen gemiddelde. Je ziet het altijd als een gezicht (😀→😠) plus zes kleine meters.

## 7. Score en scorebord

- **Score** = gemiddelde blije Rotterdammer over 40 kwartalen × 100.
  - Min 60 per kwartaal met een fondssaldo < 0.
  - Min 6 per punt achterstallig onderhoud aan het eind (je mag de puinhoop niet doorschuiven).
  - Strafpunten zijn bewust klein (fase 2): je verliest via ontevreden Rotterdammers, niet via boetes.
- **Onderuitputting:** bij de jaarafsluiting vloeit fondssaldo boven 5 M€ terug naar de algemene middelen. Oppotten heeft geen zin; geld moet aan het werk.
- Startfonds 30 M€, jaarbudget 18 M€, vaste lasten 33 M€/jr (stand na fase 2, zie `docs/BALANS.md`).
- **Eerlijk:** het scenario van de week heeft een vaste seed, dus iedereen krijgt dezelfde torens en kaarten.
- **Scorebord:** bijnaam + afdeling (keuzelijst), filter op vulgaire namen, week- en all-time-lijst. Geen login, geen e-mail.
- **Easter eggs leveren badges op, geen punten.** Zo blijft de ranglijst over beheer gaan.

## 8. Gebeurteniskaarten

Ongeveer één per kwartaal, uit een vaste reeks per scenario. Soorten:
- **Groei:** woontoren of nieuwe wijk erbij (Merwehaven, Kop van de Brug, Pleinzuid).
- **Storing:** betaalsysteem plat, garagelift kapot, lekkage.
- **Evenement:** wedstrijddag, marathon (wegafsluitingen), havenfestival, zomercarnaval.
- **Politiek:** raadsvraag, motie gratis parkeren voor ondernemers, bezuinigingsronde.
- **Personeel:** griepgolf, vacatures blijven open, ervaren monteur met pensioen.
- **Markt:** app-parkeren verdubbelt, elektrische auto's vragen laadplekken.

Elke kaart heeft 1–3 keuzes met directe en uitgestelde effecten. Uitwerking: `data/events.json`.

## 9. Rotterdamse easter eggs (badges, geen punten)

Principe: knipogen die collega's herkennen. Geen logo's, geen clubnamen, geen nagetekende kunstwerken, en geen politiek gevoelige plekken.

| # | trigger | wat gebeurt er | badge |
|---|---|---|---|
| 1 | 5× klikken op de witte tuibrug | brug "klapt" als zwaan zijn vleugels uit en vliegt een rondje | De Zwaan |
| 2 | 3× klikken op de oude spoorhefbrug | het middendeel gaat omhoog, er vaart een boot onderdoor | De Hef |
| 3 | typen: `010` | retro-modus: alles in rood-wit-groen pixelstijl, 30 s | Netnummer |
| 4 | fondssaldo precies tussen 0 en 10 k€ op het eind | eindscherm: "Geen woorden maar daden." | Zuinig als een Rotterdammer |
| 5 | wedstrijddag-kaart zonder enige zoektijd-piek in Kuipwijk | vuurwerk boven het stadion | Hand in hand (alleen de titel) |
| 6 | klik op de toren met de uitkijkbol | iemand abseilt naar beneden | Abseiler |
| 7 | 4 seizoenen achter elkaar regen in het spel | tekstje: "Lekker weertje weer." | Dakpannenweer |
| 8 | klik op het hoefijzergebouw met de grote binnenhal | er ploppen eetkraampjes op | Marktbaas |
| 9 | snackkar in een garage zetten (verborgen bouwoptie na 3 garages) | menu: alleen kapsalon | Kapsalon |
| 10 | klik op de kantelende kubuswoningen | ze draaien een kwartslag en terug | Scheef maar mooi |
| 11 | P+R bouwen bij Ommeland én OV-niveau 3 | er vaart een watertaxi over de rivier | Watertaxi |
| 12 | 1× per spel willekeurig | gebeurteniskaart: "Iemand heeft de kabouter bij het plein weer verkleed." | Kabouterwacht |
| 13 | interne grap(pen) Parkeren | **in te vullen door Robert** | — |

Laadschermen tonen Rotterdamse uitspraken: "Niet lullen maar poetsen", "Eerst de schop in de grond, dan praten", "Van Zuid tot Noord, alles is ons terrein".

## 10. Nabespreking (eindscherm)

Drie automatische lessen op basis van jouw spel, bijvoorbeeld:
- "Je bouwde 4 garages maar nam geen schoonmakers aan. In 2032 was netheid 31."
- "Je handhavingsdekking was 40%. Je liep ~6 M€ aan inkomsten mis."
- "Het OV-meebetalen in Ommeland verlaagde de zoektijd in de Binnenstad met 3 minuten."

Plus de kanttekening: "In het echt gaan parkeerinkomsten naar de algemene middelen, niet rechtstreeks naar beheer."

## 11. Architectuur

```
src/sim/      rekenmodel, puur TypeScript, geen graphics → draait in game én headless (node)
src/game/     Three.js-scene (diorama, auto's, licht/weer) + HTML/CSS-UI (HUD, kaarten, tutorial, eindscherm), WebAudio-geluid
prototype/    stijlproeven (los van de game)
data/         config.json (alle getallen), events.json, eastereggs.json, scenario's
tools/        bots + batch-runner voor balans (fase 2)
```

Keuze: het rekenmodel wordt meteen in TypeScript geschreven, niet eerst in Python. Dan rekent de game met precies dezelfde code die we met bots testen. Er hoeft niets dubbel gebouwd te worden en het kan niet uit elkaar lopen.

## 12. Open punten

1. Hosting en scorebord: is een externe database (Supabase of de NAS) bereikbaar vanaf het gemeentenetwerk?
2. Interne grappen voor easter egg #13.
3. Klopt de grootte-orde van de getallen in §4 en §5? Laat een vakcollega er een uur naar kijken.
4. Naam: "Maasstad Parkeert" is een werktitel.
