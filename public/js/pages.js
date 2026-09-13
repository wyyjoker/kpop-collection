import {
  store,
  stats,
  versions,
  filteredAlbums,
  isLimited,
  url,
} from "./store.js";
import {
  e,
  icon,
  image,
  empty,
  heading,
  albumCard,
  badge,
  labels,
} from "./components.js";
import { photoSection } from './photos.js';
import { audioSection } from './audio.js';

function chips(r, choices) {
  return `<div class="chips">${choices.map(([value, label]) => `<a data-nav href="${e(url({ status: value, count: null }))}" class="${r.status === value ? "active" : ""}">${label}</a>`).join("")}</div>`;
}
function toolbar(r) {
  return `<div class="view-tools"><label class="sr-only" for="sortOrder">排序</label><select id="sortOrder" name="sort" data-filter>${[
    ["date-desc", "最新发布"],
    ["date-asc", "发行时间 ↑"],
    ["added", "最近添加"],
    ["name", "名称 A–Z"],
  ]
    .map(
      ([v, l]) =>
        `<option value="${v}" ${r.sort === v ? "selected" : ""}>${l}</option>`,
    )
    .join(
      "",
    )}</select><a data-nav href="${e(url({ layout: "grid" }))}" class="${r.layout === "grid" ? "active" : ""}" aria-label="网格视图">${icon("grid")}</a><a data-nav href="${e(url({ layout: "list" }))}" class="${r.layout === "list" ? "active" : ""}" aria-label="列表视图">${icon("list")}</a></div>`;
}
function albumGrid(list, r, count = r.count, preview = false) {
  return list.length
    ? `<div class="album-grid ${r.layout === "list" ? "list-view" : ""}">${list.slice(0, count).map(albumCard).join("")}</div>${!preview && list.length > count ? `<div class="load-more"><a class="soft-button" data-nav href="${e(url({ count: count + 24 }))}">再看看更多专辑（已展示 ${count} / ${list.length}） ${icon("arrow")}</a></div>` : ""}`
    : empty(
        "这里还没有专辑",
        r.view === "collection" && !r.status
          ? "在专辑详情中添加实际版本，并标记为已拥有，就会出现在这里。"
          : "试试调整筛选条件，或录入一张喜欢的专辑。",
        '<a class="pink-button" data-nav href="/?view=gallery">去专辑图鉴看看</a>',
      );
}
export function overview() {
  const s = stats();
  return `<section class="overview" aria-label="收藏概览">${[
    ["albums", s.albums, "专辑图鉴", "已录入的发行"],
    ["heart", s.owned, "我的收藏", "已拥有的版本"],
    ["star", s.wishlist, "想要收藏", "心愿清单中"],
    ["music", s.missing, "待补版本", "下一份小期待"],
    ["crown", s.limited, "限定版", "已录入的版本"],
  ]
    .map(
      ([i, n, l, c]) =>
        `<article><span>${icon(i)}</span><div><strong>${n}</strong><b>${l}</b><small>${c}</small></div></article>`,
    )
    .join("")}</section>`;
}
function home(r) {
  const list = filteredAlbums(r),
    special = versions().filter(isLimited).slice(0, 4),
    wishes = versions()
      .filter((v) => v.status === "wishlist")
      .slice(0, 5);
  return `<section class="paper album-section">${heading("回归专辑", "每一次回归，都是新的心动。", '<a data-nav class="text-link" href="/?view=gallery">全部图鉴 →</a>')}${chips(
    r,
    [
      ["", "全部"],
      ["owned", "已拥有"],
      ["wishlist", "想要收藏"],
      ["missing", "待补"],
    ],
  )}${albumGrid(list, { ...r, layout: "grid" }, 6, true)}</section>
    <div class="home-bottom"><section class="paper">${heading("限定版", "特别的版本，特别的回忆。", "", "crown")}${special.length ? `<div class="mini-albums">${special.map((v) => `<button data-album="${v.album.id}">${image(v.cover || v.album.cover, v.album.name)}<b>${e(v.album.name)}</b><small>${e(v.version_name)}</small></button>`).join("")}</div>` : empty("留给特别的版本", "添加限定版或特典版后，会自动收进这里。")}</section><section class="paper wish-preview">${heading("收藏清单", "Wishlist ♡", "", "heart")}${wishes.length ? wishes.map((v) => `<button data-album="${v.album.id}"><span>♡</span>${e(v.group_name)} · ${e(v.album.name)}<small>${e(v.version_name)}</small></button>`).join("") : "<p>把下一份心动，写进你的清单 ♡</p>"}<a data-nav href="/?view=wishlist" class="text-link">打开我的心愿清单 →</a></section></div>`;
}
function gallery(r) {
  const list = filteredAlbums(r);
  return `<div class="discovery-banner"><span>✦</span><p>每一张专辑<br>都是一个闪闪发光的宇宙 ♡</p><small>ALBUMS · MEMORIES · HAPPINESS</small></div><section class="paper album-section">${heading(r.limited ? "限定版专区" : "专辑图鉴", `共 ${list.length} 张发行`, '<button class="soft-button" data-action="add-album">＋ 录入专辑</button>')}
    <div class="collection-toolbar">${chips(r, [
      ["", "全部专辑"],
      ["owned", "已拥有"],
      ["wishlist", "想要收藏"],
      ["untracked", "待录入版本"],
    ])}${toolbar(r)}</div>${r.q ? `<p class="search-result">搜索「${e(r.q)}」的结果</p>` : ""}${albumGrid(list, r)}</section>`;
}
function collection(r) {
  const list = filteredAlbums(r);
  return `${overview()}<section class="paper album-section">${heading("我的收藏", "每一张专辑，都是我和它们的故事。♡", toolbar(r))}${chips(
    r,
    [
      ["", "已拥有"],
      ["wishlist", "想要收藏"],
      ["preordered", "已预购"],
      ["missing", "待补"],
    ],
  )}${albumGrid(list, r)}</section><section class="paper group-ranking">${heading("本命团收藏进度", "按实体版本统计")}${store.groups.map((g) => `<a data-nav href="/?view=group&group=${g.id}">${image(g.cover, g.name)}<b>${e(g.name)}</b><span class="ranking-track"><i style="width:${Number(g.completion) || 0}%"></i></span><small>${Number(g.owned_count) || 0} / ${Number(g.version_count) || 0}</small></a>`).join("")}</section>`;
}
function wishlist(r) {
  const albumIds = new Set(
    filteredAlbums({ ...r, view: "gallery", status: "" }).map((a) => a.id),
  );
  let list = versions().filter(
    (v) =>
      v.status === "wishlist" &&
      albumIds.has(v.album.id) &&
      (!r.limited || isLimited(v)),
  );
  list.sort((a, b) =>
    r.sort === "name"
      ? a.album.name.localeCompare(b.album.name)
      : r.sort === "date-asc"
        ? a.album.release_date.localeCompare(b.album.release_date)
        : r.sort === "added"
          ? b.id - a.id
          : b.album.release_date.localeCompare(a.album.release_date),
  );
  return `<section class="wishlist-intro"><div><h2>我的心愿清单 ♡</h2><p>还想遇见更多好音乐，<br>把喜欢一一收进来。</p></div><div class="wish-count"><strong>${list.length}</strong><span>份小小心愿</span><p>慢慢来，每一份喜欢都有归期 ♡</p></div></section><section class="paper">${heading("心愿清单", `${list.length} 个实体版本`, toolbar(r), "heart")}<div class="chips"><a data-nav href="${e(url({ limited: null }))}" class="${!r.limited ? "active" : ""}">全部心愿</a><a data-nav href="${e(url({ limited: "1" }))}" class="${r.limited ? "active" : ""}">限定版</a></div>${
    list.length
      ? `<div class="wish-grid ${r.layout === "list" ? "list-view" : ""}">${list
          .slice(0, r.count)
          .map(
            (v) =>
              `<article class="wish-card"><button data-album="${v.album.id}" class="wish-art">${image(v.cover || v.album.cover, v.album.name)}</button><div><small>${e(v.group_name)}</small><button class="album-name" data-album="${v.album.id}">${e(v.album.name)}</button><span class="version-label">${e(v.version_name)}</span><p>${e(v.collection_notes || "下一张专辑，下一段故事 ♡")}</p><div class="wish-actions"><button class="mint-button" data-action="mark-owned" data-id="${v.id}">✓ 已经收到了</button><button class="icon-button" data-action="edit-version" data-id="${v.id}" aria-label="编辑 ${e(v.version_name)}">${icon("edit")}</button></div></div></article>`,
          )
          .join(
            "",
          )}</div>${list.length > r.count ? `<a data-nav class="soft-button" href="${e(url({ count: r.count + 24 }))}">加载更多</a>` : ""}`
      : empty(
          "下一份心动，还在路上",
          "在图鉴里点击专辑旁的爱心，选择一个真实版本加入心愿清单。",
          '<a data-nav class="pink-button" href="/?view=gallery">发现喜欢的专辑 →</a>',
        )
  }</section>`;
}
function about() {
  const p = store.profile,
    s = stats(),
    favorites = store.groups.filter((g) =>
      (p.favorite_group_ids || []).includes(g.id),
    );
  return `<section class="profile-paper paper"><div class="profile-photo polaroid">${image(p.avatar, p.name || "♡")}<span>Good Music, Better Me ♡</span></div><div class="profile-copy"><button data-action="edit-profile" class="soft-button profile-edit">${icon("edit")}编辑资料</button><h2>${e(p.name || "我的收藏日记")} <span>♕</span></h2><em>Collecting Happiness ♡</em><p>${e(p.bio || "在这里，记录喜欢的音乐、专辑和闪闪发光的自己。")}</p><div class="profile-counts"><span><b>${s.owned}</b>已拥有版本</span><span><b>${s.albums}</b>专辑图鉴</span><span><b>${favorites.length}</b>本命团</span><span><b>${s.wishlist}</b>想要收藏</span></div></div></section>
    <section class="paper">${heading("我喜欢的团体", "永远的本命 ♡", '<button class="text-link" data-action="edit-profile">编辑本命团 →</button>')}${favorites.length ? `<div class="profile-groups">${favorites.map((g) => `<a data-nav href="/?view=group&group=${g.id}">${image(g.cover, g.name)}<b>${e(g.name)}</b><small>${e(g.korean_name)}</small></a>`).join("")}</div>` : empty("把你的本命团贴在这里", "点击编辑资料，从已录入的团体中选择。")}</section>
    <div class="about-bottom"><section class="paper diary-page">${heading("我的笔记", "", '<button class="text-link" data-action="edit-profile">写一点日常 →</button>', "note")}<p>${e(p.diary || "好音乐，会一直陪着我。今天也要收集一点快乐 ♡")}</p></section><section class="paper">${heading("收藏里程碑", "每一步都值得纪念")}<div class="milestones">${[
      [s.albums > 0, "第一张专辑", "开始记录心动", "albums"],
      [s.owned > 0, "收藏起点", "拥有第一个版本", "heart"],
      [s.owned >= 100, "百张收藏", "拥有 100 个版本", "star"],
    ]
      .map(
        ([yes, title, copy, i]) =>
          `<div class="${yes ? "achieved" : ""}">${icon(i)}<b>${title}</b><small>${yes ? "已达成 ♡" : copy}</small></div>`,
      )
      .join("")}</div></section></div>`;
}
function group(r) {
  const g = store.groups.find((g) => g.id === Number(r.group));
  if (!g)
    return empty(
      "这页团体日记还不存在",
      "可以从本命团栏选择，或添加新的团体。",
    );
  const list = filteredAlbums(r);
  return `<section class="paper group-title">${image(g.cover, g.name)}<div><small>${e(g.company)}</small><h2>${e(g.name)}</h2><p>${e(g.korean_name)} · ${g.album_count} 张专辑 · ${g.owned_count} / ${g.version_count} 个版本</p></div><div><button class="soft-button" data-action="edit-group" data-id="${g.id}">编辑团体</button><button class="pink-button" data-action="add-album" data-id="${g.id}">＋ 录入专辑</button></div></section><section class="paper album-section">${heading("属于我们的音乐年鉴", `${list.length} 张发行`, toolbar(r))}${chips(
    r,
    [
      ["", "全部"],
      ["owned", "已拥有"],
      ["wishlist", "想要收藏"],
      ["missing", "待补"],
    ],
  )}${albumGrid(list, r)}</section>`;
}
export function page(r) {
  return { home, gallery, collection, wishlist, about, group, album }[r.view](r);
}
function album(r) {
  const a=store.albums.find(a=>a.id===Number(r.album));
  if(!a)return empty('这张专辑已不存在','从图鉴选择另一张专辑吧。','<a data-nav class="pink-button" href="/?view=gallery">返回专辑图鉴</a>');
  const discs=new Map();for(const track of a.tracks||[]){if(!discs.has(track.disc_no))discs.set(track.disc_no,[]);discs.get(track.disc_no).push(track);}
  return `<nav class="album-breadcrumb" aria-label="当前位置"><a data-nav href="/?view=gallery">← 专辑图鉴</a><span>/</span><span>${e(a.name)}</span></nav>
  <section class="paper album-page-intro">${image(a.cover,a.name)}<div><p class="album-eyebrow">${e(a.group_name)} · MY ALBUM DIARY</p><h1>${e(a.name)}</h1><p>${e(a.album_type)} · ${e(a.release_date)}</p><p class="preserve-lines">${e(a.notes)}</p>${store.can_edit?`<button class="soft-button" data-action="edit-album" data-id="${a.id}">${icon('edit')} 编辑专辑资料</button>`:''}</div></section>
  ${photoSection(a)}
  ${audioSection(a)}
  <section class="paper version-section">${heading('我的实体版本','',store.can_edit?`<button class="pink-button" data-action="add-version" data-id="${a.id}">＋ 添加版本</button>`:'')}${a.versions.length?a.versions.map(v=>`<article class="version-row">${image(v.cover||a.cover,v.version_name)}<div><b>${e(v.version_name)}</b><small>${e(v.edition_type||'实体版本')} · 数量 ${v.quantity}</small>${badge(v.status)}</div>${store.can_edit?`<div class="version-actions"><label class="sr-only" for="version-status-${v.id}">收藏状态 ${e(v.version_name)}</label><select id="version-status-${v.id}" data-version-status="${v.id}">${['missing','owned','wishlist','preordered'].map(s=>`<option value="${s}" ${s===v.status?'selected':''}>${labels[s]}</option>`).join('')}</select><button class="soft-button" data-action="edit-version" data-id="${v.id}">编辑版本</button></div>`:''}</article>`).join(''):empty('还没有录入实体版本',store.can_edit?'添加实际收藏或想购买的版本。':'主人还没有录入实体版本。')}</section>
  ${discs.size?`<section class="paper"><details class="tracklist"><summary>♪ TRACKLIST · ${a.tracks.length} 首曲目</summary>${[...discs].map(([disc,tracks])=>`<h3>DISC ${disc}</h3><ol>${tracks.map(t=>`<li>${e(t.title)}${t.note?`<small>${e(t.note)}</small>`:''}</li>`).join('')}</ol>`).join('')}</details></section>`:''}`;
}
