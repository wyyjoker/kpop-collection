import { store, findAlbum, findVersion } from "./store.js";
import { e, image, icon, labels, badge, empty } from "./components.js";
const dialog = document.querySelector("#editorDialog");
function show(title, content, wide = false) {
  dialog.classList.toggle("wide", wide);
  dialog.innerHTML = `<div class="dialog-heading"><div><small>MY LITTLE SCRAPBOOK</small><h2 id="dialogTitle">${e(title)}</h2></div><button class="icon-button" data-action="close-dialog" aria-label="关闭">${icon("close")}</button></div>${content}`;
  if (!dialog.open) dialog.showModal();
}
const field = (label, name, value = "", type = "text", extra = "") =>
  `<label>${label}<input name="${name}" type="${type}" value="${e(value)}" ${extra}></label>`;
const textarea = (label, name, value = "", limit = 2000) =>
  `<label>${label}<textarea name="${name}" rows="4" maxlength="${limit}">${e(value)}</textarea></label>`;
const uploadField = (label, name = "cover_file") =>
  `<label>${label}<input name="${name}" type="file" accept="image/*"></label>`;
const form = (kind, id, content, remove = "") =>
  `<form class="editor-form" data-editor="${kind}" data-id="${e(id || "")}">${content}<p class="form-error" role="alert" hidden></p><div class="form-actions">${remove}<button class="pink-button" type="submit">${kind.startsWith("import") ? "恢复备份" : "保存" + (kind === "profile" ? "资料" : "")}</button></div></form>`;
const removeButton = (kind, id) =>
  `<button class="danger-button" type="button" data-action="delete-${kind}" data-id="${id}">删除${kind === "group" ? "团体" : kind === "album" ? "专辑" : "版本"}</button>`;
