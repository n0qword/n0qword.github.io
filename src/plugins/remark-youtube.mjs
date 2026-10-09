const SYNTAX = /^::youtube\[([^\]]+)\](?:\{"([^"]*)"\})?$/;

/** Flattens inline nodes back to their source-ish text so `[url]` autolinks still match. */
function inlineText(nodes) {
  return nodes
    .map((node) => {
      if (node.type === "text" || node.type === "inlineCode") return node.value;
      if (node.type === "link" || node.type === "linkReference") return node.url ?? "";
      return "";
    })
    .join("");
}

/**
 * Turns a lone paragraph of the form
 *
 *   ::youtube[https://youtu.be/<id>]{"Optional title"}
 *
 * into a lazy-loaded embed card. Implemented as a plain paragraph transform so
 * posts stay `.md` and no extra remark dependency is required.
 */
export default function remarkYouTube() {
  return (tree) => {
    walk(tree);
  };
}

function walk(parent) {
  for (let i = 0; i < parent.children.length; i++) {
    const node = parent.children[i];

    if (node.type === "paragraph" && node.children.length > 0) {
      const raw = inlineText(node.children);
      const match = SYNTAX.exec(raw.trim());
      if (match) {
        parent.children[i] = buildEmbed(match[1], match[2], node.position);
        continue;
      }
    }

    if (node.children) walk(node);
  }
}

function getVideoId(value) {
  try {
    const parsed = new URL(value.trim());
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
    const parts = parsed.pathname.split("/").filter(Boolean);
    const id =
      host === "youtu.be"
        ? parts[0]
        : parsed.pathname === "/watch"
          ? parsed.searchParams.get("v")
          : ["embed", "shorts", "live"].includes(parts[0])
            ? parts[1]
            : "";
    return /^[A-Za-z0-9_-]{11}$/.test(id ?? "") ? id : "";
  } catch {
    return "";
  }
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function notice(message, link, position) {
  const children = [{ type: "text", value: message }];
  if (link) {
    children.push(
      { type: "text", value: " " },
      { type: "link", url: link, children: [{ type: "text", value: link }] }
    );
  }
  return { type: "paragraph", children, position };
}

function buildEmbed(url, customTitle, position) {
  const id = getVideoId(url);
  if (!id) return notice("youtube: could not parse a video id from", url, position);

  const title = customTitle || "YouTube video";
  const src = `https://www.youtube-nocookie.com/embed/${id}?autoplay=0&rel=0`;

  return {
    type: "html",
    position,
    value:
      `<div class="youtube-embed">` +
      `<iframe src="${escapeAttr(src)}" title="${escapeAttr(title)}" loading="lazy" ` +
      `allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ` +
      `referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>` +
      `</div>`,
  };
}