import { request, save, uploadAudio } from "./api.js";
import { store } from "./store.js";
import { empty, heading, icon, e } from "./components.js";
import { playTrack, playerTracksFromAlbum, refreshPlayerUi } from "./player.js";

export function audioSection(album) {
  const audios = album.audios || [];
  return `<section class="paper album-audio" id="albumAudio">
    ${heading("本地音频", `${audios.length} 段 · 上传后可在底部播放器真实播放`)}
    ${store.can_edit ? `<form data-audio-upload data-album-id="${album.id}" class="audio-upload-form">
      <label class="audio-picker">＋ 添加本地音频
        <input type="file" name="audios" accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac,.aac" multiple data-audio-files>
      </label>
      <p class="form-hint">支持 MP3 / M4A / WAV / OGG / FLAC 等，每段最多 20 MB。文件保存在本机上传目录（云端为对象存储）。</p>
      <div class="audio-drafts">${[...audioDrafts.values()].filter(([, d]) => d.albumId === album.id).map(([key, d], i) => `
        <article class="audio-draft">
          <div class="audio-draft-meta"><b>音频 ${i + 1}</b><small>${e(d.file.name)}</small></div>
          <label>曲目名称<input maxlength="200" required value="${e(d.title)}" data-draft-title="${key}" placeholder="例如：Title Track"></label>
          <label>备注<textarea rows="2" maxlength="2000" data-draft-note="${key}" placeholder="可选">${e(d.note)}</textarea></label>
          <button type="button" class="text-link" data-action="remove-audio-draft" data-id="${key}">移除</button>
        </article>`).join("")}</div>
      <p class="form-error" role="alert" hidden></p>
      <p class="audio-progress" role="status"></p>
      <button class="pink-button" type="submit" ${audioDrafts.size ? "" : "hidden"}>保存这些音频</button>
    </form>` : ""}
    ${audios.length ? `<ul class="audio-list">${audios.map((item) => `
      <li class="audio-item" data-audio-id="${item.id}">
        <button type="button" class="audio-play" data-action="play-audio" data-play-audio="${item.id}" data-id="${item.id}" data-album="${album.id}" aria-label="播放">${icon("music")}</button>
        <div class="audio-copy">
          <b>${e(item.title)}</b>
          ${item.note ? `<p class="preserve-lines">${e(item.note)}</p>` : ""}
        </div>
        ${store.can_edit ? `<div class="audio-actions">
          <button type="button" class="soft-button" data-action="edit-audio" data-id="${item.id}">编辑</button>
          <button type="button" class="danger-button" data-action="delete-audio" data-id="${item.id}">删除</button>
        </div>` : ""}
      </li>`).join("")}</ul>` : empty("还没有本地音频", store.can_edit ? "上传一段喜欢的歌或现场音，让收藏日记会发声。" : "主人还没有为这张专辑上传本地音频。")}
  </section>`;
}

const audioDrafts = new Map();

function albumAudios(albumId) {
  return store.albums.find((a) => a.id === Number(albumId))?.audios || [];
}

export function chooseAudios(input, albumId) {
  if (!store.can_edit) throw new Error("只有主人可以上传音频。");
  const files = [...(input.files || [])];
  if (!files.length) return;
  if (files.length > 10) throw new Error("一次最多选择 10 段音频。");
  for (const file of files) {
    if (file.size > 20 * 1024 * 1024) throw new Error(`「${file.name}」超过 20 MB。`);
    const base = file.name.replace(/\.[^.]+$/, "").slice(0, 200) || "Untitled";
    audioDrafts.set(crypto.randomUUID(), {
      file,
      albumId: Number(albumId),
      title: base,
      note: "",
      src: "",
    });
  }
  input.value = "";
}

export function removeAudioDraft(id) {
  audioDrafts.delete(id);
}

export function captureAudioDraft(input) {
  const key = input.dataset.draftTitle || input.dataset.draftNote;
  if (!key) return;
  const draft = audioDrafts.get(key);
  if (!draft) return;
  if (input.dataset.draftTitle !== undefined) draft.title = input.value;
  if (input.dataset.draftNote !== undefined) draft.note = input.value;
}

export async function saveAudios(form, redraw, toast) {
  const albumId = Number(form.dataset.albumId);
  const batch = [...audioDrafts.entries()].filter(([, d]) => d.albumId === albumId);
  if (!batch.length) return;
  const progress = form.querySelector(".audio-progress");
  try {
    for (let i = 0; i < batch.length; i++) {
      const [key, d] = batch[i];
      if (progress) progress.textContent = `正在保存 ${i + 1} / ${batch.length} 段…`;
      d.src ||= await uploadAudio(d.file);
      await save(`/api/albums/${albumId}/audios`, {
        src: d.src,
        title: d.title.trim() || d.file.name,
        note: d.note.trim(),
      }, "POST");
      audioDrafts.delete(key);
    }
    if (progress) progress.textContent = "";
    await redraw();
    toast("本地音频已保存 ♡");
    refreshPlayerUi();
  } catch (error) {
    const box = form.querySelector(".form-error");
    if (box) {
      box.textContent = `${error.message} 已保存的不会重复，未完成的已保留，可重试。`;
      box.hidden = false;
    }
    if (progress) progress.textContent = "";
    throw error;
  }
}

export function findAudio(id) {
  return store.albums.flatMap((a) => (a.audios || []).map((item) => ({ ...item, album: a })))
    .find((item) => item.id === Number(id));
}

export function playAudioById(id) {
  const found = findAudio(id);
  if (!found) throw new Error("音频已不存在。");
  const list = playerTracksFromAlbum(found.album);
  playTrack(list.find((t) => t.id === found.id) || playerTracksFromAlbum({ ...found.album, audios: [found] })[0], list);
}

export async function deleteAudio(id, redraw) {
  await request(`/api/audios/${id}`, { method: "DELETE" });
  await redraw();
  refreshPlayerUi();
}

export async function updateAudio(id, payload) {
  return save(`/api/audios/${id}`, payload);
}

export function audioDraftCount() {
  return audioDrafts.size;
}

export function hasAudioDrafts() {
  return audioDrafts.size > 0;
}

