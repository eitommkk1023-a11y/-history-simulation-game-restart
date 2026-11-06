# RPG menu03 equipment and item layout

User agreed to continue fullscreen RPG menu02 by improving equipment slots and item placement. Single agent, no repeated approval gates. Continue codex/prototype-rpg-menu-v1, keep main/formal world/horse branch/base v31 and old menu01/02 unchanged. No new library, item types or formal RPG integration.

Baseline: five UI source/build files match the RPG branch. Existing local02 HTML is not a tracked file on the branch; preserve the local copy and build03 from the exact approved v31 SHA50a6f786eef5b641d0ec235f2111712d7acabd29e87542a75d802b2d993dd348. Do not overwrite local02 or add a replacement02 to the branch.

- [x] Model tests first: category/name/stack-weight sort only changes display order, filtering/consumption and missing data work, old v1 save remains valid and sort preference is sanitized. Keep actual weapon/body equipment rules.
- [x] Add two equipment cards above main inventory grid, slot selection opens owned item details without auto equip; empty slot offers owned candidates. Keep bag about70% of width, full viewport,44px native sort selector. Quantity/equipped badges/selected slot/detail stay synchronized. Preserve grid scroll when using/equipping; category resets scroll.
- [x] Build03 from frozen v31 with isolated save DB/key. No item effects, rewards or character preview. Selected equipment status and large primary action.
- [x] Browser3 viewports: fullscreen/layout, slot/equip/unequip/category selection, sorting/selected item/count,44px actions, real map pan/zoom, missions/tracking, pause/resume, save persistence/isolation. Inspect screenshots. Full local unit suite and focused menu model tests.
- [x] README/report/HTML03/package; model and final UI coherent commits on RPG branch. Verify protected paths, remote blob/head and copies. HTML+checks, hardware iOS unmeasured.
