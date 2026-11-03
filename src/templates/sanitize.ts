import sanitizeHtml from "sanitize-html";

// Stored Markdown and footer markup are untrusted: API keys may be scoped to
// writing posts, and neither should grant the ability to run admin scripts.
// Keep common Markdown, media and formatting tags without allowing executable
// embeds or event handlers. The original text in the database is never changed.
const allowedTags = [
  ...sanitizeHtml.defaults.allowedTags,
  "img", "input", "del", "s", "u", "ins", "mark", "details", "summary",
  "audio", "video", "source", "picture", "figure", "figcaption",
];

export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: {
      "*": ["class", "id", "title", "lang", "dir", "style"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "srcset", "alt", "width", "height", "loading"],
      source: ["src", "srcset", "type", "media"],
      audio: ["src", "controls", "preload", "loop", "muted"],
      video: ["src", "controls", "preload", "loop", "muted", "poster", "width", "height"],
      input: ["type", "checked", "disabled"],
      ol: ["start", "type"],
      li: ["value"],
      th: ["colspan", "rowspan", "scope", "align"],
      td: ["colspan", "rowspan", "align"],
      code: ["class"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data"] },
    allowedStyles: {
      "*": {
        "text-align": [/^(?:left|right|center|justify|start|end)$/i],
        "color": [/^#[0-9a-f]{3,8}$/i, /^[a-z]+$/i, /^rgba?\([\d\s.,%]+\)$/i],
        "background-color": [/^#[0-9a-f]{3,8}$/i, /^[a-z]+$/i, /^rgba?\([\d\s.,%]+\)$/i],
        "font-weight": [/^(?:normal|bold|bolder|lighter|[1-9]00)$/i],
        "font-style": [/^(?:normal|italic|oblique)$/i],
        "text-decoration": [/^(?:none|underline|overline|line-through)$/i],
        "font-size": [/^\d+(?:\.\d+)?(?:px|em|rem|%)$/i],
      },
    },
    transformTags: {
      input: (_tagName, attributes) => ({
        tagName: "input",
        attribs: attributes.type?.toLowerCase() === "checkbox"
          ? { type: "checkbox", disabled: "disabled", ...(attributes.checked !== undefined ? { checked: "checked" } : {}) }
          : { type: "checkbox", disabled: "disabled" },
      }),
      a: (_tagName, attributes) => ({
        tagName: "a",
        attribs: attributes.target === "_blank"
          ? { ...attributes, rel: "noopener noreferrer" }
          : attributes,
      }),
    },
  });
}
