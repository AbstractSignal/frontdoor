/* The door marks, and where they come from.

   The marks are each project's own logo, vendored into this bundle rather than
   hot-linked: the page is served to browsers that may have no path to a CDN, and
   the repo's rule for anything the page draws is that it ships in the bundle (the
   fonts set the same rule, `docs/design.md`). They live in the same
   directory as the old selfh.st pack files they replaced, named
   `public/assets/icons/<name>.brand.*` — `.brand` in the name is the
   provenance marker (the pack files were `<name>.v4.0.3.svg`), and the same
   nginx 7-day cache rule applies: a redrawn mark has to change name.

   What is recorded, because a mark is a fact about its own provenance:
     - every file was fetched 2026-11-02 from the project's own repository or
       site, and where a project ships a dark-context variant that is the one
       vendored (Home Assistant's light shield, llama.cpp's `icon-dark`, Kaneo's
       `logo-dark` favicon, Paperless' white leaf).
     - two marks needed a dark-context adaptation because the project ships only
       a light-background logo: the Proxmox hex's chevron is white instead of
       black (the ring keeps its own #e57000), and the Frigate bird is light
       grey instead of black (the brand is monochrome).
     - `home` is this page's own mark: a copy of public/favicon.svg, the
       network glyph the landing map draws.

   A mark is DECORATION. The door's name is the link's accessible name (`TIP` in
   src/boxes.ts over the `name_*` keys both dicts carry), and its target is the
   stanza's own host: nothing here says a name, an address or a state, so a wrong
   pairing cannot come from this file. A door with no entry below gets a ring
   drawn by the page (see `dot`), not a guessed logo. */

export const ICONS: Record<string, string> = {
  pve1: 'proxmox.brand.svg',
  pbs: 'proxmox.brand.svg', // Proxmox Backup Server: the family's own logo is what
  // is on the box. The tooltip, not the mark, is what names the door.
  home: 'home.brand.svg',
  ha: 'ha.brand.svg',
  frigate: 'frigate.brand.svg',
  unraid: 'unraid.brand.svg',
  dns1: 'technitium.brand.png',
  router: 'openwrt.brand.png',
  sw1: 'openwrt.brand.png',
  papers: 'paperless.brand.svg',
  ai: 'llama-cpp.brand.svg',
  kaneo: 'kaneo.brand.svg',
  // ap1 has no entry: the AP's own software is not a fact this repo has measured
  // (docs/network/topology.md names the box and its MAC, not its UI). It gets
  // the ring, which claims nothing.
};

/* true once per door: the mark this bundle carries for that door name. */
export function iconFile(name: string): string {
  return ICONS[name] ?? '';
}
