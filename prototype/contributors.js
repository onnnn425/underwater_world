function transferVideo(url, fields, reportProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) {
        reportProgress(Math.floor(100 * event.loaded / event.total));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("The upload was declined. Please try again."));
    };
    xhr.onerror = xhr.onabort = () => reject(new Error("The upload was interrupted. Please try again."));
    xhr.open("POST", url);
    xhr.send(fields);
  });
}

function showContributorTools(user) {
  const panel = document.querySelector("#my-videos");
  const list = document.querySelector("#owned-list");
  const form = document.querySelector("#upload-form");
  const note = document.querySelector("#upload-feedback");
  const hasRole = user?.profile?.["cognito:groups"]?.includes("Admins") === true;
  const admin = hasRole && location.hash === "#admin";
  const current = () => panel.session === session;
  const session = Symbol();
  panel.session = session;
  panel.ontoggle = null;
  document.querySelector("#metadata-editor").close();
  document.body.classList.toggle("admin-view", admin);
  document.querySelector("#admin-link").hidden = !hasRole;
  for (const id of ["admin-heading", "admin-filters", "admin-history"]) document.getElementById(id).hidden = !admin;
  document.querySelector("#history-items").replaceChildren();
  document.querySelector("#older-history").hidden = true;
  document.querySelector(".owned-heading").textContent = admin ? "All videos" : "Your uploads";
  list.setAttribute("aria-label", admin ? "All videos" : "Your uploads");
  if (admin) panel.open = true;
  panel.hidden = !user;
  list.replaceChildren();
  note.textContent = "";
  clearTimeout(panel.refreshTimer);
  if (!user) { document.querySelector("#metadata-editor").close(); panel.open = false; form.reset(); return; }
  const api = "https://yeqpkn3kgf.execute-api.ap-southeast-5.amazonaws.com";
  const url = api + (admin ? "/admin/videos" : "/my-videos");
  async function request(path = "", options = {}, base = url) {
    const response = await fetch(base + path, {
      ...options, cache: "no-store",
      headers: { Authorization: "Bearer " + user.access_token, ...options.headers }
    });
    const result = await response.json();
    if (!response.ok) throw new Error(response.status === 401 ? "Please sign in again." : result.message || "Request failed.");
    return result;
  }
  const picker = form.elements.existingCategory;
  const custom = form.elements.newCategory;
  function toggleCustom() {
    const active = picker.value === "new";
    document.querySelector("#new-category-label").hidden = !active;
    custom.disabled = !active;
    custom.required = active;
  }
  picker.onchange = toggleCustom;
  toggleCustom();
  function edit(video) {
    const dialog = document.querySelector("#metadata-editor");
    const form = document.querySelector("#metadata-form");
    const rows = document.querySelector("#category-rows");
    const add = document.querySelector("#add-category");
    const message = document.querySelector("#edit-message");
    const save = form.querySelector("[type=submit]");
    const previous = [video.description ?? "", video.category ?? "Uncategorised"];
    document.querySelector("#editing-video").textContent = video.title;
    form.elements.description.value = previous[0];
    const updateCount = () => {
      document.querySelector("#description-count").textContent = form.elements.description.value.length + " / 500";
    };
    form.elements.description.oninput = updateCount;
    updateCount();
    rows.replaceChildren();
    const existing = document.querySelector("#edit-category-picker");
    existing.replaceChildren(new Option("Choose a category", ""), ...Array.from(document.querySelector("#known-categories").options, option => new Option(option.value, option.value)));
    function addRow(name) {
      const row = document.createElement("div");
      const input = document.createElement("input");
      input.value = name;
      input.required = true;
      input.maxLength = 60;
      input.setAttribute("list", "known-categories");
      input.setAttribute("aria-label", "Category name");
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Remove";
      remove.onclick = () => { row.remove(); existing.disabled = add.disabled = false; };
      row.append(input, remove);
      rows.append(row);
      existing.disabled = add.disabled = rows.children.length >= 8;
      return input;
    }
    existing.disabled = add.disabled = false;
    existing.onchange = () => {
      const name = existing.value;
      existing.value = "";
      if (!name) return;
      const match = Array.from(rows.querySelectorAll("input")).find(input => input.value.trim().toLowerCase() === name.toLowerCase());
      (match || addRow(name)).focus();
    };
    if (previous[1] !== "Uncategorised") previous[1].split(",").forEach(name => addRow(name.trim()));
    add.onclick = () => addRow("").focus();
    document.querySelector("#cancel-edit").onclick = () => dialog.close();
    message.textContent = "";
    save.disabled = false;
    form.onsubmit = async event => {
      event.preventDefault();
      save.disabled = true;
      try {
        await request("/" + encodeURIComponent(video.videoId), {
          method:"PATCH", headers:{"Content-Type":"application/json"},
          body:JSON.stringify({description:form.elements.description.value, previous,
            categories:Array.from(rows.querySelectorAll("input"), input => input.value.trim())})
        });
        dialog.close();
        note.textContent = "Video details saved.";
        await Promise.all([refresh(), loadVideoCatalogue()]);
      } catch (e) { message.textContent = e.message; }
      finally { save.disabled = false; }
    };
    dialog.showModal();
  }
  let cached = [];
  let historyCursor;
  async function historyPage(append) {
    const history = document.querySelector("#history-items");
    const older = document.querySelector("#older-history");
    try {
      const path = append ? "?after=" + encodeURIComponent(historyCursor) : "";
      const page = await request(path, {}, api + "/admin/activity");
      if (!current()) return;
      if (!append) history.replaceChildren();
      for (const item of page.items) {
        const li = document.createElement("li");
        const verb = {POST:"Upload", PATCH:"Edit", DELETE:"Delete"}[item.action] || item.action;
        li.textContent = [new Date(item.at).toLocaleString(), verb, item.videoId, item.fields?.join(", "), item.outcome, "Admin " + item.actor].filter(Boolean).join(" · ");
        history.append(li);
      }
      if (!history.children.length) history.textContent = "No admin activity yet.";
      historyCursor = page.after;
      older.hidden = !historyCursor;
    } catch (error) { if (current()) note.textContent = error.message; }
  }
  if (admin) {
    document.querySelector("#refresh-history").onclick = () => historyPage(false);
    document.querySelector("#older-history").onclick = () => historyPage(true);
    document.querySelector("#admin-query").oninput = renderList;
    for (const id of ["admin-status", "admin-owner", "admin-category"]) {
      document.getElementById(id).onchange = renderList;
    }
  }
  let lastResult;
  let refreshVersion = 0;
  async function refresh() {
    const version = ++refreshVersion;
    clearTimeout(panel.refreshTimer);
    if (!panel.open || panel.hidden) return;
    try {
      let page = await request();
      const videos = [...page.videos];
      while (current() && admin && page.after) {
        page = await request("?after=" + encodeURIComponent(page.after));
        videos.push(...page.videos);
      }
      if (!current() || version !== refreshVersion || panel.hidden) return;
      cached = videos.sort((a,b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      const snapshot = JSON.stringify(cached);
      if (snapshot !== lastResult) {
        lastResult = snapshot;
        if (admin) {
          const updateFilter = (id, label, values) => {
            const select = document.getElementById(id);
            const selected = select.value;
            const unique = [...new Set(values.filter(Boolean))].sort();
            select.replaceChildren(new Option(label, ""), ...unique.map(value => new Option(value, value)));
            if (unique.includes(selected)) select.value = selected;
          };
          updateFilter("admin-owner", "All uploaders", cached.map(video => video.owner));
          updateFilter("admin-category", "All categories", cached.flatMap(video => (video.category || "Uncategorised").split(",").map(x => x.trim())));
        }
        renderList();
      }
    } catch (e) { if (current()) note.textContent = e.message; }
    if (current() && version === refreshVersion && panel.open && !panel.hidden) panel.refreshTimer = setTimeout(refresh, 8000);
  }
  function renderList() {
    const search = document.querySelector("#admin-query").value.trim().toLowerCase();
    const state = document.querySelector("#admin-status").value;
    const owner = document.getElementById("admin-owner").value;
    const category = document.getElementById("admin-category").value;
    const videos = admin ? cached.filter(v => (!state || state === v.status) &&
      (!owner || owner === v.owner) &&
      (!category || (v.category || "Uncategorised").split(",").some(name => name.trim() === category)) &&
      [v.title,v.videoId,v.owner,v.category].join(" ").toLowerCase().includes(search)) : cached;
    list.replaceChildren();
    if (!videos.length) list.textContent = cached.length ? "No matching videos." : "No videos yet.";
    for (const video of videos) {
      const row = document.createElement("li");
      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = video.title;
      const status = document.createElement("span");
      status.className = "owned-status";
      status.dataset.state = video.status;
      status.textContent = video.status.toLowerCase();
      info.append(title, status);
      if (admin) {
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "Video information";
        details.append(summary);
        const facts = document.createElement("dl");
        for (const [label, value] of Object.entries({
          Uploader: video.owner, Category: video.category, Description: video.description,
          Uploaded: video.createdAt && new Date(video.createdAt).toLocaleString(),
          Published: video.publishedAt && new Date(video.publishedAt).toLocaleString(),
          Updated: video.updatedAt && new Date(video.updatedAt).toLocaleString(),
          "Video ID": video.videoId, Duration: video.duration, "Processing job": video.mediaConvertJobId,
          "Playback URL": video.streamUrl, "Failure reason": video.errorMessage
        })) {
          if (!value) continue;
          const term = document.createElement("dt");
          term.textContent = label;
          const description = document.createElement("dd");
          description.textContent = value;
          facts.append(term, description);
        }
        details.append(facts);
        info.append(details);
      }
      const actions = document.createElement("div");
      actions.className = "owned-actions";
      row.append(info, actions);
      const editButton = document.createElement("button");
      editButton.textContent = "Edit details";
      editButton.onclick = () => edit(video);
      actions.append(editButton);
      if (["PUBLISHED", "FAILED"].includes(video.status)) {
        const remove = document.createElement("button");
        remove.textContent = "Delete";
        remove.onclick = async () => {
          if (!confirm('Delete “' + video.title + '”' + (admin ? " from " + video.owner : "") + ' and its streaming files?')) return;
          remove.disabled = true;
          try {
            await request("/" + encodeURIComponent(video.videoId), {method:"DELETE"});
            note.textContent = "Deletion requested.";
          } catch (e) { note.textContent = e.message; remove.disabled = false; }
        };
        actions.append(remove);
      }
      list.append(row);
    }
  }
  panel.ontoggle = refresh;
  if (panel.open) refresh();
  form.onsubmit = async event => {
    event.preventDefault();
    const file = form.elements.clip.files[0];
    if (!file || !/\.mp4$/i.test(file.name) || file.size < 16 || file.size > 100000000) {
      note.textContent = "Choose an MP4 up to 100 MB."; return;
    }
    const button = form.querySelector("button");
    button.disabled = true;
    const meter = document.querySelector("#upload-meter");
    const progress = document.querySelector("#upload-progress");
    const percent = document.querySelector("#upload-percent");
    progress.removeAttribute("value");
    percent.textContent = "";
    note.textContent = "Preparing upload…";
    try {
      const path = "?title=" + encodeURIComponent(form.elements.title.value.trim());
      const post = data => request(path, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(data)});
      const entered = picker.value === "new" ? custom.value.trim() : picker.value.slice(4);
      const known = Array.from(document.querySelector("#known-categories").options, o => o.value);
      const category = known.find(name => name.toLowerCase() === entered.toLowerCase()) ?? entered;
      if (category.includes(",") || (picker.value === "new" && !category)) throw new Error("Enter one category name without commas.");
      const {upload, uploadId} = await post({size:file.size, category});
      const fields = new FormData();
      for (const [name, value] of Object.entries(upload.fields)) fields.append(name, value);
      fields.append("file", file);
      meter.hidden = false;
      note.textContent = "Uploading " + file.name + "…";
      await transferVideo(upload.url, fields, value => {
        progress.value = value;
        percent.textContent = value + "%";
      });
      meter.hidden = true;
      note.textContent = "Checking video…";
      await post({uploadId, category});
      form.reset();
      toggleCustom();
      note.textContent = "Upload received. Your video will appear here as processing starts.";
      await refresh();
    } catch (e) { note.textContent = e.message; }
    finally { meter.hidden = true; button.disabled = false; }
  };
}
