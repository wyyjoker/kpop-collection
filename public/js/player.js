const audio =
  typeof Audio === "function"
    ? new Audio()
    : {
        paused: true,
        currentTime: 0,
        duration: 0,
        src: "",
        play: async () => {},
        pause: () => {},
        removeAttribute: () => {},
        addEventListener: () => {},
      };
if (typeof audio.preload === "string" || audio.preload === undefined) audio.preload = "metadata";

const state = {
  queue: [],
  index: -1,
  duration: 0,
  currentTime: 0,
  playing: false,
};

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds % 60);
  const m = Math.floor(seconds / 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function currentTrack() {
  return state.queue[state.index] || null;
}

function paint() {
  const track = currentTrack();
  const identity = document.querySelector("#musicBar .music-identity");
  if (identity) {
    identity.innerHTML = `
      <div class="picture">${track?.cover ? `<img src="${track.cover}" alt="">` : `<span class="picture-fallback">♫</span>`}</div>
      <span><b>${track?.title || "My Music Diary"}</b><small>${track?.subtitle || "Collecting Happiness"}</small></span>`;
  }
  const toggle = document.querySelector("[data-action='player-toggle']");
  if (toggle) {
    toggle.textContent = state.playing ? "❚❚" : "▶";
    toggle.setAttribute("aria-label", state.playing ? "暂停" : "播放");
  }
  const seek = document.querySelector("[data-player-seek]");
  if (seek) {
    seek.max = String(Math.max(1, Math.floor(state.duration || 0)));
    seek.value = String(Math.floor(state.currentTime || 0));
    seek.disabled = !track;
  }
  const time = document.querySelector("[data-player-time]");
  if (time) time.textContent = `${formatTime(state.currentTime)} / ${formatTime(state.duration)}`;
  document.body.classList.toggle("is-playing", state.playing);
  document.querySelectorAll("[data-play-audio]").forEach((button) => {
    const active = track && Number(button.dataset.playAudio) === track.id && state.playing;
    button.classList.toggle("is-playing", !!active);
    button.setAttribute("aria-label", active ? "暂停" : "播放");
    button.textContent = active ? "❚❚" : "▶";
  });
}

function loadCurrent(autoplay = true) {
  const track = currentTrack();
  if (!track) {
    audio.removeAttribute("src");
    state.playing = false;
    state.duration = 0;
    state.currentTime = 0;
    paint();
    return;
  }
  audio.src = track.src;
  if (autoplay) {
    audio.play().then(() => {
      state.playing = true;
      paint();
    }).catch(() => {
      state.playing = false;
      paint();
    });
  } else {
    paint();
  }
}

export function setQueue(list, index = 0, autoplay = true) {
  state.queue = Array.isArray(list) ? list.filter((item) => item?.src) : [];
  state.index = state.queue.length ? Math.min(Math.max(0, index), state.queue.length - 1) : -1;
  loadCurrent(autoplay);
}

export function playTrack(track, albumTracks = null) {
  const list = albumTracks?.length ? albumTracks : [track];
  const index = Math.max(0, list.findIndex((item) => item.id === track.id));
  setQueue(list, index, true);
}

export function toggle() {
  if (!currentTrack()) return;
  if (audio.paused) {
    audio.play().then(() => {
      state.playing = true;
      paint();
    }).catch(() => {});
  } else {
    audio.pause();
    state.playing = false;
    paint();
  }
}

export function next() {
  if (!state.queue.length) return;
  state.index = (state.index + 1) % state.queue.length;
  loadCurrent(true);
}

export function prev() {
  if (!state.queue.length) return;
  if (audio.currentTime > 3) {
    audio.currentTime = 0;
    return;
  }
  state.index = (state.index - 1 + state.queue.length) % state.queue.length;
  loadCurrent(true);
}

export function seekTo(seconds) {
  if (!currentTrack() || !Number.isFinite(seconds)) return;
  const clamped = Math.min(Math.max(0, seconds), state.duration || seconds);
  audio.currentTime = clamped;
  state.currentTime = clamped;
  paint();
}

audio.addEventListener("timeupdate", () => {
  state.currentTime = audio.currentTime || 0;
  const seek = document.querySelector("[data-player-seek]");
  if (seek && document.activeElement !== seek) seek.value = String(Math.floor(state.currentTime));
  const time = document.querySelector("[data-player-time]");
  if (time) time.textContent = `${formatTime(state.currentTime)} / ${formatTime(state.duration)}`;
});

audio.addEventListener("loadedmetadata", () => {
  state.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  paint();
});

audio.addEventListener("ended", () => next());
audio.addEventListener("play", () => {
  state.playing = true;
  paint();
});
audio.addEventListener("pause", () => {
  state.playing = false;
  paint();
});

export function playerTracksFromAlbum(album) {
  return (album?.audios || []).map((item) => ({
    id: item.id,
    src: item.src,
    title: item.title,
    note: item.note || "",
    albumId: album.id,
    albumName: album.name,
    group_name: album.group_name,
    cover: album.cover || "",
    subtitle: `${album.group_name || ""} · ${album.name || ""}`.replace(/^ · | · $/g, "") || "Local upload",
  }));
}

export function refreshPlayerUi() {
  paint();
}
