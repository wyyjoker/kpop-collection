import { request, save, upload } from "./js/api.js";
import {
  store,
  refresh,
  route,
  url,
  findAlbum,
  findVersion,
} from "./js/store.js";
import {
  header,
  hero,
  favorites,
  sidebar,
  rail,
  musicBar,
  empty,
  navItems,
} from "./js/components.js?v=masthead2";
import { page } from "./js/pages.js";
import * as dialogs from "./js/dialogs.js";
import { registerAgentTools } from "./js/agent-tools.js";
import { choosePhotos,captureCaption,removeDraft,savePhotos,deletePhoto,leavePhotos,hasPhotoChanges } from './js/photos.js';

let installPrompt;
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 3500);
}
function render() {
  const r = route();
  document.body.dataset.view = r.view;
  document.body.dataset.editable=String(!!store.can_edit);
  document.body.classList.toggle(
    "reference-masthead",
    r.view === "home" || r.view === "collection",
  );
  document.title = `${r.view==='album'?(findAlbum(r.album)?.name||'专辑详情'):navItems.find(([v]) => v === r.view)?.[1] || "团体日记"} · K-pop 收藏日记`;
  for (const [id, content] of [
    ["siteHeader", header(r)],
    ["hero", hero(r)],
    ["favoriteStrip", favorites()],
    ["sidebar", sidebar(r)],
    ["pageContent", page(r)],
    ["diaryRail", rail()],
    ["musicBar", musicBar()],
  ])
    document.getElementById(id).innerHTML = content;
  if(!store.can_edit) {
    document.querySelectorAll('[data-action]').forEach(el=>{if(/^(add|edit|delete|mark)-/.test(el.dataset.action)||['backup','wish-album'].includes(el.dataset.action))el.hidden=true;});
    document.querySelector('#siteHeader').insertAdjacentHTML('beforeend',`<a class="owner-login" target="_top" href="/signin-with-chatgpt?return_to=${encodeURIComponent(location.pathname+location.search)}">主人登录</a>`);
  }
  if (installPrompt)
    document
      .querySelector("#siteHeader")
      .insertAdjacentHTML(
        "beforeend",
        '<button class="soft-button install-button" data-action="install">安装</button>',
      );
}
function navigate(href, scroll = true) {
  if(href!==location.pathname+location.search&&!leavePhotos())return;
  if (href !== location.pathname + location.search)
    history.pushState({}, "", href);
  dialogs.close();
  render();
  if (scroll) window.scrollTo({ top: 0, behavior: "instant" });
}
function openAlbum(id) {
  if(!findAlbum(id))throw new Error('专辑已不存在，请刷新后重试。');
  navigate(url({view:'album',album:id},true));
}
const redraw=async()=>{await refresh();render();};
window.addEventListener('beforeunload',event=>{if(hasPhotoChanges()){event.preventDefault();event.returnValue='';}});
document.addEventListener('input',event=>captureCaption(event.target));
window.addEventListener("popstate", () => {
  dialogs.close();
  if (store.ready) render();
});
document.addEventListener(
  "error",
  (event) => {
    if (
      event.target instanceof HTMLImageElement &&
      event.target.parentElement?.classList.contains("picture")
    ) {
      event.target.hidden = true;
      const fallback =
        event.target.parentElement.querySelector(".picture-fallback");
      if (fallback) fallback.hidden = false;
    }
  },
  true,
);

