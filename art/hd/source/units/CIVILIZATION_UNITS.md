# Civilization-unique unit sheet provenance

These five 6×5 movement sheets were produced on 2026-08-19 with the built-in
OpenAI image-generation workflow. Each sheet has six walk poses across and the
runtime's five authored directions down (south, southwest, west, northwest,
north). No third-party artwork is embedded in the result.

The visual references were StoneSiege's own civilization concept images from
the companion website repository. Those concepts were researched against the
Wikipedia articles for [housecarls](https://en.wikipedia.org/wiki/Housecarl),
[knights](https://en.wikipedia.org/wiki/Knight),
[Kheshig](https://en.wikipedia.org/wiki/Kheshig),
[cataphracts](https://en.wikipedia.org/wiki/Cataphract), and
[mamluks](https://en.wikipedia.org/wiki/Mamluk). They were used for broad
historical equipment, silhouette, and costume direction only.

| Runtime family | Source | Authored direction |
| --- | --- | --- |
| `housecarl`, `eliteHousecarl` | `housecarl-walk-grid-v1.png` | 11th-century mail, nasal helmet, round shield, Dane axe |
| `chevalier`, `eliteChevalier` | `chevalier-walk-grid-v1.png` | late-medieval plate harness, blue/off-white caparison, lance |
| `mangudai`, `eliteMangudai` | `mangudai-walk-grid-v1.png` | lamellar armour, compact steppe horse, composite bow and paired quivers |
| `cataphract`, `eliteCataphract` | `cataphract-walk-grid-v1.png` | middle-Byzantine mail/lamellar, kontarion, round shield, barded horse |
| `mamluk`, `eliteMamluk` | `mamluk-walk-grid-v1.png` | mail and quilted qaba, composite bow, lance, round shield, practical tack |

Prompt contract shared by all five sheets: exact 6-column × 5-row grid; one
complete, consistently scaled figure per equal cell; consecutive walk gait
across columns; the five authored isometric directions down rows; orthographic
2:1 three-quarter top-down camera; warm upper-left light; painterly medieval RTS
finish; restrained cobalt-blue cloth for runtime team-colour extraction; no
terrain, shadow, labels, separators, logos, or scenery. Each unit prompt then
specified the historical equipment summarized above and explicitly excluded
anachronistic or fantasy equipment.

The housecarl and Kheshig generations supplied genuine alpha. The chevalier,
cataphract, and mamluk generations supplied a flat magenta removal background;
their cutouts were produced with the image-generation skill's
`remove_chroma_key.py` soft-matte/despill workflow. The deterministic
`normalize-civilization-unit-sheets.ts` pass then isolates the 30 dominant
figures and repacks them into equal padded cells, preventing weapons or hooves
from leaking across generated grid boundaries. The original generated sources
are retained here, and the shipping alpha sheets are retained under
`../../frames/units/`.

The project maintainers reasonably believe these original generations and
pipeline edits can be dedicated under the repository's CC0 asset license.
