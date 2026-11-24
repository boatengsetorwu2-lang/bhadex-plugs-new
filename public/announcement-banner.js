(function () {
  async function showAnnouncement() {
    try {
      const response = await fetch("/api/features/public", { headers: { "Accept": "application/json" } });
      if (!response.ok) return;
      const data = await response.json();
      const item = Array.isArray(data.announcements) ? data.announcements[0] : null;
      if (!item || !item.message) return;

      const bar = document.createElement("aside");
      bar.className = "announcement-bar";
      bar.setAttribute("role", "status");
      const text = document.createElement("span");
      text.textContent = item.message;
      if (item.link_url) {
        try {
          const url = new URL(item.link_url, window.location.origin);
          if (url.protocol === "https:" || url.protocol === "http:") {
            const link = document.createElement("a");
            link.href = url.href;
            link.textContent = "Learn more";
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            bar.append(text, link);
          } else {
            bar.appendChild(text);
          }
        } catch {
          bar.appendChild(text);
        }
      } else {
        bar.appendChild(text);
      }

      const close = document.createElement("button");
      close.type = "button";
      close.className = "announcement-dismiss";
      close.setAttribute("aria-label", "Dismiss announcement");
      close.textContent = "×";
      close.addEventListener("click", () => bar.remove());
      bar.appendChild(close);

      const header = document.querySelector(".topbar");
      if (header && header.parentNode) header.parentNode.insertBefore(bar, header);
      else document.body.insertBefore(bar, document.body.firstChild);
    } catch (error) {
      console.warn("Announcement could not be loaded.");
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", showAnnouncement, { once: true });
  } else {
    showAnnouncement();
  }
})();