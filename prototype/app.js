const videos = [
  { title: "Clownfish Among Anemones", category: "Coral reefs", duration: "00:21", description: "An orange clownfish weaves through soft pink anemones, revealing the colour and shelter of its reef habitat.", tags: ["clownfish", "anemone", "coral", "reef"], streamKey: "clownFish", image: "https://d2du92h297hvfr.cloudfront.net/thumbnails/clown_fish/clown_fish_thumb.0000002.jpg" },
  { title: "Violet Reef Patrol", category: "Fish", duration: "00:28", description: "A vivid purple reef fish glides between coral formations in a close study of movement, colour and habitat.", tags: ["purple", "violet", "reef", "fish", "coral"], streamKey: "purpleFish", image: "https://d2du92h297hvfr.cloudfront.net/thumbnails/purple_fish/purple_fish_thumb.0000003.jpg" },
  { title: "Watcher on the Reef", category: "Fish", duration: "00:11", description: "A mottled red reef fish rests above the seafloor, watching its surroundings before moving across the coral.", tags: ["red", "mottled", "reef", "fish", "seafloor"], streamKey: "redFish", image: "https://d2du92h297hvfr.cloudfront.net/thumbnails/red_fish/red_fish_thumb.0000001.jpg" }
];

const architectureStages = {
  source: { stage: "Stage 01 · Store", title: "Private source storage", description: "Original administrator footage is stored privately and is never exposed directly to website visitors.", service: "Amazon S3", location: "ap-southeast-5" },
  convert: { stage: "Stage 02 · Transform", title: "Adaptive video conversion", description: "AWS Elemental MediaConvert creates separate 720p and 480p renditions so playback can adapt to the viewer’s connection.", service: "AWS Elemental MediaConvert", location: "ap-southeast-5" },
  output: { stage: "Stage 03 · Package", title: "HLS output storage", description: "The master playlist, rendition playlists and short video segments are stored in a separate private S3 bucket.", service: "Amazon S3", location: "ap-southeast-5" },
  deliver: { stage: "Stage 04 · Deliver", title: "Secure edge delivery", description: "Amazon CloudFront reads the private HLS objects through Origin Access Control and delivers them to viewers over HTTPS.", service: "Amazon CloudFront", location: "Global edge network" },
  browser: { stage: "Stage 05 · Play", title: "Adaptive browser playback", description: "HLS.js reads the master playlist and automatically changes rendition as network conditions change, while viewers can also select a quality manually.", service: "HLS.js video player", location: "Viewer’s browser" }
};

let category = "all";
let query = "";
let hls;
let revealObserver;
let statsTimer;
let activeVideoIndex = null;
let activeStreamUrl = "";
let streamState = "Loading";

const grid = document.querySelector("#video-grid");
const empty = document.querySelector("#empty-state");
const count = document.querySelector("#results-count");
const favouritesCount = document.querySelector("#favourites-count");
const dialog = document.querySelector("#video-dialog");
const player = document.querySelector("#hls-player");
const playerStatus = document.querySelector("#player-status");
const themeToggle = document.querySelector(".theme-toggle");
const qualityOptions = document.querySelector("#quality-options");
const dialogFavourite = document.querySelector("#dialog-favourite");
const statState = document.querySelector("#stat-state");
const statResolution = document.querySelector("#stat-resolution");
const statBandwidth = document.querySelector("#stat-bandwidth");
const statBuffer = document.querySelector("#stat-buffer");
const statDelivery = document.querySelector("#stat-delivery");

function loadFavourites() {
  try {
    const saved = JSON.parse(localStorage.getItem("blue-current-favourites") || "[]");
    return new Set(Array.isArray(saved) ? saved : []);
  } catch {
    return new Set();
  }
}

const favourites = loadFavourites();

function revealElements(elements) {
  const items = [...elements];
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    items.forEach((element) => element.classList.add("is-visible"));
    return;
  }
  items.forEach((element) => revealObserver?.observe(element));
}

