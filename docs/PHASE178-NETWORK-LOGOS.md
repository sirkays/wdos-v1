# PHASE 178 - Network logos on the network pages
Build v80.5 · db 136 · 10 Sep 2026 (app only, no migration)

Azeez supplied the official WGMN (Good Mother Network) and WNNN (Nurture
NextGen Network) logos and asked for them on their respective network pages,
rounded and professionally done.

- assets/logos/wgmn.png and assets/logos/wnnn.png: the supplied artwork
  trimmed of its white margin, scaled to sit inside a circle (the whole
  logo including the wordmark stays visible, nothing clipped), 512 px,
  circular alpha mask, white ground.
- #/network/WGMN and #/network/WNNN (networkhq.js): the logo sits at the
  left of the hero band as a white disc (148 px) with a soft ring and
  shadow, before the mini map and the network title. On phones the disc
  shrinks to 96 px and the mini map hides.
- HOFCO dashboard hero panels (hofco.js): each network panel carries its
  logo as a 64 px disc beside the network code.
- Both files are precached by the service worker.

Deploy: drag `app` (v80.5) to both Netlify sites → badge "build v80.5 · db 136".
