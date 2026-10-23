import { describe, expect, it } from 'vitest';
import { isolateForPrint } from '../src/lib/printOnly';

type FakeNode = { tagName: string; open?: boolean; parentElement: FakeNode | null; children: FakeNode[]; attrs: Set<string>; setAttribute(name: string): void; removeAttribute(name: string): void };
const node = (tagName: string, children: FakeNode[] = [], open?: boolean): FakeNode => {
  const self: FakeNode = { tagName, open, parentElement: null, children, attrs: new Set(), setAttribute(name) { self.attrs.add(name); }, removeAttribute(name) { self.attrs.delete(name); } };
  for (const child of children) child.parentElement = self;
  return self;
};

describe('printing one document', () => {
  it('hides everything beside the document, opens a collapsed section around it, and restores the page afterwards', () => {
    const sheet = node('DIV'), tabs = node('DIV'), summary = node('SUMMARY');
    const details = node('DETAILS', [summary, node('SECTION', [tabs, sheet])], false);
    const reviewControls = node('SECTION'), sidebar = node('ASIDE'), toast = node('DIV');
    const main = node('MAIN', [details, reviewControls]);
    const app = node('DIV', [sidebar, main]);
    const body = node('BODY', [app, toast]);

    const restore = isolateForPrint(sheet);
    for (const hidden of [tabs, summary, reviewControls, sidebar, toast]) expect(hidden.attrs.has('data-print-hidden')).toBe(true);
    for (const wrapper of [sheet.parentElement!, details, main, app, body]) expect(wrapper.attrs.has('data-print-path')).toBe(true);
    expect(sheet.attrs.size).toBe(0);
    expect(details.open).toBe(true);

    restore();
    for (const each of [tabs, summary, reviewControls, sidebar, toast, details, main, app, body]) expect(each.attrs.size).toBe(0);
    expect(details.open).toBe(false);
  });

  it('leaves an already open section open', () => {
    const sheet = node('DIV'), details = node('DETAILS', [sheet], true);
    node('BODY', [details]);
    isolateForPrint(sheet)();
    expect(details.open).toBe(true);
  });
});