function setupRevealAnimations() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
    revealElements(document.querySelectorAll(".reveal"));
    return;
  }
  revealObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: 0.12, rootMargin: "0px 0px -36px" });
  revealElements(document.querySelectorAll(".reveal"));
}

function setTheme(theme, persist = true) {
  const dark = theme === "dark";
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  themeToggle.setAttribute("aria-pressed", String(dark));
  themeToggle.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} theme`);
  themeToggle.querySelector(".theme-icon").textContent = dark ? "☀" : "☾";
  themeToggle.querySelector(".theme-label").textContent = dark ? "Light" : "Dark";
  if (persist) { try { localStorage.setItem("blue-current-theme", dark ? "dark" : "light"); } catch {} }
}

function filteredVideos() {
  return videos.filter((video) => {
    const matchesCategory = category === "all" || (category === "favourites" ? favourites.has(video.streamKey) : video.category === category);
    const searchable = `${video.title} ${video.category} ${video.description} ${video.tags.join(" ")}`.toLowerCase();
    return matchesCategory && searchable.includes(query);
  });
}

function updateFavouriteButton(button, video) {
  const saved = favourites.has(video.streamKey);
  button.classList.toggle("saved", saved);
  button.setAttribute("aria-pressed", String(saved));
  button.setAttribute("aria-label", `${saved ? "Remove" : "Add"} ${video.title} ${saved ? "from" : "to"} favourites`);
  button.innerHTML = `<span aria-hidden="true">${saved ? "♥" : "♡"}</span>${button === dialogFavourite ? ` ${saved ? "Saved" : "Save favourite"}` : ""}`;
}

function renderVideos() {
  const shown = filteredVideos();
  favouritesCount.textContent = String(favourites.size);
  count.textContent = `${shown.length} ${shown.length === 1 ? "film" : "films"}`;
  grid.innerHTML = shown.map((video, shownIndex) => {
    const index = videos.indexOf(video);
    const available = Boolean(video.streamKey && window.APP_CONFIG?.hlsStreams?.[video.streamKey]);
    const saved = favourites.has(video.streamKey);
    const openAttributes = available ? `data-index="${index}"` : "disabled aria-disabled=\"true\"";
    const cardClass = available ? "video-card" : "video-card is-unavailable";
    const badge = available ? `<span class="duration">${video.duration}</span>` : `<span class="availability">Coming soon</span>`;
    const action = available ? `Watch now <span aria-hidden="true">↗</span>` : "Not yet streaming";
    return `<article class="${cardClass} reveal" style="--reveal-delay: ${Math.min(shownIndex, 5) * 80}ms"><div class="card-media"><button type="button" class="video-open" ${openAttributes}><img src="${video.image}" alt="${video.title}" loading="lazy" /><span class="card-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><span class="play" aria-hidden="true">▶</span>${badge}</button><button type="button" class="favourite-button${saved ? " saved" : ""}" data-favourite-index="${index}" aria-label="${saved ? "Remove" : "Add"} ${video.title} ${saved ? "from" : "to"} favourites" aria-pressed="${saved}"><span aria-hidden="true">${saved ? "♥" : "♡"}</span></button></div><div class="card-copy"><div class="card-label"><p>${video.category}</p><span>${available ? "Streaming" : "Preview"}</span></div><h3>${video.title}</h3><p class="card-description">${video.description}</p><button type="button" class="text-link" ${openAttributes}>${action}</button></div></article>`;
  }).join("");
  empty.textContent = category === "favourites" ? "No favourites saved yet. Use the heart button on a film to build your watchlist." : "No videos match that search. Try another word or category.";
  empty.hidden = shown.length !== 0;
  revealElements(grid.querySelectorAll(".reveal"));
}

function persistFavourites() {
  try { localStorage.setItem("blue-current-favourites", JSON.stringify([...favourites])); } catch {}
}

