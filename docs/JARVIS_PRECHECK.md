# JARVIS PRECHECK

## Enne igat muudatust kontrolli 4 asja

1. Mida see muudab?
2. Mida see võib lõhkuda?
3. Kuidas ma tõestan, et see ei lõhkunud?
4. Kas pärast seda on vaja checkpoint-backup?

## Vastuse vorm

- MUUDATUS:
- RISK:
- TÕESTUS:
- BACKUP: yes/no
- OTSUS: proceed / stop

## Reegel

Kui risk või mõju ei ole selge, siis otsus = STOP.
Kui test puudub, siis otsus = STOP.
Kui muutus puudutab state, rollback, execution või terminal capture loogikat, siis backup = YES.

## Lisareeglid pärast tänast postmortemit

5. Kontrolli kogu ahelat, mitte ainult üht punkti:
   - kirjutus
   - lugemine
   - kuvamine
   - tõestustest

6. Kui väljund peab minema faili + clipboardi + terminali, siis järjekord on:
   - fail
   - clipboard
   - terminal

7. Kui muutus puudutab output-path, pipe, tee või pbcopy loogikat, siis tuleb teha runtime-test, mis kinnitab:
   - tekst on terminalis nähtav
   - tekst on failis olemas
   - tekst on clipboardis

8. Kui current-state kuva sõltub mitmest failist, siis tuleb enne valmis lugemist kontrollida:
   - milline fail on värskem
   - milline fail on source of truth
   - mida route eelistab vastuolu korral

## Zero-defect hardening after 2026-04-08

9. Ära loe ühtegi loogikamuutust "valmis" enne, kui on tehtud:
   - build
   - runtime test
   - expected output check
   - source-of-truth check

10. Kui route loeb mitut faili, siis peab enne patchi olema kirjas:
   - primary source of truth
   - fallback source
   - overwrite rule
   - freshness rule

11. Kui muutus puudutab summary/output/current-state loogikat, siis on kohustuslik:
   - before snapshot
   - after snapshot
   - diff or visible proof

12. Kui tulemus peab ilmuma terminalis, siis kontroll peab tõestama:
   - text visible in terminal
   - text saved in file
   - text copied to clipboard

13. Kui high-confidence proof puudub, siis otsus ei ole "probably OK".
   Otsus on STOP.

## Parameter matrix that must be set before logic patches

14. Enne iga loogikapatchi pane paika:
   - chain scope: local / full-chain
   - source of truth: exact file or route
   - read order
   - write order
   - freshness rule
   - visible proof rule

15. Kui patch puudutab state, summary, output või flow loogikat, siis:
   - chain scope = full-chain
   - source of truth = mandatory
   - visible proof = mandatory
   - backup = yes

16. Kui mõni neist parameetritest on puudu, siis:
   - OTSUS = STOP
