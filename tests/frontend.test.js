const { test } = require("node:test");
const assert = require("node:assert/strict");

test("scrapbook routes, real collection data and rendering", async (t) => {
  const { store, route, url, albumStatus, filteredAlbums, stats, isLimited } =
    await import("../public/js/store.js");
  const { image, albumCard, e, hero } = await import(
    "../public/js/components.js"
  );
  const { page } = await import("../public/js/pages.js");
  const previousLocation = global.location;
  global.location = { search: "?view=gallery" };
  const version = (id, status, edition_type = "Photobook") => ({
    id,
    status,
    edition_type,
    version_name: `Version ${id}`,
    quantity: status === "owned" ? 1 : 0,
  });
  store.groups = [
    {
      id: 1,
      name: "Test Group",
      album_count: 3,
      owned_count: 1,
      version_count: 3,
    },
  ];
  store.albums = [
    {
      id: 1,
      group_id: 1,
      group_name: "Test Group",
      name: "Alpha",
      release_date: "2025-01-01",
      album_type: "5th Studio Album",
      versions: [],
      tracks: [],
    },
    {
      id: 2,
      group_id: 1,
      group_name: "Test Group",
      name: "Beta",
      release_date: "2024-01-01",
      album_type: "Mini Album",
      versions: [version(1, "owned"), version(2, "wishlist", "Limited")],
      tracks: [],
    },
    {
      id: 3,
      group_id: 1,
      group_name: "Test Group",
      name: "Gamma",
      release_date: "",
      album_type: "Single",
      versions: [version(3, "missing")],
      tracks: [],
    },
  ];
  store.profile = { favorite_group_ids: [], name: "" };
  try {
    await t.test(
      "home and collection use the supplied girl-group masthead without fake UI",
      () => {
        for (const view of ["home", "collection"]) {
          const html = hero(route(`?view=${view}`));
          assert.match(html, /reference-masthead\.png/);
          assert.match(html, /viewBox="0 77 1491 277"/);
          assert.match(html, /reference-masthead-crop/);
          assert.match(html, /女团合照/);
          assert.doesNotMatch(html, /data-album|hero-albums|<form|<nav/);
        }
        assert.match(hero(route("?view=gallery")), /搜索图鉴/);
        store.profile.hero_cover = "/uploads/my-photo.png";
        assert.match(hero(route("?view=home")), /reference-custom-photo/);
        delete store.profile.hero_cover;
        const fs = require("node:fs");
        const path = require("node:path");
        const png = fs.readFileSync(
          path.join(
            __dirname,
            "../public/assets/scrapbook/reference-masthead.png",
          ),
        );
        assert.equal(png.readUInt32BE(16), 1491);
        assert.equal(png.readUInt32BE(20), 1055);
      },
    );
    await t.test("five views and legacy PWA links resolve correctly", () => {
      assert.equal(route('?view=album&album=1').album,'1');
      assert.equal(route('?view=album&album=1').view,'album');
      for (const view of ["home", "gallery", "collection", "wishlist", "about"])
        assert.equal(route(`?view=${view}`).view, view);
      assert.equal(route("?view=collection&tab=wishlist").view, "wishlist");
      assert.equal(route("?view=collection&tab=missing").status, "missing");
      assert.equal(route("?group=1").view, "group");
      assert.equal(route("?view=unknown").view, "home");
    });
    await t.test('album subpages have multiple-photo upload and owner-only text boxes',()=>{
      const a=store.albums[0];a.photos=[{id:11,src:'/uploads/photo.png',caption:'实物照片 <script>test</script>'}];
      store.can_edit=true;
      const owner=page(route(`?view=album&album=${a.id}`));
      assert.match(owner,/data-photo-files/);assert.match(owner,/multiple/);assert.match(owner,/data-saved-caption="11"/);assert.match(owner,/&lt;script&gt;/);
      store.can_edit=false;
      const visitor=page(route(`?view=album&album=${a.id}`));assert.doesNotMatch(visitor,/<textarea|data-photo-files/);assert.match(visitor,/实物照片/);
      assert.doesNotMatch(hero(route('?view=home')),/更换横幅照片/);store.can_edit=true;assert.match(hero(route('?view=home')),/更换横幅照片/);store.can_edit=false;
      delete a.photos;
    });
    await t.test(
      "URL filters are encoded, resettable and preserve the current view",
      () => {
        assert.equal(
          url({ q: "A&B", year: "2025" }),
          "/?view=gallery&q=A%26B&year=2025",
        );
        assert.equal(url({ view: "about" }, true), "/?view=about");
      },
    );
    await t.test(
      "untracked releases are not mislabeled as missing physical versions",
      () => {
        assert.equal(albumStatus(store.albums[0]), "untracked");
        assert.equal(albumStatus(store.albums[1]), "partial");
        assert.equal(albumStatus(store.albums[2]), "missing");
        assert.deepEqual(
          filteredAlbums(route("?view=collection")).map((a) => a.id),
          [2],
        );
        assert.deepEqual(
          filteredAlbums(route("?view=gallery&status=missing")).map(
            (a) => a.id,
          ),
          [3],
        );
        assert.deepEqual(
          filteredAlbums(route("?view=gallery&status=untracked")).map(
            (a) => a.id,
          ),
          [1],
        );
      },
    );
    await t.test(
      "search, custom types, year, limited and sorting use real metadata",
      () => {
        assert.equal(
          filteredAlbums(route("?view=gallery&q=beta&year=2024&limited=1"))
            .length,
          1,
        );
        assert.equal(
          filteredAlbums(route("?view=gallery&type=5th%20Studio%20Album"))[0]
            .id,
          1,
        );
        assert.deepEqual(
          filteredAlbums(route("?view=gallery&sort=date-asc")).map((a) => a.id),
          [2, 1, 3],
        );
        assert.equal(isLimited(version(4, "missing", "Digipack")), false);
      },
    );
    await t.test(
      "collection totals count versions instead of demo numbers or quantities",
      () => {
        assert.deepEqual(stats(), {
          total: 3,
          owned: 1,
          wishlist: 1,
          missing: 1,
          preordered: 0,
          limited: 1,
          albums: 3,
          groups: 1,
        });
        const html = page(route("?view=wishlist"));
        assert.match(html, /Beta/);
        assert.doesNotMatch(html, /data-album="1"|data-album="3"/);
      },
    );
    await t.test(
      "all pages render with missing covers and empty or populated data",
      () => {
        for (const view of [
          "home",
          "gallery",
          "collection",
          "wishlist",
          "about",
          "group",
        ])
          assert.ok(page(route(`?view=${view}&group=1`)).length);
        store.albums = [];
        store.groups = [];
        for (const view of [
          "home",
          "gallery",
          "collection",
          "wishlist",
          "about",
          "group",
        ])
          assert.ok(page(route(`?view=${view}`)).length);
      },
    );
    await t.test(
      "homepage preview has a full-gallery link, not nonfunctional pagination",
      () => {
        store.albums = Array.from({ length: 30 }, (_, i) => ({
          id: i + 1,
          name: `Album ${i}`,
          group_name: "",
          album_type: "",
          release_date: "",
          versions: [],
        }));
        const html = page(route("?view=home"));
        assert.equal((html.match(/class="album-card"/g) || []).length, 6);
        assert.doesNotMatch(html, /class="load-more"/);
        assert.match(html, /view=gallery/);
        assert.equal(
          (
            page(route("?view=gallery&count=48")).match(
              /class="album-card"/g,
            ) || []
          ).length,
          30,
        );
      },
    );
    await t.test(
      "text and artwork are escaped; unsupported image schemes are rejected",
      () => {
        assert.equal(e('<script>"&'), "&lt;script&gt;&quot;&amp;");
        assert.doesNotMatch(image("javascript:alert(1)", "X"), /<img/);
        assert.doesNotMatch(image("//example.test/image.png", "X"), /<img/);
        assert.match(
          image("/uploads/cover.png", '"hi"'),
          /alt="&quot;hi&quot;"/,
        );
        assert.doesNotMatch(
          albumCard({ id: 1, name: "<script>alert(1)</script>", versions: [] }),
          /<script>/,
        );
      },
    );
  } finally {
    if (previousLocation === undefined) delete global.location;
    else global.location = previousLocation;
    store.albums = [];
    store.groups = [];
    store.profile = {};
  }
});
