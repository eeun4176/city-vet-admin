import {describe,it,expect} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {NavigationBadge} from '../src/components/NavigationBadge';
import {badgeNodeForPage,isBadgePageRead,descendantBadge} from '../shared/navigationBadges';
describe('sidebar badge display and section reads',()=>{
 it('renders counts, updated dots, accessible descriptions, and a 99+ cap without zero badges',()=>{
  const node={id:'stubs'},render=(pending:number,updated:boolean)=>renderToStaticMarkup(createElement(NavigationBadge,{node,badges:{stubs:{pending,updated}}}));
  expect(render(0,false)).toBe('');expect(render(101,true)).toContain('99+');expect(render(101,true)).toContain('101 stub batches');expect(render(0,true)).toContain('New updates from other staff');
 });
 it('shows one parent dot rather than summing overlapping work counts',()=>{
  const nodes=[{id:'census-pending'},{id:'census-approved'}],badges={'census-pending':{pending:3,updated:true},'census-approved':{pending:0,updated:true}};
  expect(descendantBadge(nodes,badges)).toBe(true);
  const html=renderToStaticMarkup(createElement(NavigationBadge,{node:{id:'census',children:nodes as any},badges}));expect(html).toContain('Updates or pending work');expect(html).not.toContain('>3<');
 });
 it('uses the deepest category and excludes forms, metadata-only calls, and unrelated reads',()=>{
  expect(badgeNodeForPage('/census/review/pending/123')).toBe('census-pending');
  expect(isBadgePageRead('census-pending','/census/submissions?status=approved')).toBe(false);
  expect(isBadgePageRead('census-pending','/census/submissions?status=pending')).toBe(true);
  expect(isBadgePageRead('census-pending','/census/submissions/00000000-0000-4000-8000-000000000000/status')).toBe(false);
  expect(isBadgePageRead('owners','/registry-workspace?kind=pets')).toBe(false);
  expect(isBadgePageRead('reports','/reports?mode=options')).toBe(false);
  expect(badgeNodeForPage('/census/import')).toBeNull();expect(badgeNodeForPage('/issues/new')).toBe('issues');expect(isBadgePageRead('issues','/health')).toBe(false);
 });
});
