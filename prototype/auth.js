(async function () {
  const button = document.querySelector("#account");
  const status = document.querySelector("#account-status");
  function announce(message) {
    status.textContent = message;
    status.hidden = !message;
  }

  const { authority, clientId, domain } = window.AUTH_CONFIG;
  if (!authority || !clientId || !domain) {
    button.onclick = () => announce("Registration is not available yet. You can still browse and watch videos.");
    return;
  }
  const home = new URL("./", location.href).href;
  const manager = new oidc.UserManager({
    authority, client_id: clientId, redirect_uri: home,
    response_type: "code", scope: "openid email",
    automaticSilentRenew: false,
    userStore: new oidc.WebStorageStateStore({ store: sessionStorage })
  });
  let user;
  function render() {
    showContributorTools(user);
    button.textContent = user ? "Sign out" : "Sign in / Register";
    announce(user ? "Signed in as " + user.profile.email : "");
  }
  let onAdminPage = location.hash === "#admin";
  window.addEventListener("hashchange", () => {
    const next = location.hash === "#admin";
    if (next !== onAdminPage) { onAdminPage = next; render(); }
  });
  button.disabled = true;
  try {
    const query = new URLSearchParams(location.search);
    if (query.has("code") || query.has("error")) {
      try { await manager.signinRedirectCallback(); }
      finally { history.replaceState(null, "", home); }
    }
    user = await manager.getUser();
    if (user?.expired) { await manager.removeUser(); user = null; }
    render();
  } catch {
    announce("Sign-in could not be completed. Please try again.");
  }
  manager.events.addAccessTokenExpired(async () => {
    await manager.removeUser();
    user = null;
    render();
    announce("Your session has expired. Please sign in again.");
  });
  button.disabled = false;
  button.onclick = async () => {
    button.disabled = true;
    try {
      if (user) {
        await manager.removeUser();
        const logout = new URL("/logout", domain);
        logout.search = new URLSearchParams({ client_id: clientId, logout_uri: home });
        location.assign(logout.href);
      } else {
        await manager.signinRedirect();
      }
    } catch {
      button.disabled = false;
      announce("We could not reach the sign-in service. Please try again.");
    }
  };
})();
