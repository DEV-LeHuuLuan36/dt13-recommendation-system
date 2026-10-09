// SEO helpers: update document.title and meta tags per view.
export function setDocumentTitle(title) {
  if (typeof document === 'undefined') return;
  document.title = title;
}

export function setMetaDescription(text) {
  if (typeof document === 'undefined') return;
  let el = document.querySelector('meta[name="description"]');
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', 'description');
    document.head.appendChild(el);
  }
  el.setAttribute('content', text);
}

export function setMetaRobots(content) {
  if (typeof document === 'undefined') return;
  let el = document.querySelector('meta[name="robots"]');
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', 'robots');
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}
