import { store } from './store.js';
import { e, image, empty, heading } from './components.js';
import { save, upload, request } from './api.js';

const drafts = new Map(), captions = new Map();
let busy=false;
export const hasPhotoChanges=()=>drafts.size>0||captions.size>0;
export function leavePhotos() {
  if(busy)return false;
  if(hasPhotoChanges()&&!confirm('照片或文字还没有保存，确定离开吗？'))return false;
  for(const draft of drafts.values())URL.revokeObjectURL(draft.preview);
  drafts.clear();captions.clear();return true;
}
export function photoSection(album) {
  const photos=album.photos||[];
  return `<section class="paper physical-album" id="physicalPhotos">${heading('我的实物相册',`${photos.length} 张照片 · 把拆封、细节和收藏的故事留在这里`)}
  ${store.can_edit?`<form data-photo-upload data-album-id="${album.id}" class="photo-upload-form"><label class="photo-picker">＋ 添加实物照片<input type="file" name="photos" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" multiple data-photo-files></label><p class="form-hint">可以一次选择多张。每张最多 8 MB，一次最多 20 张；上传后会公开展示，请勿包含地址等私人信息。</p><div class="photo-drafts">${[...drafts].filter(([,d])=>d.albumId===album.id).map(([key,d],i)=>`<article class="photo-draft"><img src="${e(d.preview)}" alt="待上传照片 ${i+1}"><label>照片 ${i+1} 的描述<textarea rows="3" maxlength="2000" data-draft-caption="${key}" placeholder="例如：刚拆封的专辑、喜欢的小卡、包装细节…">${e(d.caption)}</textarea></label><button type="button" class="text-link" data-action="remove-photo-draft" data-id="${key}">移除这张</button></article>`).join('')}</div><p class="form-error" role="alert" hidden></p><p class="photo-progress" role="status"></p><button class="pink-button" type="submit" ${drafts.size?'':'hidden'}>上传并保存这些照片</button></form>`:''}
  ${photos.length?`<div class="physical-photo-grid">${photos.map((p,i)=>`<article class="physical-photo"><button class="photo-full" data-action="view-photo" data-id="${p.id}" aria-label="查看实物照片 ${i+1}">${image(p.src, p.caption||`${album.name} 实物照片 ${i+1}`)}</button>${store.can_edit?`<form data-photo-caption data-id="${p.id}"><label>照片描述<textarea rows="3" maxlength="2000" data-saved-caption="${p.id}" placeholder="写下这张照片的故事…">${e(captions.get(p.id)??p.caption)}</textarea></label><p class="form-error" role="alert" hidden></p><div class="photo-actions"><button class="soft-button" type="submit">保存描述</button><button class="danger-button" type="button" data-action="delete-photo" data-id="${p.id}">删除照片</button></div></form>`:`<p class="photo-caption">${e(p.caption||'')}</p>`}</article>`).join('')}</div>`:empty('还没有实物照片',store.can_edit?'选择照片，为这张专辑留下第一段收藏记录。':'主人还没有上传这张专辑的实物照片。')}
  </section>`;
}
export function captureCaption(input) {
  if(input.dataset.draftCaption){const d=drafts.get(input.dataset.draftCaption);if(d)d.caption=input.value;}
  if(input.dataset.savedCaption){const id=Number(input.dataset.savedCaption);const photo=store.albums.flatMap(a=>a.photos||[]).find(p=>p.id===id);if(input.value===(photo?.caption??''))captions.delete(id);else captions.set(id,input.value);}
}
export function choosePhotos(input,albumId) {
  if(busy)throw new Error('正在上传，请稍候。');
  const files=[...input.files];
  if(drafts.size+files.length>20)throw new Error('一次最多选择 20 张照片。');
  if(files.some(f=>f.size===0||f.size>8*1024*1024||!/^image\/(png|jpeg|webp|gif|avif)$/.test(f.type)))throw new Error('请选择不超过 8 MB 的 PNG、JPEG、WebP、GIF 或 AVIF 照片。');
  for(const file of files)drafts.set(crypto.randomUUID(),{file,albumId:Number(albumId),caption:'',preview:URL.createObjectURL(file)});
}
export function removeDraft(key){if(busy)return;const d=drafts.get(key);if(d)URL.revokeObjectURL(d.preview);drafts.delete(key);}
export async function savePhotos(form,redraw,toast) {
  if(!store.can_edit)throw new Error('只有主人可以编辑。');
  if(busy)return;
  busy=true;const controls=[...form.querySelectorAll('input,textarea,button')].filter(el=>!el.disabled),errorBox=form.querySelector('.form-error');controls.forEach(el=>el.disabled=true);errorBox.hidden=true;
  try {
    if(form.matches('[data-photo-caption]')) {
      const id=Number(form.dataset.id),caption=form.querySelector('textarea').value;
      await save(`/api/photos/${id}`,{caption});captions.delete(id);
      await redraw();toast('照片描述已保存');
    } else {
      const batch=[...drafts].filter(([,d])=>d.albumId===Number(form.dataset.albumId));
      if(!batch.length)throw new Error('请先选择照片。');
      for(let i=0;i<batch.length;i++) {
        const [key,d]=batch[i];form.querySelector('.photo-progress').textContent=`正在保存 ${i+1} / ${batch.length} 张…`;
        // Retain an uploaded path on retry; the server de-duplicates the same album/source.
        d.src ||= await upload(d.file);
        await save(`/api/albums/${d.albumId}/photos`,{src:d.src,caption:d.caption},'POST');
        URL.revokeObjectURL(d.preview);drafts.delete(key);
      }
      await redraw();toast('实物照片和描述已保存');
    }
  } catch(error) {
    if(form.matches('[data-photo-upload]')) {await redraw().catch(()=>{});const next=document.querySelector('[data-photo-upload] .form-error');if(next){next.textContent=`${error.message} 已保存的照片不会重复，未完成的照片和文字已保留，可重试。`;next.hidden=false;}}
    else {errorBox.textContent=error.message;errorBox.hidden=false;}
  } finally {busy=false;controls.forEach(el=>{if(el.isConnected)el.disabled=false;});}
}
export async function deletePhoto(id,redraw) {
  if(!store.can_edit||busy)return;
  if(!confirm('确定从实物相册中删除这张照片和描述？建议先备份。'))return;
  await request(`/api/photos/${id}`,{method:'DELETE'});captions.delete(Number(id));await redraw();
}
