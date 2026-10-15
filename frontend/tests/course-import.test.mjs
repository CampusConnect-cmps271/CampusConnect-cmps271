import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { importCourses, parseCourseCatalogue, resolveImportTarget } from "../scripts/import-courses.mjs";

const header = "code,name,description,credits,prerequisites,department\n";
const example = await readFile(new URL("../../supabase/data/courses.example.csv", import.meta.url), "utf8");

describe("SCRUM-166 catalogue CSV validation", () => {
  it("reads the example and normalizes course codes and surrounding whitespace", () => {
    const [course] = parseCourseCatalogue(header + " cmps   271 , Software Engineering , Description ,3.25,, Computer Science \n");
    assert.deepEqual(course, {
      code: "CMPS 271", name: "Software Engineering", description: "Description",
      credits: 3.25, prerequisites: "", department: "Computer Science",
    });
    assert.equal(parseCourseCatalogue(example).length, 2);
  });

  it("supports BOM, CRLF, Arabic, commas, escaped quotes, multiline fields and a reordered header", () => {
    const [course] = parseCourseCatalogue('\uFEFFdepartment,credits,code,prerequisites,description,name\r\nالحاسوب,0,DEMO 1,"DEMO 0 or permission","First, ""quoted""\r\nsecond line",مقدمة\r\n');
    assert.equal(course.department, "الحاسوب");
    assert.equal(course.name, "مقدمة");
    assert.equal(course.description, 'First, "quoted"\nsecond line');
    assert.equal(course.prerequisites, "DEMO 0 or permission");
    assert.equal(course.credits, 0);
  });

  it("rejects missing/extra/duplicate headers, empty files and header-only CSVs", () => {
    for (const source of ["", header, "code,name\nA,B", header.replace("department", "code"), header.replace("department", "department,extra")]) {
      assert.throws(() => parseCourseCatalogue(source), /headers|no courses/);
    }
  });

  it("rejects duplicate codes after normalization", () => {
    assert.throws(() => parseCourseCatalogue(header + "DEMO 1,A,B,3,,Dept\ndemo   1,C,D,3,,Dept"), /record 3: duplicate course code DEMO 1/);
  });

  it("rejects malformed CSV and missing columns rather than shifting data", () => {
    for (const row of ['DEMO 1,A,"unclosed,3,,Dept', 'DEMO 1,A,B"bad,3,,Dept', 'DEMO 1,A,"B"oops,3,,Dept', "DEMO 1,A,B,3,Dept", "DEMO 1,A,B,3,,Dept,extra"]) {
      assert.throws(() => parseCourseCatalogue(header + row), /quoted|quote|fields/);
    }
  });

  it("rejects invalid credits, required fields, overlong fields and NUL bytes", () => {
    for (const credits of ["", "-1", "NaN", "Infinity", "3abc", "3.001", "1000", "1e2", "0x3"]) {
      assert.throws(() => parseCourseCatalogue(header + `DEMO 1,A,B,${credits},,Dept`), /credits/);
    }
    for (const row of [",A,B,3,,Dept", "DEMO 1, ,B,3,,Dept", "DEMO 1,A, ,3,,Dept", "DEMO 1,A,B,3,, ", `${"A".repeat(33)},A,B,3,,Dept`, `DEMO 1,${"A".repeat(301)},B,3,,Dept`, "DEMO 1,A,B\0,3,,Dept"]) {
      assert.throws(() => parseCourseCatalogue(header + row));
    }
  });

});

describe("SCRUM-166 import target and Supabase requests", () => {
  const env = { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", SUPABASE_SECRET_KEY: "synthetic-local-secret" };

  it("defaults to loopback only and accepts IPv6 loopback", () => {
    assert.equal(resolveImportTarget(env).url, env.NEXT_PUBLIC_SUPABASE_URL);
    assert.equal(resolveImportTarget({ ...env, NEXT_PUBLIC_SUPABASE_URL: "http://[::1]:54321" }).url, "http://[::1]:54321");
    for (const url of ["https://example.supabase.co", "http://localhost.evil.test", "ftp://localhost", "http://localhost/path", "http://user:password@localhost", "http://localhost?key=secret"]) {
      assert.throws(() => resolveImportTarget({ ...env, NEXT_PUBLIC_SUPABASE_URL: url }));
    }
  });

  it("uses separate hosted credentials and rejects insecure or unexpected hosted URLs", () => {
    assert.throws(() => resolveImportTarget(env, true), /HOSTED_SUPABASE_URL/);
    const hosted = { ...env, HOSTED_SUPABASE_URL: "https://example.supabase.co", HOSTED_SUPABASE_SECRET_KEY: "synthetic-hosted-secret" };
    assert.deepEqual(resolveImportTarget(hosted, true), { url: hosted.HOSTED_SUPABASE_URL, key: hosted.HOSTED_SUPABASE_SECRET_KEY, projectRef: "example" });
    for (const url of ["http://example.supabase.co", "https://example.supabase.co.evil.test", "http://localhost"]) {
      assert.throws(() => resolveImportTarget({ ...hosted, HOSTED_SUPABASE_URL: url }, true));
    }
  });

  it("sends bounded upsert requests through the real SDK using code as the conflict key", async () => {
    const requests = [];
    const client = createClient("http://127.0.0.1:54321", "synthetic-secret", {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: async (input, options) => {
        requests.push({ url: new URL(input), options, body: JSON.parse(options.body) });
        return new Response(null, { status: 201 });
      } },
    });
    const courses = parseCourseCatalogue(example);
    assert.equal(await importCourses(client, courses, { batchSize: 1 }), 2);
    assert.equal(requests.length, 2);
    for (const [index, request] of requests.entries()) {
      assert.equal(request.url.pathname, "/rest/v1/courses");
      assert.equal(request.url.searchParams.get("on_conflict"), "code");
      assert.equal(request.options.method, "POST");
      assert.match(new Headers(request.options.headers).get("prefer"), /resolution=merge-duplicates/);
      assert.deepEqual(request.body, [courses[index]]);
      assert.equal("id" in request.body[0], false);
    }
  });

  it("stops on the first failed batch and reports committed progress without echoing provider data", async () => {
    let calls = 0;
    const client = { from: () => ({ upsert: async () => ({
      error: ++calls === 2 ? { code: "42501", message: "synthetic-secret must not be printed" } : null,
    }) }) };
    const courses = [...parseCourseCatalogue(example), { code: "DEMO 301" }];
    const progress = [];
    await assert.rejects(importCourses(client, courses, { batchSize: 1, onBatch: (count) => progress.push(count) }), (error) => {
      assert.match(error.message, /after 1 courses.*42501/);
      assert.doesNotMatch(error.message, /synthetic-secret/);
      return true;
    });
    assert.equal(calls, 2);
    assert.deepEqual(progress, [1]);
    await assert.rejects(importCourses(client, courses, { batchSize: 0 }), /positive integer/);
  });
});