function toggleFavourite(index) {
  const video = videos[index];
  if (!video) return;
  if (favourites.has(video.streamKey)) favourites.delete(video.streamKey);
  else favourites.add(video.streamKey);
  persistFavourites();
  renderVideos();
  if (activeVideoIndex === index) updateFavouriteButton(dialogFavourite, video);
}

function setStreamState(state) {
  streamState = state;
  statState.textContent = state;
}

function updateQualityButtons(selectedLevel) {
  qualityOptions.querySelectorAll(".quality-option").forEach((button) => {
    const selected = Number(button.dataset.level) === selectedLevel;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function renderQualityOptions(levels = [], nativePlayback = false) {
  const uniqueLevels = new Map();
  levels.forEach((level, index) => {
    if (!level.height) return;
    const existing = uniqueLevels.get(level.height);
    if (!existing || level.bitrate > existing.bitrate) uniqueLevels.set(level.height, { index, bitrate: level.bitrate });
  });
  const renditions = [...uniqueLevels.entries()].sort((a, b) => b[0] - a[0]);
  qualityOptions.innerHTML = `<button type="button" class="quality-option active" data-level="-1" aria-pressed="true"${nativePlayback ? " disabled" : ""}>Auto${nativePlayback ? " · Native" : ""}</button>${renditions.map(([height, details]) => `<button type="button" class="quality-option" data-level="${details.index}" aria-pressed="false">${height}p</button>`).join("")}`;
}

function refreshStats() {
  statState.textContent = streamState;
  statResolution.textContent = player.videoWidth && player.videoHeight ? `${player.videoWidth} × ${player.videoHeight}` : "—";
  statBandwidth.textContent = hls?.bandwidthEstimate ? `${(hls.bandwidthEstimate / 1_000_000).toFixed(2)} Mbps` : "Measuring…";
  let bufferedSeconds = 0;
  if (player.buffered.length) bufferedSeconds = Math.max(0, player.buffered.end(player.buffered.length - 1) - player.currentTime);
  statBuffer.textContent = `${bufferedSeconds.toFixed(1)} s`;
  let delivery = "CloudFront";
  try {
    const host = new URL(activeStreamUrl).hostname;
    delivery = host.endsWith("cloudfront.net") ? `CloudFront · ${player.readyState >= 2 ? "Connected" : "Connecting"}` : host;
  } catch {}
  statDelivery.textContent = delivery;
}

function startStats() {
  clearInterval(statsTimer);
  refreshStats();
  statsTimer = window.setInterval(refreshStats, 750);
}

function openVideo(index) {
  const video = videos[index];
  if (!video) return;
  activeVideoIndex = index;
  document.querySelector("#dialog-media").style.backgroundImage = `linear-gradient(180deg, transparent 30%, rgba(2, 21, 34, .8)), url('${video.image}')`;
  document.querySelector("#dialog-category").textContent = video.category;
  document.querySelector("#dialog-title").textContent = video.title;
  document.querySelector("#dialog-description").textContent = video.description;
  document.querySelector("#dialog-duration").textContent = video.duration;
  dialogFavourite.dataset.favouriteIndex = String(index);
  updateFavouriteButton(dialogFavourite, video);
  player.poster = video.image;
  loadHlsStream(video);
  dialog.showModal();
}

function loadHlsStream(video) {
  activeStreamUrl = video.streamKey ? window.APP_CONFIG?.hlsStreams?.[video.streamKey] || "" : "";
  renderQualityOptions();
  setStreamState("Loading");
  startStats();
  if (!activeStreamUrl) {
    player.hidden = true;
    setStreamState("Unavailable");
    playerStatus.textContent = "AWS stream not configured for this title yet.";
    return;
  }
  player.hidden = false;
  playerStatus.textContent = "Loading adaptive HLS stream through CloudFront…";
  if (hls) hls.destroy();
  if (player.canPlayType("application/vnd.apple.mpegurl")) {
    player.src = activeStreamUrl;
    renderQualityOptions([], true);
    setStreamState("Ready");
    playerStatus.textContent = "Adaptive HLS stream ready. Quality is managed by this browser.";
  } else if (window.Hls?.isSupported()) {
    hls = new Hls({ capLevelToPlayerSize: true });
    hls.loadSource(activeStreamUrl);
    hls.attachMedia(player);
    hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
      renderQualityOptions(data.levels || hls.levels);
      playerStatus.textContent = "Adaptive HLS stream ready.";
      setStreamState("Ready");
      refreshStats();
    });
    hls.on(Hls.Events.LEVEL_SWITCHED, () => {
      updateQualityButtons(hls.autoLevelEnabled ? -1 : hls.currentLevel);
      refreshStats();
    });
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data.fatal) return;
      setStreamState("Stream error");
      playerStatus.textContent = "The HLS stream could not be loaded. Confirm the CloudFront URL and S3 access policy.";
    });
  } else {
    player.hidden = true;
    setStreamState("Unsupported");
    playerStatus.textContent = "This browser does not support HLS playback.";
  }
}