async function updateStatus(id, status) {
  const v = findVersion(id);
  if (!v) throw new Error("版本已不存在。");
  await save(`/api/collection/${id}`, {
    status,
    quantity: status === "owned" ? Math.max(1, v.quantity) : v.quantity,
  });
  await refresh();
  render();
  toast("收藏状态已更新 ♡");
  return v.album.id;
}
document.addEventListener("click", async (event) => {
  if (event.target.closest('button[type="submit"]')) return;
  const link = event.target.closest("a[data-nav]");
  if (
    link &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    event.button === 0
  ) {
    event.preventDefault();
    const next = new URL(link.href);
    navigate(
      next.pathname + next.search,
      route().view !== next.searchParams.get("view"),
    );
    return;
  }
  const album = event.target.closest("[data-album]");
  const action = event.target.closest("[data-action]");
  try {
    if (album) {
      openAlbum(album.dataset.album);
      return;
    }
    if (!action) return;
    const { action: kind, id } = action.dataset;
    if (kind === "close-dialog") return dialogs.close();
    if(kind==='view-photo')return dialogs.viewPhoto(id);
    if(kind==='remove-photo-draft'){removeDraft(id);render();return;}
    if(kind==='delete-photo'){await deletePhoto(id,redraw);return;}
    if((/^(add|edit|delete|mark)-/.test(kind)||['backup','wish-album'].includes(kind))&&!store.can_edit)throw new Error('只有主人可以编辑，请使用主人账号登录。');
    if(kind==='edit-banner')return dialogs.editBanner();
    if (kind === "add-group") return dialogs.editGroup();
    if (kind === "edit-group") return dialogs.editGroup(id);
    if (kind === "add-album") {
      if (!store.groups.length) {
        toast("先添加一个团体，再录入专辑 ♡");
        return dialogs.editGroup();
      }
      return dialogs.editAlbum(null, id || route().group);
    }
    if (kind === "edit-album") return dialogs.editAlbum(id);
    if (kind === "wish-album") return openAlbum(id);
    if (kind === "add-version")
      return dialogs.editVersion(null, id, action.dataset.wish === "1");
    if (kind === "edit-version") return dialogs.editVersion(id);
    if (kind === "edit-profile") return dialogs.editProfile();
    if (kind === "backup") return dialogs.backup();
    if (kind === "reset-filters")
      return navigate(
        url(
          {
            view: route().view,
            group: route().view === "group" ? route().group : "",
          },
          true,
        ),
        false,
      );
    if (kind === "retry") {
      await refresh();
      return render();
    }
    if (kind === "install" && installPrompt) {
      await installPrompt.prompt();
      installPrompt = null;
      render();
      return;
    }
    if (kind === "mark-owned" || kind === "mark-wish") {
      action.disabled = true;
      const albumId = await updateStatus(
        id,
        kind === "mark-owned" ? "owned" : "wishlist",
      );
      if (document.querySelector("#editorDialog").open)
        openAlbum(albumId);
      return;
    }
    if (kind.startsWith("delete-")) {
      const entity = kind.slice(7),
        item =
          entity === "group"
            ? store.groups.find((g) => g.id === Number(id))
            : entity === "album"
              ? findAlbum(id)
              : findVersion(id);
      if (!item) throw new Error("记录已不存在。");
      if (
        !confirm(
          `确定删除「${item.name || item.version_name}」吗？${entity === "version" ? "对应收藏记录也会删除。" : "下属版本和收藏记录也会删除。"}请确认已备份。`,
        )
      )
        return;
      await request(
        `/api/${{ group: "groups", album: "albums", version: "versions" }[entity]}/${id}`,
        { method: "DELETE" },
      );
      await refresh();
      dialogs.close();
      if ((entity === "group" && route().group === String(id)) || (entity==='album'&&route().album===String(id)))
        navigate("/?view=gallery");
      else render();
      toast("记录已删除");
    }
  } catch (error) {
    toast(error.message);
    if (action?.isConnected) action.disabled = false;
  }
});
document.addEventListener("change", async (event) => {
  const input = event.target;
  if(input.matches('[data-photo-files]')) {
    try{if(!store.can_edit)throw new Error('只有主人可以上传照片。');choosePhotos(input,route().album);render();}catch(error){toast(error.message);input.value='';}
    return;
  }
  if (input.matches("[data-filter]"))
    navigate(url({ [input.name]: input.value, count: null }), false);
  if (input.matches("[data-version-status]")) {
    input.disabled = true;
    try {
      const id = await updateStatus(input.dataset.versionStatus, input.value);
      if(route().view!=='album')openAlbum(id);
    } catch (error) {
      toast(error.message);
      input.disabled = false;
    }
  }
});
document.addEventListener("submit", async (event) => {
  const form = event.target;
  event.preventDefault();
  if(form.matches('[data-photo-upload],[data-photo-caption]')){await savePhotos(form,redraw,toast).catch(error=>toast(error.message));return;}
  if (form.matches("[data-search]")) {
    navigate(url({ view: "gallery", q: new FormData(form).get("q") }, true));
    return;
  }
  if (!form.dataset.editor) return;
  if(!store.can_edit){toast('只有主人可以编辑。');return;}
  const kind = form.dataset.editor,
    data = new FormData(form),
    button = form.querySelector('button[type="submit"]'),
    errorBox = form.querySelector(".form-error");
  const text = (name) => String(data.get(name) || "").trim();
  button.disabled = true;
  errorBox.hidden = true;
  try {
    let albumId;
    if(kind==='banner') {
      const file=data.get('hero_file'),reset=data.get('reset_banner');
      if(reset&&file?.size)throw new Error('请选择上传新照片，或恢复默认，不要同时选择。');
      if(!reset&&!file?.size)throw new Error('请选择横幅照片。');
      await save('/api/profile',{hero_cover:reset?'':await upload(file)});
    } else if (kind === "group" || kind === "album") {
      const payload = Object.fromEntries(
        (kind === "group"
          ? ["name", "korean_name", "company", "debut_date"]
          : ["name", "korean_name", "release_date", "album_type", "notes"]
        ).map((k) => [k, text(k)]),
      );
      if (kind === "album" && !form.dataset.id)
        payload.group_id = Number(data.get("group_id"));
      const cover = await upload(data.get("cover_file"));
      if (cover) payload.cover = cover;
      const base = kind === "group" ? "/api/groups" : "/api/albums",
        id = form.dataset.id;
      const result = await save(
        id ? `${base}/${id}` : base,
        payload,
        id ? "PUT" : "POST",
      );
      if (kind === "album") albumId = result.id;
    } else if (kind === "version") {
      const quantity = Number(data.get("quantity"));
      if (!Number.isInteger(quantity) || quantity < 0)
        throw new Error("数量必须为非负整数。");
      const payload = {
        album_id: Number(data.get("album_id")),
        version_name: text("version_name"),
        edition_type: text("edition_type"),
        barcode: text("barcode"),
      };
      const cover = await upload(data.get("cover_file"));
      if (cover) payload.cover = cover;
      const id = form.dataset.id;
      const v = await save(
        id ? `/api/versions/${id}` : "/api/versions",
        payload,
        id ? "PUT" : "POST",
      );
      form.dataset.id = String(v.id);
      await save(`/api/collection/${v.id}`, {
        status: text("status"),
        quantity,
        opened: data.has("opened"),
        notes: text("notes"),
        purchase_channel: text("purchase_channel"),
        purchase_date: text("purchase_date"),
        purchase_price: text("purchase_price") || null,
        purchase_currency: text("purchase_currency"),
      });
      albumId = payload.album_id;
    } else if (kind === "profile") {
      const payload = {
        name: text("name"),
        bio: text("bio"),
        diary: text("diary"),
        favorite_group_ids: data.getAll("favorite_group_ids").map(Number),
      };
      const avatar = await upload(data.get("avatar_file")),
        hero = await upload(data.get("hero_file"));
      if (avatar) payload.avatar = avatar;
      if (hero) payload.hero_cover = hero;
      await save("/api/profile", payload);
    } else if (kind === "import-json" || kind === "import-db") {
      if (!confirm("恢复将替换当前收藏和个人资料。确认已有备份并继续恢复？"))
        return;
      const file = data.get("backup");
      if (kind === "import-json") {
        let snapshot;
        try {
          snapshot = JSON.parse(await file.text());
        } catch {
          throw new Error("JSON 文件格式无效。");
        }
        await save("/api/import", snapshot, "POST");
      } else {
        const body = new FormData();
        body.append("database", file);
        await request("/api/backup/database/restore", { method: "POST", body });
      }
    }
    await refresh();
    render();
    dialogs.close();
    if (albumId) openAlbum(albumId);
    toast(kind.startsWith("import") ? "收藏已恢复" : "已保存这份喜欢 ♡");
  } catch (error) {
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    button.disabled = false;
  }
});
document.querySelector("#editorDialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) {
    const r = event.currentTarget.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialogs.close();
  }
});
function syncNetwork() {
  document.querySelector("#networkBanner").hidden = navigator.onLine;
}
window.addEventListener("online", syncNetwork);
window.addEventListener("offline", syncNetwork);
syncNetwork();
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  if (store.ready) render();
});
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .register("/sw.js")
    .then((r) => r.update())
    .catch(console.warn);
if('serviceWorker' in navigator)navigator.serviceWorker.addEventListener('controllerchange',()=>{if(!hasPhotoChanges())location.reload();},{once:true});
refresh()
  .then(() => { render(); registerAgentTools({store,route,navigate,url,openAlbum}); })
  .catch((error) => {
    document.querySelector("#pageContent").innerHTML = empty(
      "日记暂时没有打开",
      "请检查网络和登录状态；本地运行时请确认服务已启动。",
      '<button data-action="retry" class="pink-button">重新连接</button>',
    );
    toast(error.message);
  });
