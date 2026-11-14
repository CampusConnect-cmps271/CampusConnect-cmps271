import {it} from "node:test";
import assert from "node:assert/strict";
import {readFile,readdir} from "node:fs/promises";
import {PGlite} from "@electric-sql/pglite";
it("backfills saved CRN links only for the matching active fetch, preserving all other section data",async()=>{
 const folder=new URL("../../supabase/migrations/",import.meta.url);
 const name=(await readdir(folder)).find(name=>name.endsWith("_resis_connected_crns.sql"));
 const sql=await readFile(new URL(name,folder),"utf8");const payload=JSON.parse(/select '(.*)'::jsonb/.exec(sql)[1]);
 const [semester,other]=Object.keys(payload),crn=Object.keys(payload[semester].crns)[0],otherCrn=Object.keys(payload[other].crns)[0];
 const db=new PGlite();try{
 await db.exec("create table resis_semesters(id text,active_import_id text);create table resis_imports(id text,fetched_at timestamptz);create table course_offerings(import_id text,sections jsonb);");
 await db.query("insert into resis_semesters values ($1,'active'),($2,'newer')",[semester,other]);
 await db.query("insert into resis_imports values ('active',$1),('newer','2030-01-01')",[payload[semester].fetched_at]);
 const sections=[{crn,title:"Preserve description",sessions:[{type:"Recitation"}]},{crn:"99999",title:"Keep order"}];
 await db.query("insert into course_offerings values ('active',$1),('newer',$2)",[JSON.stringify(sections),JSON.stringify([{crn:otherCrn}])]);
 await db.exec(sql);const rows=(await db.query("select * from course_offerings order by import_id")).rows;
 assert.deepEqual(rows[0].sections,[{...sections[0],connected_crns:payload[semester].crns[crn]},sections[1]]);
 assert.deepEqual(rows[1].sections,[{crn:otherCrn}]);
 }finally{await db.close();}
});

it("identifies an E1 component by its saved meeting type and CRN, not a lab assumption",async()=>{
 const folder=new URL("../../supabase/migrations/",import.meta.url),name=(await readdir(folder)).find(n=>n.endsWith("_resis_connected_labels.sql"));
 const db=new PGlite();try{
 await db.exec("create table resis_semesters(id text,active_import_id text);create table courses(id text,code text);create table course_offerings(import_id text,course_id text,sections jsonb);insert into resis_semesters values ('202720','active');insert into courses values ('course','CHEM 201');");
 await db.query("insert into course_offerings values ('active','course',$1)",[JSON.stringify([{crn:"111",section:"1",sessions:[{type:"Lecture"}],connected_crns:["222"]},{crn:"222",section:"E1",sessions:[{type:"Recitation"}]}])]);
 await db.exec(await readFile(new URL(name,folder),"utf8"));
 const section=(await db.query("select sections from course_offerings")).rows[0].sections[0];
 assert.deepEqual(section.connected_labels,["CHEM 201 · Section E1 · Recitation · CRN 222"]);
 }finally{await db.close();}
});