function selectArchitectureStage(key) {
  const stage = architectureStages[key];
  if (!stage) return;
  document.querySelectorAll(".architecture-node").forEach((button) => {
    const selected = button.dataset.architecture === key;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  document.querySelector("#architecture-stage").textContent = stage.stage;
  document.querySelector("#architecture-title").textContent = stage.title;
  document.querySelector("#architecture-description").textContent = stage.description;
  document.querySelector("#architecture-meta").innerHTML = `<span>Service · ${stage.service}</span><span>Location · ${stage.location}</span>`;
}

document.querySelector("#search-input").addEventListener("input", (event) => { query = event.target.value.trim().toLowerCase(); renderVideos(); });
document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => {
  category = button.dataset.category;
  document.querySelectorAll(".filter").forEach((filter) => {
    const selected = filter === button;
    filter.classList.toggle("active", selected);
    filter.setAttribute("aria-pressed", String(selected));
  });
  renderVideos();
}));
document.querySelectorAll(".architecture-node").forEach((button) => button.addEventListener("click", () => selectArchitectureStage(button.dataset.architecture)));
qualityOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-level]");
  if (!button || !hls) return;
  const level = Number(button.dataset.level);
  hls.currentLevel = level;
  updateQualityButtons(level);
  playerStatus.textContent = level === -1 ? "Automatic adaptive quality enabled." : `${button.textContent} quality selected.`;
  refreshStats();
});
document.addEventListener("click", (event) => {
  const favouriteTarget = event.target.closest("[data-favourite-index]");
  if (favouriteTarget) {
    toggleFavourite(Number(favouriteTarget.dataset.favouriteIndex));
    return;
  }
  const target = event.target.closest("[data-index]");
  if (target) openVideo(Number(target.dataset.index));
});

player.addEventListener("playing", () => setStreamState("Playing"));
player.addEventListener("waiting", () => setStreamState("Buffering"));
player.addEventListener("pause", () => { if (!player.ended && player.currentTime > 0) setStreamState("Paused"); });
player.addEventListener("ended", () => setStreamState("Ended"));
player.addEventListener("loadedmetadata", refreshStats);

function cleanupPlayer() {
  clearInterval(statsTimer);
  player.pause();
  if (hls) { hls.destroy(); hls = undefined; }
  player.removeAttribute("src");
  player.removeAttribute("poster");
  player.load();
  playerStatus.textContent = "";
  activeStreamUrl = "";
  activeVideoIndex = null;
  renderQualityOptions();
}

function closeDialog() { if (dialog.open) dialog.close(); }

themeToggle.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
document.querySelector(".dialog-close").addEventListener("click", closeDialog);
dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });
dialog.addEventListener("close", cleanupPlayer);

setTheme(document.documentElement.dataset.theme || "light", false);
setupRevealAnimations();
renderVideos();
