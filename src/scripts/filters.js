/**
 * filters.js — Client-side search & tag filter logic for post listings.
 *
 * Shared between index.astro (home, limited to INITIAL_COUNT) and
 * posts/index.astro (full archive, no limit).
 *
 * Behaviour is determined by whether #btn-show-more exists in the DOM:
 *   - Present → home page: hides all posts beyond INITIAL_COUNT until
 *               "ver más" is clicked; search/filter reveals all.
 *   - Absent  → archive page: no limit, show all matching posts.
 */

(function () {
  const INITIAL_COUNT = 3;

  const searchInput = document.getElementById("search");
  const tagFilters = document.querySelectorAll(".tag-filter");
  const postItems = document.querySelectorAll("#post-list > li");
  const noResults = document.getElementById("no-results");
  const btnMore = document.getElementById("btn-show-more");

  let activeTag = null;
  let showingAll = false;

  function filterPosts() {
    const query = searchInput.value.toLowerCase();
    const isSearching = !!query || !!activeTag;
    let visibleCount = 0;

    for (const post of postItems) {
      const tags = post.dataset.tags || "";
      const text = post.textContent.toLowerCase();
      const matchesSearch = !query || text.includes(query);
      const matchesTag = !activeTag || tags.includes(activeTag);
      const matches = matchesSearch && matchesTag;

      post.classList.toggle("hidden-filtered", !matches);
      if (matches) visibleCount++;
    }

    if (noResults) {
      noResults.style.display = visibleCount === 0 ? "block" : "none";
    }

    if (btnMore) {
      if (isSearching) {
        showingAll = true;
        postItems.forEach((p) => p.classList.remove("hidden-more"));
        btnMore.classList.add("hidden");
      } else {
        showingAll = false;
        postItems.forEach((p, i) => {
          p.classList.remove("hidden-more");
          if (i >= INITIAL_COUNT) p.classList.add("hidden-more");
        });
        btnMore.classList.remove("hidden");
      }
    }
  }

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      if (btnMore && searchInput.value) {
        showingAll = true;
        postItems.forEach((p) => p.classList.remove("hidden-more"));
        btnMore.classList.add("hidden");
      }
      filterPosts();
    });
  }

  for (const btn of tagFilters) {
    btn.addEventListener("click", () => {
      const tag = btn.dataset.tag;
      if (activeTag === tag) {
        activeTag = null;
        btn.classList.remove("active");
      } else {
        activeTag = tag;
        for (const b of tagFilters) b.classList.remove("active");
        btn.classList.add("active");
      }
      filterPosts();
    });
  }

  document.addEventListener("click", (e) => {
    const tagEl = e.target.closest(".tag");
    if (tagEl) {
      const tag = tagEl.dataset.tag;
      if (!tag) return;
      activeTag = tag;
      for (const b of tagFilters) {
        b.classList.toggle("active", b.dataset.tag === tag);
      }
      filterPosts();
      if (searchInput) searchInput.focus();
    }
  });

  if (btnMore) {
    btnMore.addEventListener("click", () => {
      showingAll = true;
      postItems.forEach((p) => p.classList.remove("hidden-more"));
      btnMore.classList.add("hidden");
    });
  }
})();
