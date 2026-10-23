/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import { describe,it,expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { PageLoadRecovery,PageErrorBoundary } from '../src/components/PageErrorBoundary';
import { previewSection,previewLink } from '../shared/search';
describe('search destinations and recovery',()=>{
 it('keeps the selected record source in the correct sidebar section without inventing a census status',()=>{
  expect(previewSection('owner','Admin')).toBe('/registry/owners');
  expect(previewSection('census','Admin')).toBe('/census/review');
  expect(previewSection('census','Paravet')).toBe('/census/mine');
  expect(previewSection('attendance','Paravet')).toBe('/program-day');
  expect(previewSection('legacy-service','Admin')).toBe('/services');
  expect(previewSection('legacy-animal','Admin')).toBe('/registry');
  expect(previewLink('owner','ID #/?')).toBe('/records/view?source=owner&id=ID%20%23%2F%3F');
 });
 it('renders an explicit reload action and a working dashboard destination after a page-load failure',()=>{
  expect(PageErrorBoundary.getDerivedStateFromError()).toEqual({failed:true});
  const html=renderToStaticMarkup(createElement(PageLoadRecovery));
  expect(html).toContain('role="alert"');expect(html).toContain('Reload page');expect(html).toContain('href="/dashboard"');
 });
});
