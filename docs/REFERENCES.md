# Project references

K-pop Collection V0.1 uses ideas from existing K-pop collection projects as product and architecture references.

## Final visual target

The current UI/UX target is the **desktop pastel scrapbook / K-pop collection diary** style confirmed for this project.

- Visual reference package: [`docs/design-target/README.md`](design-target/README.md)
- The image `design-target/reference-style.webp` has the highest visual priority.
- Future UI work should follow this direction instead of dark dashboards, generic SaaS layouts, e-commerce styling, or mobile-first app styling.

## Miyeon

- Repository: `notelyoo/Miyeon`
- Useful reference areas: Express + SQLite structure, image upload workflow, responsive collection gallery, local-first administration ideas.
- Upstream repository contains an AGPL-3.0 license file.

The V0.1 implementation in this repository was rewritten for the album/version data model instead of vendoring or copying Miyeon's source files directly. If upstream source code is copied into this project later, its license obligations must be reviewed and preserved.

## Kpop-Album-List

- Repository: `AppleThomas/Kpop-Album-List`
- Used as a product/data-model reference for album CRUD concepts.

## Our direction

The target model is:

```text
Group
  -> Album
      -> AlbumVersion
          -> Collection status
```

Later phases can extend this to members, photocards and store benefits without changing the core album hierarchy.
