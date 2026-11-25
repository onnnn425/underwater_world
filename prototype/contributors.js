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
  panel.hidden = !user;
  list.replaceChildren();
  note.textContent = "";
  clearTimeout(panel.refreshTimer);
  if (!user) { document.querySelector("#metadata-editor").close(); panel.open = false; form.reset(); return; }
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
    document.querySelector("#metadata-title").textContent = "Edit " + video.title;
    form.elements.description.value = previous[0];
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
        const editButton = document.createElement("button");
        editButton.textContent = "Edit details";
        editButton.onclick = () => edit(video);
        row.append(editButton);
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
