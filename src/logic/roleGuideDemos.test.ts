import assert from 'node:assert/strict';
import test from 'node:test';
import { roleGuideDemos } from '../components/roleGuideDemos.ts';
import { guideLessons } from '../components/guideLessons.ts';
import { studentGuideSteps } from '../components/StudentGuideDemo.tsx';

const permissionSets = [
  [],
  ['grades.enter', 'attendance.write'],
  ['grades.moderate', 'grades.publish'],
  ['finance.read'],
  ['finance.read', 'finance.write'],
  ['inventory.read', 'inventory.write'],
  ['communications.read'],
  ['communications.read', 'communications.write'],
  ['students.write', 'staff.write', 'users.manage', 'grades.enter', 'grades.moderate', 'grades.publish', 'finance.write', 'inventory.write', 'communications.write'],
];

test('every narrated staff and guardian action has a visible control after preceding actions', () => {
  for (const permissions of permissionSets) {
   for (const roles of [[], ['HR_MANAGER'], ['PRINCIPAL'], ['SCHOOL_ADMIN']]) {
    const lessons = roleGuideDemos(permissions, false, roles);
    for (const [id, lesson] of Object.entries(lessons)) {
      let screen = lesson.screen;
      for (const action of lesson.actions) {
        const target = screen.controls.find(control => control.label === action.target);
        assert.ok(target, `${id}: missing target ${action.target} for ${permissions.join(',')}`);
        if (target.kind === 'select' && action.value !== undefined) assert.ok(target.options?.includes(action.value));
        if (action.screen) screen = action.screen;
      }
    }
   }
  }
});

test('every guide topic has a visual demonstration', () => {
  const roles = roleGuideDemos([], false);
  for (const id of Object.keys(guideLessons)) {
    assert.ok(id === 'student-assignments' || studentGuideSteps[id] || roles[id], `Missing visual demonstration for ${id}`);
  }
});

test('grade and finance demonstrations retain the current account authority', () => {
  const teacher = roleGuideDemos(['grades.enter'], false).teaching;
  assert.ok(teacher.actions.some(action => action.target === 'Submit all marks for review'));
  assert.ok(!teacher.actions.some(action => /Approve|Publish/.test(action.target)));
  for (const screen of [teacher.screen, ...teacher.actions.flatMap(action => action.screen ? [action.screen] : [])]) {
    assert.ok(!screen.controls.some(control => /Approve|Publish/.test(control.label)));
  }
  const reviewer = roleGuideDemos(['grades.moderate'], false).teaching;
  assert.ok(reviewer.actions.some(action => action.target === 'Approve marks awaiting review'));
  assert.ok(!reviewer.actions.some(action => action.target === 'Mark for Example Learner' || action.target === 'Publish approved marks'));
  const reader = roleGuideDemos(['finance.read'], false).finance;
  assert.ok(reader.actions.every(action => action.value === undefined));
  assert.ok(!reader.screen.controls.some(control => control.kind === 'button'));
});
