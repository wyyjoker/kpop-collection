import { store, stats, albumStatus } from "./store.js";
export const e = (value = "") =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export const labels = {
  owned: "已拥有",
  partial: "部分拥有",
  wishlist: "想要收藏",
  missing: "待补",
  preordered: "已预购",
  untracked: "待录入版本",
};
const paths = {
  home: "m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9",
  heart:
    "M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z",
  albums: "M3 5h14v16H3zM7 2h14v15M7 10h6M7 14h6",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  star: "m12 2 3 6.5 7 1-5 5 1.2 7-6.2-3.3L5.8 21 7 14l-5-4.5 7-1Z",
  music:
    "M9 18V5l12-3v13M9 8l12-3M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3ZM21 15a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z",
  user: "M20 21v-2a7 7 0 0 0-14 0v2M17 7a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z",
  search: "M21 21l-6-6M17 9a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z",
  crown: "m2 5 5 5 5-7 5 7 5-5-3 15H5ZM6 23h12",
  note: "M5 3h14v18H5zM8 8h8M8 12h8M8 16h5",
  plus: "M12 4v16M4 12h16",
  arrow: "M4 12h16m-6-6 6 6-6 6",
  backup: "M12 2v13m-5-5 5 5 5-5M4 16v5h16v-5",
  close: "m5 5 14 14M19 5 5 19",
  edit: "m16 3 5 5-12 12-6 1 1-6ZM13 6l5 5",
  list: "M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1",
};
export const icon = (name) =>
  `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name] || paths.star}"/></svg>`;
export function image(src, title, className = "") {
  const safe = /^(https?:\/\/|\/(?!\/))/.test(src || "") ? src : "";
  return `<span class="picture ${className}">${safe ? `<img src="${e(safe)}" alt="${e(title)}" loading="lazy">` : ""}<span class="picture-fallback" ${safe ? "hidden" : ""}>${e((title || "♡").slice(0, 1))}</span></span>`;
}
export const badge = (status) =>
  `<span class="badge ${e(status)}">${labels[status] || e(status)}</span>`;
export const empty = (
  title,
  copy = "每一份喜欢，都值得被好好收藏。",
  action = "",
) =>
  `<div class="empty-paper"><span>♡</span><h3>${e(title)}</h3><p>${e(copy)}</p>${action}</div>`;
