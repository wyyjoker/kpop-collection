import { request } from "./api.js";
export const store = { groups: [], albums: [], profile: {}, ready: false };
export async function refresh() {
  const [library, profile] = await Promise.all([
    request("/api/library"),
    request("/api/profile"),
  ]);
  Object.assign(store, library, { profile, ready: true });
}
export function versions() {
  return store.albums.flatMap((album) =>
    album.versions.map((version) => ({
      ...version,
      album,
      group_name: album.group_name,
    })),
  );
}
export const findAlbum = (id) =>
  store.albums.find((album) => album.id === Number(id));
export const findVersion = (id) =>
  versions().find((version) => version.id === Number(id));
export const isLimited = (version) =>
  /limited|special|collector|pob|限定|特典|珍藏/i.test(
    `${version.version_name} ${version.edition_type}`,
  );
export function albumStatus(album) {
  const list = album.versions;
  if (!list.length) return "untracked";
  if (list.every((item) => item.status === "owned")) return "owned";
  if (list.some((item) => item.status === "owned")) return "partial";
  if (list.some((item) => item.status === "wishlist")) return "wishlist";
  if (list.some((item) => item.status === "preordered")) return "preordered";
  return "missing";
}
export function stats() {
  const list = versions();
  return {
    total: list.length,
    owned: list.filter((v) => v.status === "owned").length,
    wishlist: list.filter((v) => v.status === "wishlist").length,
    missing: list.filter((v) => v.status === "missing").length,
    preordered: list.filter((v) => v.status === "preordered").length,
    limited: list.filter(isLimited).length,
    albums: store.albums.length,
    groups: store.groups.length,
  };
}
export function route(search = location.search) {
  const params = new URLSearchParams(search);
  const views = ["home", "collection", "gallery", "wishlist", "about", "group"];
  let view = params.get("view") || (params.has("group") ? "group" : "home");
  if (view === "collection" && params.get("tab") === "wishlist")
    view = "wishlist";
  return {
    view: views.includes(view) ? view : "home",
    group: params.get("group") || "",
    q: params.get("q") || "",
    year: params.get("year") || "",
    type: params.get("type") || "",
    status:
      params.get("status") ||
      (params.get("tab") === "missing" ? "missing" : ""),
    limited: params.get("limited") === "1",
    sort: params.get("sort") || "date-desc",
    layout: params.get("layout") === "list" ? "list" : "grid",
    count: Math.max(12, Number(params.get("count")) || 24),
  };
}
export function url(patch, reset = false) {
  const params = new URLSearchParams(reset ? "" : location.search);
  for (const [key, value] of Object.entries(patch)) {
    if (
      value === "" ||
      value === false ||
      value === null ||
      value === undefined
    )
      params.delete(key);
    else params.set(key, String(value));
  }
  params.delete("tab");
  return `/?${params.toString()}`;
}
export function filteredAlbums(r = route()) {
  const q = r.q.trim().toLowerCase();
  let list = store.albums.filter(
    (a) =>
      (!r.group || a.group_id === Number(r.group)) &&
      (!q ||
        `${a.name} ${a.group_name} ${a.korean_name || ""} ${a.album_type}`
          .toLowerCase()
          .includes(q)) &&
      (!r.year || a.release_date?.startsWith(r.year)) &&
      (!r.type || a.album_type === r.type) &&
      (!r.limited || a.versions.some(isLimited)) &&
      (!r.status ||
        (r.status === "untracked"
          ? !a.versions.length
          : a.versions.some((v) => v.status === r.status))),
  );
  if (r.view === "collection" && !r.status)
    list = list.filter((a) => a.versions.some((v) => v.status === "owned"));
  return list.sort((a, b) =>
    r.sort === "name"
      ? a.name.localeCompare(b.name)
      : r.sort === "added"
        ? b.id - a.id
        : r.sort === "date-asc"
          ? (a.release_date || "9999").localeCompare(b.release_date || "9999")
          : (b.release_date || "").localeCompare(a.release_date || ""),
  );
}
