function showContributorTools(user) {
  const panel = document.querySelector("#my-videos");
  const list = document.querySelector("#owned-list");
  const form = document.querySelector("#upload-form");
  const note = document.querySelector("#upload-feedback");
  panel.hidden = !user;
  list.replaceChildren();
  note.textContent = "";
  clearTimeout(panel.refreshTimer);
  if (!user) { panel.open = false; form.reset(); return; }
  const url = "https://yeqpkn3kgf.execute-api.ap-southeast-5.amazonaws.com/my-videos";
  async function request(path = "", options = {}) {
    const response = await fetch(url + path, {
      ...options, cache: "no-store",
      headers: { Authorization: "Bearer " + user.access_token, ...options.headers }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(response.status === 401 ? "Please sign in again." : result.message || "Request failed.");
    return result;
  }
  async function refresh() {
    clearTimeout(panel.refreshTimer);
    if (!panel.open || panel.hidden) return;
    try {
      const {videos} = await request();
      if (panel.hidden) return;
      list.replaceChildren();
      if (!videos.length) list.textContent = "No videos yet.";
      for (const video of videos) {
        const row = document.createElement("li");
        row.append(video.title + " · " + video.status.toLowerCase() + " ");
        if (["PUBLISHED", "FAILED"].includes(video.status)) {
          const remove = document.createElement("button");
          remove.textContent = "Delete";
          remove.onclick = async () => {
            if (!confirm('Delete “' + video.title + '” and its streaming files?')) return;
            remove.disabled = true;
            try {
              await request("/" + encodeURIComponent(video.videoId), {method:"DELETE"});
              note.textContent = "Deletion requested.";
            } catch (e) { note.textContent = e.message; remove.disabled = false; }
          };
          row.append(remove);
        }
        list.append(row);
      }
    } catch (e) { note.textContent = e.message; }
    if (panel.open && !panel.hidden) panel.refreshTimer = setTimeout(refresh, 8000);
  }
  panel.ontoggle = refresh;
  form.onsubmit = async event => {
    event.preventDefault();
    const file = form.elements.clip.files[0];
    if (!file || !/\.mp4$/i.test(file.name) || file.size > 4194304) {
      note.textContent = "Choose an MP4 up to 4 MiB."; return;
    }
    const button = form.querySelector("button");
    button.disabled = true;
    note.textContent = "Uploading…";
    try {
      await request("?title=" + encodeURIComponent(form.elements.title.value.trim()), {
        method:"POST", headers:{"Content-Type":"video/mp4"}, body:file
      });
      form.reset();
      note.textContent = "Upload received. Your video will appear here as processing starts.";
      await refresh();
    } catch (e) { note.textContent = e.message; }
    finally { button.disabled = false; }
  };
}
