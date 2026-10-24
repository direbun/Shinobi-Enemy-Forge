# Threat Forge

A separate local-first Naruto 5e adversary builder based on the supplied official adversary workbook and the encounter guidance in the Kage Guide.

## Run it

From PowerShell in this folder:

```powershell
.\start.ps1
```

Then open <http://localhost:4174>.

## Included

- Official level arrays for Minion, Standard, Elite, and Solo adversaries
- Rank, role, armor, party-size, HP, chakra, AC, proficiency, Tenacity, and damage calculations
- Searchable catalogue of 913 traits, 1,820 jutsu, and 74 weapons
- Save proficiency, skill proficiency, and mastery tracking
- Guided build compass with live recommendations for proficient skills, mastery points, saves, traits, jutsu, rank, attacks, and damage
- Step-by-step explanations and previous/next controls; every recommendation remains optional
- Guided and freeform build styles, with optional GM override notes recorded in the statblock and JSON
- Required-fix, balance-advisory, and design-note validation categories
- Suggested, selected-only, action-type, rank, role-fit, and multi-keyword catalogue filters
- Portable JSON schema v2 with readable catalogue references, source versions, and legacy import migration
- Expandable rules-provenance panel explaining which source drives each calculation family
- Turn coverage checks for actions, bonus actions, and reactions
- Tactical plan and print-ready statblock
- Reusable adversary roster with browser autosave
- Portable JSON import and export
- Kage Guide PAL, TEL, REL, level-gap, class-weight, class-mod, and crowd calculations

## Refresh source data

The workbook is read as untrusted input. Formulas and external links are not executed.

```powershell
& "C:\Users\Dire\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe" tools\extract_enemy_rules.py source-adversary-builder.xlsx data\rules.json
```

## Test

```powershell
& "C:\Users\Dire\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe" --test tests\model.test.mjs
```
