const videos = [
  { title: "Clownfish Among Anemones", category: "Coral reefs", duration: "00:21", description: "An orange clownfish weaves through soft pink anemones, revealing the colour and shelter of its reef habitat.", tags: ["clownfish", "anemone", "coral", "reef"], streamKey: "clownFish", image: "https://d2du92h297hvfr.cloudfront.net/thumbnails/clown_fish/clown_fish_thumb.0000002.jpg" },
  { title: "Violet Reef Patrol", category: "Fish", duration: "00:28", description: "A vivid purple reef fish glides between coral formations in a close study of movement, colour and habitat.", tags: ["purple", "violet", "reef", "fish", "coral"], streamKey: "purpleFish", image: "https://d2du92h297hvfr.cloudfront.net/thumbnails/purple_fish/purple_fish_thumb.0000003.jpg" },
  { title: "Watcher on the Reef", category: "Fish", duration: "00:11", description: "A mottled red reef fish rests above the seafloor, watching its surroundings before moving across the coral.", tags: ["red", "mottled", "reef", "fish", "seafloor"], streamKey: "redFish", image: "https://d2du92h297hvfr.cloudfront.net/thumbnails/red_fish/red_fish_thumb.0000001.jpg" }
];

let category = "all";
let query = "";
const grid = document.querySelector("#video-grid");
const empty = document.querySelector("#empty-state");
const count = document.querySelector("#results-count");
const dialog = document.querySelector("#video-dialog");
const player = document.querySelector("#hls-player");
const playerStatus = document.querySelector("#player-status");
let hls;

function filteredVideos() {
  return videos.filter((video) => (category === "all" || video.category === category) && `${video.title} ${video.category} ${video.description} ${video.tags.join(" ")}`.toLowerCase().includes(query));
}

function renderVideos() {
  const shown = filteredVideos();
  count.textContent = `${shown.length} ${shown.length === 1 ? "film" : "films"}`;
  grid.innerHTML = shown.map((video) => {
    const index = videos.indexOf(video);
    const available = Boolean(video.streamKey && window.APP_CONFIG?.hlsStreams?.[video.streamKey]);
    const openAttributes = available ? `data-index="${index}"` : "disabled aria-disabled=\"true\"";
    const cardClass = available ? "video-card" : "video-card is-unavailable";
    const badge = available ? `<span class="duration">${video.duration}</span>` : `<span class="availability">Coming soon</span>`;
    const action = available ? `Watch now <span aria-hidden="true">↗</span>` : "Not yet streaming";
    return `<article class="${cardClass}"><button type="button" class="video-open" ${openAttributes}><img src="${video.image}" alt="${video.title}" loading="lazy" /><span class="card-number" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span><span class="play" aria-hidden="true">▶</span>${badge}</button><div class="card-copy"><div class="card-label"><p>${video.category}</p><span>${available ? "Streaming" : "Preview"}</span></div><h3>${video.title}</h3><p class="card-description">${video.description}</p><button type="button" class="text-link" ${openAttributes}>${action}</button></div></article>`;
  }).join("");
  empty.hidden = shown.length !== 0;
}

function openVideo(index) {
  const video = videos[index];
  document.querySelector("#dialog-media").style.backgroundImage = `linear-gradient(180deg, transparent 30%, rgba(2, 21, 34, .8)), url('${video.image}')`;
  document.querySelector("#dialog-category").textContent = video.category;
  document.querySelector("#dialog-title").textContent = video.title;
  document.querySelector("#dialog-description").textContent = video.description;
  document.querySelector("#dialog-duration").textContent = video.duration;
  player.poster = video.image;
  loadHlsStream(video);
  dialog.showModal();
}

function loadHlsStream(video) {
  const streamUrl = video.streamKey ? window.APP_CONFIG?.hlsStreams?.[video.streamKey] : "";
  if (!streamUrl) {
    player.hidden = true;
    playerStatus.textContent = "AWS stream not configured for this title yet.";
    return;
  }
  player.hidden = false;
  playerStatus.textContent = "Loading adaptive HLS stream through CloudFront…";
  if (hls) hls.destroy();
  if (player.canPlayType("application/vnd.apple.mpegurl")) {
    player.src = streamUrl;
    playerStatus.textContent = "Adaptive HLS stream ready.";
  } else if (window.Hls?.isSupported()) {
    hls = new Hls();
    hls.loadSource(streamUrl);
    hls.attachMedia(player);
    hls.on(Hls.Events.MANIFEST_PARSED, () => { playerStatus.textContent = "Adaptive HLS stream ready."; });
    hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) playerStatus.textContent = "The HLS stream could not be loaded. Confirm the CloudFront URL and S3 access policy."; });
  } else {
    player.hidden = true;
    playerStatus.textContent = "This browser does not support HLS playback.";
  }
}

document.querySelector("#search-input").addEventListener("input", (event) => { query = event.target.value.trim().toLowerCase(); renderVideos(); });
document.querySelectorAll(".filter").forEach((button) => button.addEventListener("click", () => { category = button.dataset.category; document.querySelectorAll(".filter").forEach((filter) => { const selected = filter === button; filter.classList.toggle("active", selected); filter.setAttribute("aria-pressed", String(selected)); }); renderVideos(); }));
document.addEventListener("click", (event) => { const target = event.target.closest("[data-index]"); if (target) openVideo(Number(target.dataset.index)); });
function cleanupPlayer() { player.pause(); if (hls) { hls.destroy(); hls = undefined; } player.removeAttribute("src"); player.removeAttribute("poster"); player.load(); playerStatus.textContent = ""; }
function closeDialog() { if (dialog.open) dialog.close(); }
document.querySelector(".dialog-close").addEventListener("click", closeDialog);
dialog.addEventListener("click", (event) => { if (event.target === dialog) closeDialog(); });
dialog.addEventListener("close", cleanupPlayer);
renderVideos();
