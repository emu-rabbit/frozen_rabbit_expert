# Third-party notices

## Raphael offline research reference

The separate `tools/evaluate-normal-reference/native` executable links the
unmodified `raphael-sim` and `raphael-solver` crates from
[KonaeAkira/raphael-rs](https://github.com/KonaeAkira/raphael-rs), revision
`411168605989d573d89f2d71c01acac9f099e55a`, under the
[Apache License 2.0](https://github.com/KonaeAkira/raphael-rs/blob/411168605989d573d89f2d71c01acac9f099e55a/LICENSE).
The checkout and its license remain in `.tmp/raphael-reference/upstream`.
This is a local evaluation dependency, not part of the product kernel or web
bundle. The adapter is maintained in this repository; upstream sources are
not modified or vendored. Preserve upstream license and any applicable notices
when distributing the research executable. Exact transitive dependency
versions are recorded in the research crate's Cargo.lock.

## FINAL FANTASY XIV action and item icons

The crafting action icons under `apps/web/public/action-icons` and recipe item
icons under `apps/web/public/item-icons` are FINAL FANTASY XIV game materials.
Canonical icon IDs were verified through XIVAPI game data revision
`c3f948214b90e498` on 2026-08-11 and 2026-08-12; the local PNG assets were
retrieved through the XIVAPI asset endpoint.

- Rights holder: Square Enix
- Materials Usage License: <https://support.na.square-enix.com/rule.php?id=5382&la=1&tag=authc>
- Use in this repository: non-commercial FFXIV community POC

FINAL FANTASY XIV © SQUARE ENIX

## Cosmic Exploration expert recipe catalog

`packages/data/src/generated/cosmicExpertRecipes.generated.ts` contains
recipe, item, job, condition and mission identity fields generated from a
pinned XIVAPI v2 snapshot and pinned CSV revisions from
`xivapi/ffxiv-datamining`. These generated values are FINAL FANTASY XIV game
materials; the importer records exact upstream revisions and a canonical
content hash so changes fail closed instead of silently drifting.

- XIVAPI v2 documentation: <https://v2.xivapi.com/docs>
- Game-data version: `284bb7f44b9c0976`
- Schema: `exdschema@2:rev:83e965d091116f895d5b17573cc5d12909a5f407`
- `WKSMissionRecipe.csv` revision: `1b5c1af6a79063015f53fda7752cc84ff0545342`
- `WKSMissionUnit.csv` revision: `c142b1269a76e9e3fffc42f984a5f193ba565ddc`
- Upstream data repository: <https://github.com/xivapi/ffxiv-datamining>
- Materials Usage License: <https://support.na.square-enix.com/rule.php?id=5382&la=1&tag=authc>

FINAL FANTASY XIV © SQUARE ENIX

## FFXIV Teamcraft Simulator

The crafting formula order and selected action semantics in `packages/domain` were adapted from:

- Project: `ffxiv-teamcraft/simulator`
- Repository: <https://github.com/ffxiv-teamcraft/simulator>
- Revision inspected: `74e167a05ba279526d2ddd457a048e234bedbad9`
- License: MIT

```text
MIT License

Copyright (c) 2019 Flavien Normand

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
