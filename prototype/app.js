const videos = [
  { title: "Gardens of the Reef", category: "Coral reefs", duration: "00:21", description: "A slow journey through vibrant coral structures and their resident fish.", tags: ["coral", "reef", "fish"], streamKey: "clownFish", image: "https://images.unsplash.com/photo-1546026423-cc4642628d2b?auto=format&fit=crop&w=1200&q=80" },
  { title: "Into the Blue", category: "Deep sea", duration: "06:12", description: "Follow the descent as sunlight fades and the open ocean changes character.", tags: ["deep", "ocean", "dive"], image: "https://images.unsplash.com/photo-1530053969600-caed2596d242?auto=format&fit=crop&w=1200&q=80" },
  { title: "Gentle Giants", category: "Marine mammals", duration: "05:41", description: "An introduction to the movement and behaviour of ocean mammals.", tags: ["whale", "mammal", "conservation"], image: "https://images.unsplash.com/photo-1568430462989-44163eb1752f?auto=format&fit=crop&w=1200&q=80" },
  { title: "A School in Motion", category: "Fish", duration: "00:28", description: "Observe how a large school of fish moves as one coordinated group.", tags: ["fish", "school", "movement"], streamKey: "purpleFish", image: "https://images.unsplash.com/photo-1544550285-f813152fb2fd?auto=format&fit=crop&w=1200&q=80" },
  { title: "Reef at Night", category: "Coral reefs", duration: "00:11", description: "A night-time reef reveals creatures and patterns hidden during daylight.", tags: ["coral", "night", "reef"], streamKey: "redFish", image: "https://images.unsplash.com/photo-1518467166778-b88f373ffec7?auto=format&fit=crop&w=1200&q=80" },
  { title: "Beyond the Sunlight Zone", category: "Deep sea", duration: "08:23", description: "Discover the unusual adaptations that support life far below the surface.", tags: ["deep", "sea", "marine"], image: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?auto=format&fit=crop&w=1200&q=80" }
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
    const action = available ? `View film <span aria-hidden="true">↗</span>` : "Coming soon";
    return `<article class="${cardClass}"><button type="button" class="video-open" ${openAttributes}><img src="${video.image}" alt="${video.title}" loading="lazy" /><span class="play" aria-hidden="true">▶</span>${badge}</button><div class="card-copy"><p>${video.category}</p><h3>${video.title}</h3><button type="button" class="text-link" ${openAttributes}>${action}</button></div></article>`;
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
