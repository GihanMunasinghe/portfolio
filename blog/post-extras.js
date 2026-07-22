/* Shared post features: share bar + comments (giscus).
 * Included by every blog post via <script src="post-extras.js"></script>. */
(function () {
  var url = location.href.split("#")[0];
  var title = document.title.replace(/ — Gihan Munasinghe$/, "");
  var eUrl = encodeURIComponent(url);
  var eTitle = encodeURIComponent(title);

  /* ---- share bar ---- */
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

  /* ---- comments & reactions (giscus, backed by GitHub Discussions) ----
   * To activate: enable Discussions on the repo, install the giscus app
   * (https://github.com/apps/giscus), then fill category + categoryId below
   * (both shown at https://giscus.app after selecting the repo). */
  var GISCUS = {
    repo: "GihanMunasinghe/portfolio",
    repoId: "R_kgDOSsy7zw",
    category: "",     // e.g. "Blog comments"
    categoryId: ""    // e.g. "DIC_kwDOSsy7z84C..."
  };
  var comments = document.getElementById("comments");
  if (comments) {
    if (GISCUS.categoryId) {
      var s = document.createElement("script");
      s.src = "https://giscus.app/client.js";
      s.async = true;
      s.crossOrigin = "anonymous";
      s.setAttribute("data-repo", GISCUS.repo);
      s.setAttribute("data-repo-id", GISCUS.repoId);
      s.setAttribute("data-category", GISCUS.category);
      s.setAttribute("data-category-id", GISCUS.categoryId);
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
      comments.innerHTML =
        '<p style="color:#98a1b3; font-size:0.92rem;">💬 Comments and reactions are launching soon.</p>';
    }
  }
})();
