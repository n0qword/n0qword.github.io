type PostLike = {
  data: { description?: string };
  body?: string;
};

export function firstParagraph(body?: string): string {
  if (!body) return "";

  const text = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/~~~[\s\S]*?~~~/g, "")
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[*_`]/g, "")
    .replace(/^\s*[-+*]\s+/gm, "")
    .trim();

  const paragraph = text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.replace(/\s+/g, " ").trim())
    .find((chunk) => chunk.length > 0);

  return paragraph ?? "";
}

export function postDescription(post: PostLike): string {
  const explicit = post.data.description?.trim();
  if (explicit) return explicit;
  return firstParagraph(post.body);
}
