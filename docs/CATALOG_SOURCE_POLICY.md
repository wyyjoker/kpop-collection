# Catalog source / verification policy

The multi-group catalog uses a conservative metadata policy so missing information is preferable to invented information.

## Machine-readable source

- MusicBrainz: release groups, releases, formats, countries, tracklists, labels and barcodes.
- Cover Art Archive: release-specific front artwork URLs when MusicBrainz says front artwork exists.

## Human verification / override source order

When a package name, barcode or version needs manual correction, use this order:

1. Artist / label official discography
2. Official Weverse / SM / JYP / YG / label store notice or product page
3. MusicBrainz release record / Cover Art Archive
4. Major retailer metadata only as a last cross-check

Do not copy commercial audio or lyrics into the catalog. Track metadata contains titles / ordering only. Cover art remains remote artwork URLs unless the user uploads their own image.

## Barcode

A barcode is written automatically only when MusicBrainz supplies a numeric 8–14 digit barcode. Catalog numbers, SKUs and store product codes are never converted into barcodes.

## Physical version semantics

A MusicBrainz physical release is a candidate physical collection version. Territory / format / package variants can therefore remain separate when the source models them as separate releases. Retailer POB cards are not automatically album versions. Random photocards / random inner member covers are inclusions rather than separate versions unless the official product itself is sold as a distinct package edition.

## User data always wins

Catalog import only fills blank metadata. It never resets an existing collection status, quantity, user cover, barcode, edition type or collection note.
