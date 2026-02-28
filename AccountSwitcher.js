function init() {
  $ui.register(function(ctx) {

    function loadAccounts() {
      try { return $storage.get("accounts") || {} } catch (e) { return {} }
    }

    function saveAccounts(accounts) {
      try { $storage.set("accounts", accounts) } catch (e) {}
    }

    function loadActiveKey() {
      try { return $storage.get("active") || "" } catch (e) { return "" }
    }

    function saveActiveKey(key) {
      try { $storage.set("active", key) } catch (e) {}
    }

    var tray = ctx.newTray({
      tooltipText: "AniList Accounts",
      iconUrl: "https://anilist.co/img/icons/android-chrome-512x512.png",
      withContent: true
    })

    var tokenInputRef = ctx.fieldRef()
    var nameInputRef  = ctx.fieldRef()
    var trayMode      = ctx.state("list")

    tray.render(function() {
      var accounts  = loadAccounts()
      var activeKey = loadActiveKey()
      var keys      = Object.keys(accounts)

      if (trayMode.get() === "add") {
        return tray.stack([
          tray.text("Your AniList username:"),
          tray.input({ fieldRef: nameInputRef }),
          tray.text("AniList access token:"),
          tray.input({ fieldRef: tokenInputRef }),
          tray.button({ label: "Save Account", onClick: "ama-save-token" }),
          tray.button({ label: "Cancel",        onClick: "ama-cancel-add" })
        ])
      }

      if (trayMode.get() === "delete") {
        if (keys.length === 0) {
          return tray.stack([
            tray.text("No accounts to delete."),
            tray.button({ label: "Back", onClick: "ama-cancel-add" })
          ])
        }
        var delItems = [ tray.text("Click an account to delete it:") ]
        for (var d = 0; d < keys.length; d++) {
          var dk = keys[d]
          var da = accounts[dk]
          delItems.push(tray.button({
            label: "Delete " + da.username,
            onClick: "ama-delete-" + dk
          }))
        }
        delItems.push(tray.button({ label: "Cancel", onClick: "ama-cancel-add" }))
        return tray.stack(delItems)
      }

      var items = []
      if (keys.length === 0) {
        items.push(tray.text("No accounts saved yet."))
      } else {
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i]
          var acc = accounts[key]
          items.push(tray.button({
            label: (key === activeKey ? "✓  " : "     ") + acc.username,
            onClick: "ama-switch-" + key
          }))
        }
        items.push(tray.text("────────────────────────────────────────"))
      }
      items.push(tray.button({ label: "Add Account",      onClick: "ama-open-add" }))
      if (keys.length > 0) {
        items.push(tray.button({ label: "Delete Account", onClick: "ama-open-delete" }))
      }
      return tray.stack(items)
    })

    tray.onOpen(function() {
      trayMode.set("list")
    })


    ctx.registerEventHandler("ama-open-add", function() {
      trayMode.set("add")
      tokenInputRef.setValue("")
      nameInputRef.setValue("")
    })

    ctx.registerEventHandler("ama-open-delete", function() {
      trayMode.set("delete")
    })

    ctx.registerEventHandler("ama-cancel-add", function() {
      trayMode.set("list")
    })

    ctx.registerEventHandler("ama-save-token", function() {
      var token = tokenInputRef.current
      var name  = nameInputRef.current
      if (!token || token.trim() === "") {
        ctx.toast.error("Please enter your access token.")
        return
      }
      if (!name || name.trim() === "") {
        ctx.toast.error("Please enter your AniList username.")
        return
      }
      var username = name.trim()
      var accounts = loadAccounts()
      var key = username.toLowerCase()
      accounts[key] = { username: username, token: token.trim() }
      saveAccounts(accounts)
      if (!loadActiveKey()) saveActiveKey(key)
      registerSwitchHandlers()
      registerDeleteHandlers()
      ctx.toast.success("Account saved: " + username)
      trayMode.set("list")
    })

    function registerSwitchHandlers() {
      var accounts = loadAccounts()
      var keys = Object.keys(accounts)
      for (var i = 0; i < keys.length; i++) {
        (function(key) {
          ctx.registerEventHandler("ama-switch-" + key, function() {
            var accs = loadAccounts()
            var acc  = accs[key]
            if (!acc) return
            $store.set("ama-login-request", JSON.stringify({
              key: key,
              username: acc.username,
              token: acc.token
            }))
            ctx.toast.info("Switching to " + acc.username + "...")
          })
        })(keys[i])
      }
    }

    function registerDeleteHandlers() {
      var accounts = loadAccounts()
      var keys = Object.keys(accounts)
      for (var i = 0; i < keys.length; i++) {
        (function(key) {
          ctx.registerEventHandler("ama-delete-" + key, function() {
            var accs = loadAccounts()
            var acc  = accs[key]
            if (!acc) return
            var username = acc.username
            delete accs[key]
            saveAccounts(accs)
            if (loadActiveKey() === key) saveActiveKey("")
            registerSwitchHandlers()
            registerDeleteHandlers()
            ctx.toast.success("Deleted: " + username)
            trayMode.set("list")
          })
        })(keys[i])
      }
    }

    registerSwitchHandlers()
    registerDeleteHandlers()

    ctx.dom.onReady(function() {
      $store.watch("ama-login-request", async function(value) {
        if (!value) return
        try {
          var req = JSON.parse(value)
        
          try {
            await fetch("http://127.0.0.1:43211/api/v1/auth/logout", {
              method: "POST",
              headers: { "Accept": "application/json" }
            })
          } catch (logoutErr) {
            console.warn("Logout failed or already logged out", logoutErr)
          }

          var res = await fetch("http://127.0.0.1:43211/api/v1/auth/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json"
            },
            body: JSON.stringify({ token: req.token })
          })

          if (res.ok) {
            $store.set("ama-login-result", JSON.stringify({ success: true, key: req.key, username: req.username }))
          } else {
            var errText = await res.text()
            $store.set("ama-login-result", JSON.stringify({ success: false, username: req.username, error: errText }))
          }
        } catch (e) {
          $store.set("ama-login-result", JSON.stringify({ success: false, username: "", error: String(e) }))
        }
      })
    })

    $store.watch("ama-login-result", function(value) {
      if (!value) return
      try {
        var result = JSON.parse(value)
        if (result.success) {
          saveActiveKey(result.key)
          ctx.toast.success("Logged in as " + result.username + "!")
          ctx.screen.reload()
        } else {
          ctx.toast.error("Failed to switch: " + (result.error || "unknown error"))
        }
        $store.set("ama-login-result", "")
      } catch (e) {}
    })

  })
}
