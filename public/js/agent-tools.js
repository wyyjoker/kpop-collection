export function registerAgentTools({store, route, navigate, url, openAlbum}) {
  const context=document.modelContext;
  if(!context?.registerTool)return;
  const lifecycle=new AbortController();
  const tools=[{
    name:'read_collection_library',title:'查看收藏图鉴',description:'Read album and version summaries from the current collection. Does not change collection data.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},
    execute(input){if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length)throw new Error('Expected an empty object');if(!store.ready)throw new Error('Collection is still loading');return {albums:store.albums.map(a=>({id:a.id,name:a.name,group:a.group_name,versions:a.versions.map(v=>({id:v.id,name:v.version_name,status:v.status}))}))};}
  },{
    name:'navigate_collection_view',title:'打开收藏页面',description:'Navigate to an existing diary page; does not create or change collection records.',
    inputSchema:{type:'object',properties:{view:{type:'string',enum:['home','collection','gallery','wishlist','about']}},required:['view'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},
    execute(input){if(!input||Object.keys(input).some(k=>k!=='view')||!['home','collection','gallery','wishlist','about'].includes(input.view))throw new Error('Unknown diary view');if(!store.ready)throw new Error('Collection is still loading');navigate(url({view:input.view},true));return {view:route().view};}
  },{
    name:'open_album_details',title:'查看专辑详情',description:'Navigate to an album subpage with physical photos, descriptions, versions and tracklist. Does not upload or edit data.',
    inputSchema:{type:'object',properties:{albumId:{type:'integer',minimum:1}},required:['albumId'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:true},
    execute(input){if(!input||Object.keys(input).some(k=>k!=='albumId')||!Number.isSafeInteger(input.albumId))throw new Error('Invalid album ID');const album=store.albums.find(a=>a.id===input.albumId);if(!album)throw new Error('Album not found');openAlbum(album.id);return {albumId:album.id,name:album.name,opened:true};}
  }];
  for(const tool of tools)try{Promise.resolve(context.registerTool(tool,{signal:lifecycle.signal})).catch(console.warn);}catch(error){console.warn(error);}
  window.addEventListener('pagehide',event=>{if(!event.persisted)lifecycle.abort();},{once:true});
}
