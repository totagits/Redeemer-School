import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TeacherCurriculumOverview} from '../src/components/TeacherCurriculumOverview.tsx';
test('teacher curriculum view shows assigned curriculum and lessons without editing controls',()=>{
 const html=renderToStaticMarkup(React.createElement(TeacherCurriculumOverview,{userId:'teacher',assignments:[{id:'own',teacher_id:'teacher',subject_id:'math',academic_year_id:'year',class_group_id:'class',class_name:'Assigned class',subject_name:'Mathematics'},{id:'other',teacher_id:'other-teacher',class_name:'Other class'}],classes:[{id:'class',grade_level_id:'grade'}],curriculum:[{id:'own-curriculum',grade_level_id:'grade',academic_year_id:'year',subject_id:'math',learning_objectives:'Assigned learning objectives'},{id:'other-curriculum',grade_level_id:'other-grade',academic_year_id:'year',subject_id:'math',learning_objectives:'Unassigned learning objectives'}],timetable:[{id:'slot',teacher_assignment_id:'own',day_of_week:'1',starts_at:'08:00',ends_at:'09:00',class_name:'Assigned lesson'},{id:'other-slot',teacher_assignment_id:'other',class_name:'Unassigned lesson'}]}));
 assert.match(html,/Assigned class/);assert.match(html,/Assigned learning objectives/);assert.match(html,/Assigned lesson/);assert.match(html,/Monday/);assert.doesNotMatch(html,/Other class|Unassigned learning objectives|Unassigned lesson|<form|<input|<button/);
});
test('unassigned teacher receives actionable empty states',()=>{
 const html=renderToStaticMarkup(React.createElement(TeacherCurriculumOverview,{userId:'teacher',assignments:[],classes:[],curriculum:[],timetable:[]}));assert.match(html,/No teaching assignments/);assert.match(html,/No lessons have been scheduled/);assert.match(html,/Ask the school administrator/);
});