export const navItems = [
  ["home", "首页", "home"],
  ["collection", "我的收藏", "albums"],
  ["gallery", "专辑图鉴", "grid"],
  ["wishlist", "心愿清单", "heart"],
  ["about", "关于我", "user"],
];
export function header(r) {
  return `<a href="/?view=home" data-nav class="mantra">Good Music<br>Brighter Days ♡</a><nav aria-label="主导航">${navItems.map(([v, l, i]) => `<a href="/?view=${v}" data-nav ${r.view === v ? 'aria-current="page"' : ""}>${icon(i)}${l}</a>`).join("")}</nav>
    <form class="global-search" data-search><label class="sr-only" for="globalQuery">全站搜索</label><input id="globalQuery" name="q" value="${e(r.q)}" placeholder="搜索专辑、团名或关键词…"><button aria-label="搜索">${icon("search")}</button></form>
    <button class="icon-button" data-action="backup" aria-label="备份与恢复" title="备份与恢复">${icon("backup")}</button><a href="/?view=about" data-nav class="header-avatar" aria-label="我的资料">${image(store.profile.avatar, store.profile.name)}</a><span class="header-motto">Collecting<br>Happiness ♡</span>`;
}
// Keep the supplied artwork intact. SVG viewBox clips just the decorative
// masthead, never the reference's fake navigation, statistics or album cards.
export function referenceHero() {
  return `<h1 class="sr-only">K-pop 收藏日记</h1>
    <p class="sr-only">Album Today, A Happier Me ☺</p>
    <svg class="reference-hero-art" viewBox="0 77 1491 277" width="1491" height="277" role="img" aria-label="参考图中的女团合照，搭配 K-pop 收藏日记手写标题、专辑收藏角、唱片与粉彩手账便签" preserveAspectRatio="xMidYMid meet">
      <defs><clipPath id="reference-masthead-crop"><path d="M0 98H164V77H400V62H930V77H1491V354H0Z" /></clipPath></defs>
      <image href="/assets/scrapbook/reference-masthead.png" width="1491" height="1055" clip-path="url(#reference-masthead-crop)" />
    </svg>
    ${store.profile.hero_cover ? `<div class="reference-custom-photo">${image(store.profile.hero_cover, "我的收藏主视觉")}</div>` : ""}`;
}
export function hero(r) {
  if (r.view === "home" || r.view === "collection") return referenceHero();
  const albums = [...store.albums]
    .sort((a, b) => (b.release_date || "").localeCompare(a.release_date || ""))
    .filter((a) => a.cover)
    .slice(0, 4);
  return `<div class="hero-scenery scenery-left"><img src="/assets/scrapbook/collection-corner.png" alt="阳光下的专辑收藏角"><span class="tape"></span><b>Same stars,<br>different stories,<br>still K-pop ♡</b></div>
    <div class="hero-center"><div class="hero-title"><span class="title-star">★</span><h1><span>K</span>-pop<span class="chinese-title">收藏日记</span></h1><span class="title-heart">♥</span><p>Album Today, A Happier Me ☺</p></div>
    ${
      r.view === "gallery"
        ? `<form class="hero-search" data-search><h2>找到下一张心动专辑 ♡</h2><div>${icon("search")}<input aria-label="搜索图鉴" name="q" value="${e(r.q)}" placeholder="专辑、团名、关键词…"><button class="pink-button">搜索</button></div><small>${store.albums.length} 张真实发行 · 记录每一次心动</small></form>`
        : `<div class="hero-memories">${store.profile.hero_cover ? image(store.profile.hero_cover, "我的收藏主视觉", "hero-custom") : `<div class="hero-albums">${albums.map((a) => `<button data-album="${a.id}" aria-label="查看 ${e(a.name)}">${image(a.cover, a.name)}</button>`).join("")}</div>`}<span>Music, memories<br>& a little happiness ♡</span></div>`
    }
    </div><div class="hero-scenery scenery-right"><img src="/assets/scrapbook/collection-corner.png" alt="唱片与收藏专辑"><span class="tape"></span><b>A SMALL<br>COLLECTION<br>A BIGGER<br>HAPPINESS ♡</b></div>
    <div class="hero-note note-left">More K-pop<br>More Happy ♡</div><div class="hero-note note-right">收藏的不只是专辑<br>而是那些闪闪发光的日子 ♡</div><img class="hero-bunny" src="/assets/scrapbook/doodle-bunny.svg" alt=""><span class="hero-sparkle">✦</span>`;
}
export function favorites() {
  const selected = store.profile.favorite_group_ids || [];
  const groups = [...store.groups].sort(
    (a, b) => Number(selected.includes(b.id)) - Number(selected.includes(a.id)),
  );
  return `<div class="favorite-label"><strong>本命团</strong><span>My Ult Groups ♡</span></div><div class="favorite-track">${groups.map((g) => `<a data-nav href="/?view=group&group=${g.id}" class="favorite-person">${image(g.cover, g.name)}<span><b>${e(g.name)}</b><small>${selected.includes(g.id) ? "永远的本命 ♡" : e(g.korean_name || "一起记录喜欢")}</small></span></a>`).join("") || "<p>从你的第一个本命团开始 ♡</p>"}<button class="add-group" data-action="add-group">${icon("plus")}<span>添加团体</span></button></div><div class="favorite-note">音乐让平凡的日子<br>也闪闪发光 ✦</div>`;
}
export function albumCard(a) {
  const status = albumStatus(a);
  return `<article class="album-card"><button class="album-art" data-album="${a.id}" aria-label="查看专辑 ${e(a.name)}">${image(a.cover, a.name)}</button><button class="heart-button ${a.versions.some((v) => v.status === "wishlist") ? "selected" : ""}" data-action="wish-album" data-id="${a.id}" aria-label="管理 ${e(a.name)} 的心愿版本" title="选择版本加入心愿清单">${icon("heart")}</button><div class="album-copy"><small>${e(a.group_name)}</small><button class="album-name" data-album="${a.id}">${e(a.name)}</button><time>${e(a.release_date?.replaceAll("-", ".") || "发行日期待补充")}</time><div class="card-badges">${badge(status)}<span class="badge type">${e(a.album_type || "专辑")}</span></div></div></article>`;
}
export function heading(title, subtitle = "", right = "", symbol = "star") {
  return `<div class="section-heading"><div><span class="heading-icon">${icon(symbol)}</span><h2>${e(title)}</h2><p>${e(subtitle)}</p></div>${right}</div>`;
}
export function sidebar(r) {
  return `<div class="sidebar-label"><strong>${r.view === "wishlist" ? "心愿清单" : r.view === "gallery" ? "专辑图鉴" : "收藏手账"}</strong><span>My Little Scrapbook ♡</span></div><nav class="side-nav">${navItems.map(([v, l, i]) => `<a data-nav href="/?view=${v}" ${r.view === v ? 'aria-current="page"' : ""}>${icon(i)}${l}</a>`).join("")}<a data-nav href="/?view=gallery&limited=1">${icon("crown")}限定版</a><button data-action="edit-profile">${icon("note")}我的笔记</button><button data-action="backup">${icon("backup")}备份与恢复</button></nav>
    ${["gallery", "collection", "group", "wishlist"].includes(r.view) ? filterForm(r) : ""}<div class="sticky-note mint side-note">K-pop makes<br>life sweeter ♡<img src="/assets/scrapbook/doodle-flower.svg" alt=""></div>`;
}
export function filterForm(r) {
  const select = (name, label, list, value) =>
    `<label>${label}<select name="${name}" data-filter>${list.map(([v, l]) => `<option value="${e(v)}" ${String(v) === value ? "selected" : ""}>${e(l)}</option>`).join("")}</select></label>`;
  return `<div class="side-filters"><h3>筛选条件 ♡</h3>${r.view === "group" ? "" : select("group", "团体", [["", "全部团体"], ...store.groups.map((g) => [g.id, g.name])], r.group)}${select(
    "year",
    "年份",
    [
      ["", "全部年份"],
      ...[
        ...new Set(
          store.albums.map((a) => a.release_date?.slice(0, 4)).filter(Boolean),
        ),
      ]
        .sort()
        .reverse()
        .map((v) => [v, v]),
    ],
    r.year,
  )}${select("type", "发行类型", [["", "全部类型"], ...[...new Set(store.albums.map((a) => a.album_type).filter(Boolean))].sort().map((v) => [v, v])], r.type)}${r.view === "wishlist" ? "" : select("status", "收藏状态", [["", "默认"], ...Object.entries(labels).filter(([k]) => k !== "partial")], r.status)}<button data-action="reset-filters" class="pink-button">重置筛选</button></div>`;
}
export function rail() {
  const s = stats(),
    completion = s.total ? Math.round((s.owned / s.total) * 100) : 0;
  const newest = [...store.albums].sort((a, b) => b.id - a.id)[0];
  return `<section class="sticky-note blue rail-quote">音乐让平凡的日子<br>也闪闪发光 ✨<small>— K-pop 收藏日记 ♡</small></section>
    <section class="paper daily"><h3>小小日常 ☆</h3><div class="polaroid">${image("/assets/scrapbook/collection-corner.png", "我的音乐时光")}<span>Good Music, Better Me ♡</span></div><p>${e(store.profile.diary || "好音乐，会一直陪着我 ♡")}</p><small>${new Date().toLocaleDateString("zh-CN")}</small></section>
    <section class="paper progress-paper"><h3>我的收藏进度 ♡</h3><div class="progress-row"><div class="progress-ring" style="--progress:${completion}%"><b>${completion}%</b></div><div><p><i class="mint-dot"></i>已拥有 ${s.owned}</p><p><i class="purple-dot"></i>想要收藏 ${s.wishlist}</p><p><i class="pink-dot"></i>待补 ${s.missing}</p></div></div><small>按已录入的实体版本统计</small></section>
    ${newest ? `<section class="paper new-in"><h3>最近收录 <em>New in!</em></h3><button data-album="${newest.id}">${image(newest.cover, newest.name)}<span><small>${e(newest.group_name)}</small><b>${e(newest.name)}</b><small>最近收录到图鉴</small></span></button></section>` : ""}<section class="sticky-note lilac encouragement"><h3>继续收集吧！</h3><p>下一张专辑，下一段故事…<br>每一次喜欢都值得记录 ♡</p><img src="/assets/scrapbook/doodle-bunny.svg" alt=""></section>`;
}
export function musicBar() {
  const a = store.albums[0];
  return `<div class="music-identity">${image(a?.cover, a?.name || "音乐日记")}<span><b>${e(a?.name || "My Music Diary")}</b><small>${e(a?.group_name || "Collecting Happiness")}</small></span></div><span class="vinyl-disc" aria-hidden="true">♫</span><span class="music-caption">Good Music · Brighter Days ♡</span><div class="music-line"><span></span></div><small>音乐角 · 暂未接入播放</small><a data-nav href="/?view=wishlist" aria-label="心愿清单">${icon("heart")}</a><button data-action="backup" aria-label="备份收藏">${icon("backup")}</button>`;
}