export function openAlbum(id, wish = false) {
  const a = findAlbum(id);
  if (!a) throw new Error("专辑已不存在，请刷新后重试。");
  const discs = new Map();
  for (const t of a.tracks || []) {
    const rows = discs.get(t.disc_no) || [];
    rows.push(t);
    discs.set(t.disc_no, rows);
  }
  show(
    a.name,
    `<div class="album-detail-head">${image(a.cover, a.name)}<div><p>${e(a.group_name)}</p><h3>${e(a.name)}</h3><p>${e(a.album_type)} · ${e(a.release_date)}</p><p class="preserve-lines">${e(a.notes)}</p><button class="soft-button" data-action="edit-album" data-id="${a.id}">${icon("edit")}编辑专辑</button></div></div>
    <section class="version-section"><div class="section-heading"><h3>${wish ? "选择一个版本，写进心愿清单 ♡" : "我的实体版本"}</h3><button class="pink-button" data-action="add-version" data-id="${a.id}" data-wish="${wish ? "1" : ""}">＋ 添加版本</button></div>
    ${a.versions.length ? a.versions.map((v) => `<article class="version-row">${image(v.cover || a.cover, v.version_name)}<div><b>${e(v.version_name)}</b><small>${e(v.edition_type || "实体版本")} · 数量 ${v.quantity}</small>${badge(v.status)}</div><div class="version-actions"><label class="sr-only" for="version-status-${v.id}">收藏状态 ${e(v.version_name)}</label><select id="version-status-${v.id}" data-version-status="${v.id}">${["missing", "owned", "wishlist", "preordered"].map((s) => `<option value="${s}" ${v.status === s ? "selected" : ""}>${labels[s]}</option>`).join("")}</select>${wish && v.status !== "wishlist" && v.status !== "owned" ? `<button class="soft-button" data-action="mark-wish" data-id="${v.id}">♡ 加入心愿</button>` : ""}<button class="icon-button" data-action="edit-version" data-id="${v.id}" aria-label="编辑版本 ${e(v.version_name)}">${icon("edit")}</button></div></article>`).join("") : empty("还没有录入实体版本", "请填写你实际收藏或想购买的版本名。收藏状态按版本记录，不会自动创建虚构版本。")}
    </section>${discs.size ? `<details class="tracklist"><summary>♪ TRACKLIST <span>${a.tracks.length} 首曲目</span></summary>${[...discs].map(([disc, tracks]) => `<h4>DISC ${disc}</h4><ol>${tracks.map((t) => `<li>${e(t.title)}${t.note ? `<small>${e(t.note)}</small>` : ""}</li>`).join("")}</ol>`).join("")}</details>` : ""}`,
    true,
  );
  dialog.dataset.albumId = String(a.id);
}
export function editGroup(id) {
  const g = store.groups.find((g) => g.id === Number(id)) || {};
  show(
    id ? "编辑团体" : "添加本命团",
    form(
      "group",
      id,
      `${field("团体名称", "name", g.name, "text", 'required maxlength="100"')}${field("韩文名", "korean_name", g.korean_name)}<div class="two-columns">${field("公司", "company", g.company)}${field("出道日期", "debut_date", g.debut_date, "date")}</div>${uploadField("团体照片 / 封面")}`,
      id ? removeButton("group", id) : "",
    ),
  );
}
export function editAlbum(id, groupId) {
  const a = findAlbum(id) || {};
  show(
    id ? "编辑专辑" : "录入专辑",
    form(
      "album",
      id,
      `${id ? "" : `<label>所属团体<select name="group_id" required>${store.groups.map((g) => `<option value="${g.id}" ${String(groupId) === String(g.id) ? "selected" : ""}>${e(g.name)}</option>`).join("")}</select></label>`}${field("专辑名称", "name", a.name, "text", 'required maxlength="200"')}${field("韩文名", "korean_name", a.korean_name)}<div class="two-columns">${field("发行日期", "release_date", a.release_date, "date")}${field("发行类型", "album_type", a.album_type, "text", 'list="albumTypes"')}<datalist id="albumTypes"><option>Full Album</option><option>Mini Album</option><option>Single Album</option><option>Special Album</option><option>Repackage</option></datalist></div>${uploadField("专辑封面")}${textarea("专辑笔记", "notes", a.notes)}`,
      id ? removeButton("album", id) : "",
    ),
  );
}
export function editVersion(id, albumId, wish = false) {
  const v = findVersion(id) || {},
    a = findAlbum(albumId) || v.album;
  if (!a) throw new Error("请先选择专辑。");
  show(
    id ? "编辑收藏版本" : "添加实体版本",
    form(
      "version",
      id,
      `<input type="hidden" name="album_id" value="${a.id}"><p class="form-context">${e(a.group_name)} · ${e(a.name)}</p>${field("版本名称", "version_name", v.version_name, "text", 'required placeholder="例如：实际发行的 Photobook Ver. A" maxlength="200"')}<div class="two-columns">${field("版本类型", "edition_type", v.edition_type, "text", 'placeholder="Photobook / Limited / Digipack"')}${field("条码", "barcode", v.barcode)}</div>${uploadField("版本封面")}<div class="two-columns"><label>收藏状态<select name="status">${["missing", "owned", "wishlist", "preordered"].map((s) => `<option value="${s}" ${(v.status || (wish ? "wishlist" : "missing")) === s ? "selected" : ""}>${labels[s]}</option>`).join("")}</select></label>${field("数量", "quantity", v.quantity || 0, "number", 'min="0" step="1" required')}</div>${field("购买渠道", "purchase_channel", v.purchase_channel)}<div class="two-columns">${field("购买日期", "purchase_date", v.purchase_date, "date")}${field("购买价格（可留空）", "purchase_price", v.purchase_price ?? "", "number", 'min="0" step="0.01"')}</div>${field("币种", "purchase_currency", v.purchase_currency || "CNY", "text", 'maxlength="3" placeholder="CNY / KRW / USD"')}<label class="checkbox-label"><input type="checkbox" name="opened" ${v.opened ? "checked" : ""}>已经拆封</label>${textarea("收藏笔记 / 心愿理由", "notes", v.collection_notes)}`,
      id ? removeButton("version", id) : "",
    ),
  );
}
export function editProfile() {
  const p = store.profile;
  show(
    "关于我 · 编辑资料",
    form(
      "profile",
      1,
      `${field("昵称", "name", p.name, "text", 'maxlength="100" placeholder="你希望被怎样称呼？"')}${textarea("个人简介", "bio", p.bio)}<div class="two-columns">${uploadField("个人头像", "avatar_file")}${uploadField("首页主视觉照片", "hero_file")}</div><p class="form-hint">主视觉可上传团体照或你的收藏角照片；不上传则展示真实专辑封面。</p><fieldset><legend>我的本命团</legend>${store.groups.length ? store.groups.map((g) => `<label class="checkbox-label"><input type="checkbox" name="favorite_group_ids" value="${g.id}" ${(p.favorite_group_ids || []).includes(g.id) ? "checked" : ""}>${e(g.name)}</label>`).join("") : "先添加一个团体，再选择你的本命团。"}</fieldset>${textarea("我的笔记 / 小小日常", "diary", p.diary, 20000)}`,
    ),
    true,
  );
}
export function backup() {
  show(
    "备份与恢复",
    `<section class="backup-section"><h3>把喜欢好好保存 ♡</h3><p>备份包含团体、专辑、版本、收藏、曲目和个人资料。${store.runtime === 'sites' ? '云端备份同时包含已引用的上传图片（图片合计最多 12 MB，恢复文件最多 24 MB）。本地与云端的数据独立保存。' : '上传的图片请同时备份 public/uploads 文件夹。'}</p><div class="button-row"><a class="soft-button" href="/api/export${store.runtime === 'sites' ? '?assets=1' : ''}" download>↓ 导出 JSON</a><a class="soft-button" href="/api/backup/database" download>↓ 导出 SQLite</a></div></section><section class="backup-section"><h3>恢复已有收藏</h3><p>恢复会替换当前数据，建议先导出一份备份。</p>${form("import-json", "", `<label>JSON 备份<input type="file" name="backup" accept="application/json,.json" required></label>`)}${form("import-db", "", `<label>SQLite 备份<input type="file" name="backup" accept=".db,.sqlite,.sqlite3" required></label>`)}</section>`,
    true,
  );
}
export const close = () => dialog.close();
