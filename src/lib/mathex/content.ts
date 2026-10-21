import { renderToString } from "katex";
import DOMPurify from "dompurify";

const mathRegex = /\$\$([\s\S]+?)\$\$/g;

export function parseStoredMath(value: string) {
  const match = /^\[scale=(0\.5|0\.75|1|1\.25|1\.5|1\.75|2\.5)\]([\s\S]*)$/.exec(value);
  return { latex: match ? match[2] : value, scale: match ? Number(match[1]) : 1 };
}

function renderKatex(value: string): string {
  const { latex, scale } = parseStoredMath(value);
  try {
    const math = renderToString(latex, { output: "mathml", throwOnError: false });
    return scale === 1 ? math : `<span style="font-size:${scale}em">${math}</span>`;
  } catch {
    return `<code class="text-destructive">${latex}</code>`;
  }
}

function renderMathInHtml(html: string): string {
  if (typeof document === "undefined") {
    return html.replace(mathRegex, (_, value) => renderKatex(value));
  }
  const container = document.createElement("div");
  container.innerHTML = html;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  for (const textNode of textNodes) {
    const text = textNode.data;
    const matches = [...text.matchAll(mathRegex)];
    if (matches.length === 0) continue;
    const fragment = document.createDocumentFragment();
    let offset = 0;
    for (const match of matches) {
      fragment.append(document.createTextNode(text.slice(offset, match.index)));
      const template = document.createElement("template");
      template.innerHTML = renderKatex(match[1]);
      fragment.append(template.content);
      offset = (match.index || 0) + match[0].length;
    }
    fragment.append(document.createTextNode(text.slice(offset)));
    textNode.replaceWith(fragment);
  }
  return container.innerHTML;
}

export function renderMath(html: string): string {
  return renderMathInHtml(
    DOMPurify.sanitize(html, {
      // KaTeX MathML puts the fallback LaTeX in <annotation>. Dropping these
      // elements turns that fallback into visible raw LaTeX.
      ADD_TAGS: ["semantics", "annotation"],
      ADD_ATTR: ["encoding"]
    })
  );
}

export function renderMathNoSanitize(html: string): string {
  return renderMathInHtml(html);
}

export function stripTags(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body.textContent || "";
}
