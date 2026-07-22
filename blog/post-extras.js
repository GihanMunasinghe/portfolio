/* Shared post features: share bar, analytics beacon, comments (giscus).
 * Configuration lives in /site-config.json — editable from the admin panel. */
(function () {
  var url = location.href.split("#")[0];
  var title = document.title.replace(/ — Gihan Munasinghe$/, "");
  var eUrl = encodeURIComponent(url);
  var eTitle = encodeURIComponent(title);
  var slug = location.pathname.split("/").pop().replace(/\.html$/, "");

  /* ---- share bar (config-independent) ---- */
  var share = document.getElementById("share");
  if (share) {
    share.innerHTML =
      '<h3>Enjoyed this? Share it</h3>' +
      '<div class="share-btns">' +
      '<a href="https://www.linkedin.com/sharing/share-offsite/?url=' + eUrl + '" target="_blank" rel="noopener">in&nbsp;LinkedIn</a>' +
      '<a href="https://twitter.com/intent/tweet?url=' + eUrl + '&text=' + eTitle + '" target="_blank" rel="noopener">𝕏&nbsp;Post</a>' +
      '<a href="https://www.facebook.com/sharer/sharer.php?u=' + eUrl + '" target="_blank" rel="noopener">f&nbsp;Facebook</a>' +
      '<a href="https://wa.me/?text=' + eTitle + '%20' + eUrl + '" target="_blank" rel="noopener">🟢&nbsp;WhatsApp</a>' +
      '<button type="button" id="copy-link">🔗&nbsp;Copy link</button>' +
      "</div>";
    var copyBtn = document.getElementById("copy-link");
    copyBtn.addEventListener("click", function () {
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
        .then(function () { copyBtn.textContent = "✓ Copied!"; })
        .catch(function () { prompt("Copy this link:", url); });
      setTimeout(function () { copyBtn.innerHTML = "🔗&nbsp;Copy link"; }, 2000);
    });
  }

  /* ---- config-driven features ---- */
  Promise.all([
    fetch("../site-config.json?t=" + Date.now()).then(function (r) { return r.json(); }).catch(function () { return {}; }),
    fetch("posts.json?t=" + Date.now()).then(function (r) { return r.json(); }).catch(function () { return null; }),
  ]).then(function (res) {
    var cfg = res[0] || {};
    var posts = res[1];

    /* analytics beacon (GoatCounter) */
    if (cfg.goatcounter) {
      var gc = document.createElement("script");
      gc.async = true;
      gc.src = "https://gc.zgo.at/count.js";
      gc.setAttribute("data-goatcounter", "https://" + cfg.goatcounter + ".goatcounter.com/count");
      document.body.appendChild(gc);
    }

    /* comments */
    var comments = document.getElementById("comments");
    if (!comments) return;
    var entry = posts ? posts.find(function (p) { return p.slug === slug; }) : undefined;
    var note = function (msg) {
      comments.innerHTML = '<p style="color:#98a1b3; font-size:0.92rem;">' + msg + "</p>";
    };
    if (posts && !entry) {
      note("💬 Comments open once this post is published.");
    } else if (entry && entry.comments === false) {
      note("💬 Comments are turned off for this post.");
    } else if (cfg.giscus && cfg.giscus.categoryId) {
      var s = document.createElement("script");
      s.src = "https://giscus.app/client.js";
      s.async = true;
      s.crossOrigin = "anonymous";
      s.setAttribute("data-repo", cfg.giscus.repo);
      s.setAttribute("data-repo-id", cfg.giscus.repoId);
      s.setAttribute("data-category", cfg.giscus.category);
      s.setAttribute("data-category-id", cfg.giscus.categoryId);
      s.setAttribute("data-mapping", "pathname");
      s.setAttribute("data-strict", "0");
      s.setAttribute("data-reactions-enabled", "1");
      s.setAttribute("data-emit-metadata", "0");
      s.setAttribute("data-input-position", "top");
      s.setAttribute("data-theme", "transparent_dark");
      s.setAttribute("data-lang", "en");
      s.setAttribute("data-loading", "lazy");
      comments.appendChild(s);
    } else {
      note("💬 Comments and reactions are launching soon.");
    }
  });
})();
