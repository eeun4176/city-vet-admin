/** Minimal element shape used here, so the logic runs (and is tested) without a browser DOM. */
type PrintNode = {
  parentElement: PrintNode | null;
  children: ArrayLike<PrintNode>;
  tagName: string;
  open?: boolean;
  setAttribute(name: string, value: string): void;
  removeAttribute(name: string): void;
};

/**
 * Prints only `element`: every sibling along its path to <body> is hidden for the print (styles.css),
 * the wrappers on that path drop their screen layout, and collapsed <details> around it are opened.
 * Returns the function that puts the page back; `printOnly` calls it after printing.
 */
export function isolateForPrint(element: PrintNode): () => void {
  const marked: [PrintNode, string][] = [];
  const opened: PrintNode[] = [];
  const mark = (node: PrintNode, attribute: string) => { node.setAttribute(attribute, ''); marked.push([node, attribute]); };
  for (let node = element; node.parentElement; node = node.parentElement) {
    if (node.tagName === 'DETAILS' && !node.open) { node.open = true; opened.push(node); }
    const parent = node.parentElement;
    mark(parent, 'data-print-path');
    for (const sibling of Array.from(parent.children)) if (sibling !== node) mark(sibling, 'data-print-hidden');
  }
  return () => {
    for (const [node, attribute] of marked) node.removeAttribute(attribute);
    for (const node of opened) node.open = false;
  };
}

/** Opens the print dialog for `element` alone; the rest of the page (filters, review controls, navigation) is left out. */
export function printOnly(element: HTMLElement) {
  const restore = isolateForPrint(element);
  window.addEventListener('afterprint', restore, { once: true });
  window.print();
}
