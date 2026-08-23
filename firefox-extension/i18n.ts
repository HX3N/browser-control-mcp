export function t(key: string, substitutions?: string | string[]): string {
  return browser.i18n.getMessage(key, substitutions) || key;
}

export function localizeDocument(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach((element) => {
    const key = element.dataset.i18n;
    if (key) {
      element.textContent = t(key);
    }
  });

  root.querySelectorAll<HTMLElement>("[data-i18n-html]").forEach((element) => {
    const key = element.dataset.i18nHtml;
    if (key) {
      element.innerHTML = t(key);
    }
  });
}
