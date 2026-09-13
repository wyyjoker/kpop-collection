# SEVENTEEN Catalog

## Scope

The bundled catalog covers **SEVENTEEN group physical music releases** from 2015 through 2025.

Included:

- Korean studio albums, mini albums, special albums, repackages and best albums
- Japanese mini albums, EPs, singles and best albums
- One representative release cover per title
- Disc / track order for each release

Excluded for now:

- Purely digital singles
- BSS, JxW, HOSHI X WOOZI and other subunit releases
- Member solo releases that are separate products
- Concert DVDs / Blu-rays, fanmeeting packages and digital-code video products
- Every individual physical version cover / photobook variant; these can be added later as album versions

## Sources

Primary reference:

- SEVENTEEN Japan Official Site — Discography: https://www.seventeen-17.jp/posts/discography

Secondary cross-check / older catalog coverage:

- MusicBrainz — SEVENTEEN artist / release-group metadata: https://musicbrainz.org/artist/e04d239e-9fa8-49b3-b9b7-9e439c3cb1d1
- Cover Art Archive for the `17 HITS` compilation cover where the official Japanese catalog does not provide the release page.

The repository stores URLs to public cover images; it does not copy those third-party copyrighted cover image binaries into the repository.

Tracklists are stored as factual metadata only. Lyrics and audio files are not included.

## Import behavior

`npm start` and `npm run dev` run `scripts/seed-seventeen.js` before launching the application.

The import is idempotent:

- a matching `SEVENTEEN` group is reused;
- a matching album uses `(group_id, name, release_date)`;
- existing non-empty user album type / cover fields are not overwritten;
- imported track rows are versioned with the catalog marker;
- running `npm run seed:seventeen` forces a tracklist refresh from the bundled catalog.

## Current limitation

The first import intentionally creates release-level album records only. It does **not** fabricate album-version rows because SEVENTEEN physical releases often have multiple edition-specific covers and inclusions. A later catalog pass should model those real versions separately so collection completion remains accurate.
