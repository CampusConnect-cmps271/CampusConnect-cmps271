import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildCatalogue, catalogueURL, discoverAcademicUnits, discoverFacultyLinks, discoverFacultyPDF, extractCatalogueText, toCSV } from "../scripts/lib/aub-catalogue.mjs";
import { parseCourseCatalogue } from "../scripts/import-courses.mjs";

// Synthetic fixtures model AUB's layout; no copied catalogue prose is needed.
const source = { faculty: "Faculty of Example Studies", level: "ug",
  url: "https://www.aub.edu.lb/Registrar/catalogue2026-27/ug/Documents/example.pdf" };
const text = (body) => `Faculty of Example Studies 2026-27\n\nDepartment of Example Studies\nChairperson Example, Person\n\nCourse Descriptions\n${body}\n\n42\n`;

describe("AUB official catalogue source discovery", () => {
  const root = "https://www.aub.edu.lb/Registrar/catalogue2026-27/ug/Pages/default.aspx";
  it("discovers faculties and schools while excluding faculty lists and endowed chairs", () => {
    const links = discoverFacultyLinks(`<a href="fas.aspx">Section 18 - Faculty of Arts and Sciences (FAS)</a>
      <a href="osb.aspx">Section 19 – School of Business (OSB)</a>
      <a href="faculty-list.aspx">Section 24 - Faculty List</a>
      <a href="chairs.aspx">Section 23 - Endowed Faculty Chairs; Academic Centers</a>
      <a href="fas.aspx">Section 18 - Faculty of Arts and Sciences (FAS)</a>`, root, "2026-27");
    assert.equal(links.length, 2);
    assert.match(links[0].landing_url, /\/ug\/Pages\/fas.aspx$/);
  });
  it("resolves PDF links, markup and entities without selecting unrelated downloads", () => {
    const html = `<a href='/Documents/research.pdf'>Research</a>
      <a href="../Documents/fas.pdf"><span>Download</span> Faculty &amp; School PDF</a>`;
    assert.equal(discoverFacultyPDF(html, root, "2026-27"), "https://www.aub.edu.lb/Registrar/catalogue2026-27/ug/Documents/fas.pdf");
    assert.throws(() => discoverFacultyPDF("", root, "2026-27"), /found 0/);
    assert.throws(() => discoverFacultyLinks("", root, "2026-27"), /No faculty/);
  });
  it("rejects other hosts, years, HTTP, ports and credentials", () => {
    for (const url of [
      "https://evil.test/Registrar/catalogue2026-27/a.pdf", "http://www.aub.edu.lb/Registrar/catalogue2026-27/a.pdf",
      "https://www.aub.edu.lb/Registrar/catalogue2025-26/a.pdf", "https://www.aub.edu.lb.evil.test/Registrar/catalogue2026-27/a.pdf",
      "https://user:secret@www.aub.edu.lb/Registrar/catalogue2026-27/a.pdf", "https://www.aub.edu.lb:123/Registrar/catalogue2026-27/a.pdf",
    ]) assert.throws(() => catalogueURL(url, "2026-27"));
  });
  it("discovers named academic units from official links", () => {
    const units = discoverAcademicUnits(`<a href="example.aspx">The Example Program in Humanities (EPH)</a>
      <a href="bba.aspx">Undergraduate Program: BBA Program</a>
      <a href="courses.aspx">Example Courses</a><a href="https://evil.test">Department of Evil</a>`, root, "2026-27");
    assert.deepEqual(units, ["The Example Program in Humanities (EPH)"]);
  });
});

describe("AUB PDF text extraction", () => {
  it("extracts credits rather than lecture/lab hours and preserves prerequisites", () => {
    const { records } = extractCatalogueText(text("DEMO 101 Introduction to Examples 3.2; 3 cr.\nA synthetic description. Prerequisite: DEMO 100 or permission of instructor."), source);
    assert.equal(records.length, 1);
    assert.deepEqual(records[0].issues, []);
    assert.equal(records[0].course.credits, 3);
    assert.equal(records[0].course.name, "Introduction to Examples");
    assert.equal(records[0].course.department, "Department of Example Studies");
    assert.equal(records[0].course.prerequisites, "Prerequisite: DEMO 100 or permission of instructor.");
    assert.equal(parseCourseCatalogue(toCSV([records[0].course])).length, 1);
  });
  it("retains curriculum prose inside complete descriptions", () => {
    const fixture = text("DEMO 300 Teaching 3 cr.\nA course on organizational structures,\ncurriculum delivery, examinations and ethics.\n\nDEMO 539 Educational Projects 3 cr.\nThe project covers course/\ncurriculum design and assessment.");
    const { records } = extractCatalogueText(fixture, source);
    assert.equal(records[0].course.description, "A course on organizational structures, curriculum delivery, examinations and ethics.");
    assert.equal(records[1].course.description, "The project covers course/ curriculum design and assessment.");
  });
  it("holds abbreviated paired suffix codes without merging them into the preceding description", () => {
    const fixture = text("DEMO 330 Genetics 2 cr.\nA genetics description.\n\nDEMO 395A/B Comprehensive Exam 0 cr.\nPrerequisite: consent of adviser.");
    const { records } = extractCatalogueText(fixture, source);
    assert.equal(records[0].course.description, "A genetics description.");
    assert.equal(records[1].course.code, "DEMO 395A/B");
    assert.ok(records[1].issues.includes("multiple_or_ambiguous_course_codes"));
  });
  it("keeps three-code cross-listings out of the preceding description and holds the combined registration", () => {
    for (const header of ["DEMO 674/TEST305/EXAM 333 Shared Methods 3 cr.", "DEMO 674 / TEST 305 / EXAM 333 Shared Methods 3 cr."]) {
      const fixture = text(`DEMO 673 Building Methods 3 cr.\nA building description. Pre/corequisite: DEMO 310 or equivalent.\n\n${header}\nA shared methods description. Prerequisite: TEST 301.\n\nDEMO 675 Later Methods 3 cr.\nA later description.`);
      const extraction = extractCatalogueText(fixture, source);
      assert.equal(extraction.records.length, 3);
      assert.equal(extraction.records[0].course.description, "A building description. Pre/corequisite: DEMO 310 or equivalent.");
      assert.equal(extraction.records[0].course.prerequisites, "Pre/corequisite: DEMO 310 or equivalent.");
      assert.equal(extraction.records[1].course.description, "A shared methods description. Prerequisite: TEST 301.");
      assert.ok(extraction.records[1].issues.includes("multiple_or_ambiguous_course_codes"));
      assert.deepEqual(buildCatalogue([extraction]).courses.map((course) => course.code), ["DEMO 673", "DEMO 675"]);
    }
  });
  it("separates colon-delimited teaching hours from credits", () => {
    const { records } = extractCatalogueText(text("DEMO 300 Epidemiology 1.5:2; 2 cr.\nAn epidemiology description."), source);
    assert.equal(records[0].course.name, "Epidemiology");
    assert.equal(records[0].course.credits, 2);
  });
  it("ends descriptions before programme and category headings", () => {
    for (const heading of ["Art History Program", "Architecture Professional Practice", "Category B: History and Theory", "Elective Courses Category C: Technology", "Specialization Electives: 9 credits", "Major in Political Studies: 39 Credits in Political Studies"]) {
      const { records } = extractCatalogueText(text(`DEMO 223 Film\n3 cr.\nA film description.\n\n${heading}\nUnrelated programme text.`), source);
      assert.equal(records[0].course.description, "A film description.", heading);
    }
  });
  it("strips interdisciplinary division page headers from descriptions", () => {
    const fixture = text("DEMO 301 Greening 3 cr.\nA description.") + "\fDivision of University Interdisciplinary Programs (DUIP) 2026-27\n\nDEMO 302 Landscapes 3 cr.\nAnother description.";
    const { records } = extractCatalogueText(fixture, source);
    assert.equal(records[0].course.description, "A description.");
    assert.equal(records.length, 2);
  });
  it("holds a possible integer teaching-hour label for review instead of accepting it as title text", () => {
    const { records } = extractCatalogueText(text("DEMO 246 Human Physiology 48; 4 cr.\nA course on human physiology."), source);
    assert.equal(records[0].course.credits, 4);
    assert.ok(records[0].issues.includes("possible_integer_contact_hours_in_title"));
    assert.equal(buildCatalogue([{ records, warnings: [] }]).courses.length, 0);
  });
  it("extracts explicit requirement labels written as prose or with a period", () => {
    for (const requirement of ["Prerequisites at least two of the following: DEMO 204; DEMO 207 and DEMO 208.", "Prerequisite is DEMO 326A.", "Prerequisites for the course include DEMO300 or an equivalent course.", "Prerequisite course: DEMO 322.", "Prerequisite. DEMO 200 or consent of instructor.", "Prerequisite for DEMO students only: DEMO 207."]) {
      const { records } = extractCatalogueText(text(`DEMO 250 Practice 2 cr.\nA course with practical activities. ${requirement}`), source);
      assert.equal(records[0].course.prerequisites, requirement);
    }
  });
  it("does not reverse a statement that the current course is another course's prerequisite", () => {
    const { records } = extractCatalogueText(text("DEMO 504 Practice 3 cr.\nA practical course. This course is a prerequisite for DEMO 614."), source);
    assert.equal(records[0].course.prerequisites, "");
  });
  it("removes former numbers without a colon and standalone term notes from requirements", () => {
    const requirement = "Prerequisite: DEMO 101 completed in the spring term or permission of instructor. Annually. Formerly EXAM 500. Corequisite: DEMO 102. Fall.";
    const { records } = extractCatalogueText(text(`DEMO 302 Methods 3 cr.\nA course in methods. ${requirement}`), source);
    assert.equal(records[0].course.prerequisites, "Prerequisite: DEMO 101 completed in the spring term or permission of instructor. Corequisite: DEMO 102.");
    assert.ok(records[0].course.description.endsWith(requirement));
  });
  it("keeps credit exclusions and registration metadata only in the full description", () => {
    for (const metadata of ["Students who receive credit for DEMO 331 cannot receive credit for EXAM 217.", "Students cannot receive credit for both DEMO 220 and EXAM 270; the two courses will be treated as equivalent.", "(Students who receive credits for DEMO 208 cannot receive credit for DEMO 108. Spring only).", "Equivalent to EXAM 320.", "May be repeated for credit when topics vary.", "Offered in the summer term only."]) {
      const { records } = extractCatalogueText(text(`DEMO 250 Practice 3 cr.\nA practical course. Prerequisite: DEMO 101 or consent of instructor. ${metadata}`), source);
      assert.equal(records[0].course.prerequisites, "Prerequisite: DEMO 101 or consent of instructor.", metadata);
      assert.ok(records[0].course.description.endsWith(metadata));
    }
  });
  it("recognizes printed program chapters omitted from landing-page unit links", () => {
    for (const [heading,owner] of [["Master of Science in Business\nAnalytics (MSBA)","Master of Science in Business Analytics (MSBA)"], ["MS in Rural Community\nDevelopment (RCODE)","MS in Rural Community Development (RCODE)"], ["Graduate Studies in Biomedical\nSciences","Graduate Studies in Biomedical Sciences"]]) {
      const fixture = `The Previous Program\n\nDEMO 101 Examples 3 cr.\nA description.\n\n${heading}\n\nDEMO 301 More Examples 3 cr.\nAnother description.`;
      const {records} = extractCatalogueText(fixture,{...source,units:["The Previous Program"]});
      assert.equal(records[1].course.department,owner);
      assert.equal(records[1].course.code,"DEMO 301");
    }
  });
  it("handles wrapped titles, fractional credits, labs and no explicit prerequisite", () => {
    const { records } = extractCatalogueText(text("DEMO 101L A Very Long\nExample Laboratory Title 0.3; 0.5 cr.\nA laboratory description."), source);
    assert.equal(records[0].course.name, "A Very Long Example Laboratory Title");
    assert.equal(records[0].course.credits, 0.5);
    assert.equal(records[0].course.code, "DEMO 101L");
    assert.equal(records[0].course.prerequisites, "");
  });
  it("removes lecture hours separated from credits by a comma", () => {
    const { records } = extractCatalogueText(text("DEMO 273 Example Mathematics 3.0, 3 cr.\nA mathematical description."), source);
    assert.equal(records[0].course.name, "Example Mathematics");
    assert.equal(records[0].course.credits, 3);
    assert.deepEqual(records[0].issues, []);
  });
  it("removes colon-separated contact hours from the title", () => {
    const { records } = extractCatalogueText(text("DEMO 258 Language and Identity 3.0: 3 cr.\nA course in language and identity."), source);
    assert.equal(records[0].course.name, "Language and Identity");
    assert.equal(records[0].course.credits, 3);
    assert.deepEqual(records[0].issues, []);
  });
  it("removes only unconditional Equivalent to labels from prerequisites", () => {
    const fixture = text("DEMO 204 Language II 3 cr.\nA course in language. Prerequisites: DEMO 203 or placement examination. Every term. Equivalent to: EXAM 322. Corequisite: DEMO 205.\n\nDEMO 206 Language IV 3 cr.\nA course in language. Prerequisite: DEMO 205. Equivalent to: EXAM 324 only with instructor approval.");
    const { records } = extractCatalogueText(fixture, source);
    assert.equal(records[0].course.prerequisites, "Prerequisites: DEMO 203 or placement examination. Corequisite: DEMO 205.");
    assert.match(records[0].course.description, /Equivalent to: EXAM 322\./);
    assert.match(records[1].course.prerequisites, /Equivalent to: EXAM 324 only with instructor approval\./);
  });
  it("handles spaces before a contact-hour separator and flags hours fused into a title", () => {
    const fixture = text("DEMO 103L Example Laboratory 1.2 ; 1 cr.\nA laboratory description.\n\nDEMO 101L Example Laboratory I1.2; 1 cr.\nAnother laboratory description.");
    const { records } = extractCatalogueText(fixture, source);
    assert.equal(records[0].course.name, "Example Laboratory");
    assert.equal(records[0].course.credits, 1);
    assert.deepEqual(records[0].issues, []);
    assert.ok(records[1].issues.includes("possible_contact_hours_in_title"));
  });
  it("handles credits touching the separator and a spaced lab suffix inside the description", () => {
    const fixture = text("DEMO 216L Example Laboratory 0.3;1 cr.\nDEMO 216 L is an introduction to laboratory methods.\n\nDEMO 217 Example Methods 3 cr.\nA separate course description.");
    const { records } = extractCatalogueText(fixture, source);
    assert.equal(records.length, 2);
    assert.equal(records[0].course.name, "Example Laboratory");
    assert.equal(records[0].course.credits, 1);
    assert.equal(records[0].course.description, "DEMO 216 L is an introduction to laboratory methods.");
    assert.deepEqual(records[0].issues, []);
  });
  it("recognizes per-registration credit labels without truncating the preceding course", () => {
    const fixture = text("DEMO 309 Example Experiments 1.6; 3 cr.\nA complete description.\n\nDEMO 310 Special Topics 3.0; 3 cr. (each)\nMay be repeated for credit.\n\nDEMO 391 Tutorial 1-3 cr. (each)\nA tutorial description.");
    const { records } = extractCatalogueText(fixture, source);
    assert.equal(records.length, 3);
    assert.deepEqual(records[0].issues, []);
    assert.equal(records[1].course.name, "Special Topics");
    assert.equal(records[1].course.credits, 3);
    assert.ok(records[1].issues.includes("description_contains_only_registration_metadata"));
    assert.ok(records[2].issues.includes("variable_or_ambiguous_credits"));
  });
  it("holds enumerated credit choices instead of taking the last value as fixed credits", () => {
    for (const creditLabel of ["1, 2, 3 or 4", "1, 2, or 3", "1 or 2"]) {
      const { records } = extractCatalogueText(text(`DEMO 390 Special Topics ${creditLabel} cr.\nStudents research selected topics.`), source);
      assert.equal(records[0].course.name, "Special Topics");
      assert.equal(records[0].course.credits, null);
      assert.equal(records[0].source.credit_label, creditLabel);
      assert.ok(records[0].issues.includes("variable_or_ambiguous_credits"));
    }
  });
  it("preserves complete combined prerequisite and corequisite labels", () => {
    for (const label of ["Pre and corequisites", "Pre-and corequisites", "Prerequisite or Corequisite", "Pre/corequisite", "Prerequisites and co-requisites"]) {
      const requirements = `${label}: DEMO 217 and DEMO 220. Annually.`;
      const { records } = extractCatalogueText(text(`DEMO 237 Example Physics 3 cr.\nA physics description. ${requirements}`), source);
      assert.equal(records[0].course.prerequisites, `${label}: DEMO 217 and DEMO 220.`, label);
    }
  });
  it("extracts colonless requirement labels only when followed by a course code", () => {
    const fixture = text("DEMO 101L Example Lab 1 cr.\nA laboratory description. Pre/corequisite DEMO 101. Every term.\n\nDEMO 102 Further Examples 3 cr.\nPrerequisite knowledge will be developed in class.");
    const { records } = extractCatalogueText(fixture, source);
    assert.equal(records[0].course.prerequisites, "Pre/corequisite DEMO 101.");
    assert.equal(records[1].course.prerequisites, "");
  });
  it("preserves explicitly stated prose prerequisites including subject knowledge", () => {
    const requirement = "The course prerequisites are undergraduate physics, chemistry, calculus, and probability and statistics.";
    const { records } = extractCatalogueText(text(`DEMO 334 Example Atmospheres 3 cr.\nStudents study atmospheric processes. ${requirement}`), source);
    assert.equal(records[0].course.prerequisites, requirement);
    assert.deepEqual(records[0].issues, []);
  });
  it("holds repeatability notes with consent conditions when no description is published", () => {
    const fixture = text("DEMO 351 Special Topics 3 cr.\nMay be repeated for credit with consent of the department.\n\nDEMO 352 Example Topics 3 cr.\nStudents study mathematical models. May be repeated for credit with consent of the department.");
    const { records } = extractCatalogueText(fixture, source);
    assert.ok(records[0].issues.includes("description_contains_only_registration_metadata"));
    assert.deepEqual(records[1].issues, []);
  });
  it("holds repeatability notes followed only by prerequisites", () => {
    const { records } = extractCatalogueText(text("DEMO 231 Special Topics 3 cr.\nMay be repeated for credit. Prerequisite: consent of department."), source);
    assert.ok(records[0].issues.includes("description_contains_only_requirements"));
  });
  it("stops descriptions at degree-credit tables", () => {
    const { records } = extractCatalogueText(text("DEMO 274 More Mathematics 3.0, 3 cr.\nA description. Prerequisite: DEMO 100.\n\nBA in Example Studies: 39 Credits in Example Studies\nModes of Analysis and curriculum data"), source);
    assert.equal(records[0].course.description, "A description. Prerequisite: DEMO 100.");
    assert.deepEqual(records[0].issues, []);
  });
  it("keeps program, elective and transfer sections out of course descriptions", () => {
    for (const heading of ["MA in Financial Economics", "Electives (one course: 3 credits)", "Transfers Between the Two Programs"]) {
      const fixture = text(`DEMO 399 Thesis 9 cr.\nThesis.\n\n${heading}\nStudents must complete the following program requirements.`);
      const { records } = extractCatalogueText(fixture, source);
      assert.equal(records[0].course.description, "Thesis.");
      assert.deepEqual(records[0].issues, []);
    }
  });
  it("holds different-topic repeatability notes followed only by registration requirements", () => {
    const fixture = text("DEMO 290 Special Topics 3 cr.\nMay be repeated for credit on different topics. Prerequisite: junior or senior standing. Annually.\n\nDEMO 291 Research Methods 3 cr.\nStudents study econometric models. May be repeated for credit on different topics.");
    const { records } = extractCatalogueText(fixture, source);
    assert.ok(records[0].issues.includes("description_contains_only_requirements"));
    assert.deepEqual(records[1].issues, []);
  });
  it("stops a final course before a summed-credit curriculum heading on the next page", () => {
    for (const heading of ["34 + 6 Credits in Example Studies", "36 Credits"]) {
      const fixture = text("DEMO 299 Independent Study 3 cr.\nIndependent research with a project report. Every term.") + `\fFaculty of Example Studies 2026-27\n\n${heading}\n\nModes of Analysis and curriculum rows`;
      const { records } = extractCatalogueText(fixture, source);
      assert.equal(records[0].course.description, "Independent research with a project report. Every term.");
      assert.deepEqual(records[0].issues, []);
    }
  });
  it("holds schedule-only descriptions and requirements preceded by schedule metadata", () => {
    const fixture = text("DEMO 334 Example Topics 3 cr.\nAnnually.\n\nDEMO 480 Example Exam 0 cr.\nEvery term. Prerequisite: DEMO 334.\n\nDEMO 481 Example Methods 3 cr.\nAnnually, students study mathematical methods.");
    const { records } = extractCatalogueText(fixture, source);
    assert.ok(records[0].issues.includes("description_contains_only_schedule"));
    assert.ok(records[1].issues.includes("description_contains_only_requirements"));
    assert.deepEqual(records[2].issues, []);
  });
  it("holds repeatability notes without a description while retaining actual topic descriptions", () => {
    const fixture = text("DEMO 335 Special Topics 3 cr.\nMay be repeated for credit. Annually.\n\nDEMO 397 Tutorial 3 cr.\nMay not be repeated for a credit.\n\nDEMO 398 Example Topics 3 cr.\nStudents study mathematical models. May be repeated for credit. Annually.");
    const { records } = extractCatalogueText(fixture, source);
    assert.ok(records[0].issues.includes("description_contains_only_registration_metadata"));
    assert.ok(records[1].issues.includes("description_contains_only_registration_metadata"));
    assert.deepEqual(records[2].issues, []);
    assert.deepEqual(buildCatalogue([{ records, warnings: [] }]).courses.map((course) => course.code), ["DEMO 398"]);
  });
  it("keeps old course numbers and equivalences out of prerequisites without losing source notes", () => {
    const fixture = text("DEMO 240 Example Systems 3.0; 3 cr.\nA systems description. Prerequisite: DEMO 221 or EXAM 321. This course was previously numbered DEMO 272. This course is equivalent to EXAM 432.\n\nDEMO 241 Example Programming 3.0; 3 cr.\nA programming description. Prerequisite: a minimum grade of C+ in either DEMO 202 or EXAM 330. This course was previously numbered DEMO 273.");
    const { records } = extractCatalogueText(fixture, source);
    assert.equal(records[0].course.prerequisites, "Prerequisite: DEMO 221 or EXAM 321.");
    assert.equal(records[1].course.prerequisites, "Prerequisite: a minimum grade of C+ in either DEMO 202 or EXAM 330.");
    assert.match(records[0].course.description, /previously numbered DEMO 272\. This course is equivalent to EXAM 432\./);
    assert.match(records[1].course.description, /previously numbered DEMO 273\./);
    assert.ok(records.every((record) => record.issues.length === 0));
  });
  it("preserves grouped AND/OR prerequisites, decimal grades, permissions and later corequisites", () => {
    const requirements = "Prerequisites: DEMO 203 or a minimum grade of C+ in either DEMO 201 or EXAM 230, and one of the following (STAT 201, STAT 210, or STAT 230), and MATH 218 or MATH 219. A minimum GPA of 2.3 and instructor permission are required.";
    const fixture = text(`DEMO 261 Example Learning 3.1; 3 cr.\nA learning description. ${requirements} This course was previously numbered DEMO 287. This course is equivalent to EXAM 490. Corequisite: DEMO 210.`);
    const { records } = extractCatalogueText(fixture, source);
    assert.equal(records[0].course.credits, 3);
    assert.equal(records[0].course.prerequisites, `${requirements} Corequisite: DEMO 210.`);
  });
  it("retains ambiguous notes rather than guessing how to split an equivalence condition", () => {
    const requirements = "Prerequisite: DEMO 100. This course is equivalent to EXAM 200 only with instructor approval. Students must have completed the laboratory.";
    const { records } = extractCatalogueText(text(`DEMO 201 Examples 3 cr.\nA description. ${requirements}`), source);
    assert.equal(records[0].course.prerequisites, requirements);
  });
  it("keeps explicitly labelled former course numbers in the description rather than prerequisites", () => {
    for (const label of ["Formerly:", "Previously"]) {
      const { records } = extractCatalogueText(text(`DEMO 248 Example Science 3 cr.\nA science description. Prerequisite: Senior Standing. ${label} DEMO 290AO.`), source);
      assert.equal(records[0].course.prerequisites, "Prerequisite: Senior Standing.");
      assert.ok(records[0].course.description.endsWith(`${label} DEMO 290AO.`));
    }
  });
  it("joins wrapped academic units without mistaking prose for a department", () => {
    const fixture = "Department of Example and\nApplied Studies\nChairperson Example, Person\n\nDepartment of Other Studies provides students with useful skills\n\nDEMO 101 Examples 3 cr.\nA description.";
    const { records } = extractCatalogueText(fixture, source);
    assert.equal(records[0].course.department, "Department of Example and Applied Studies");
  });
  it("retains parenthesized acronyms on wrapped unit headings", () => {
    const fixture = "Center for Example\nStudies (CES)\nDirector Example, Person\n\nDEMO 101 Examples 3 cr.\nA description.";
    const { records } = extractCatalogueText(fixture, source);
    assert.equal(records[0].course.department, "Center for Example Studies (CES)");
  });
  it("changes ownership when a named program follows a department", () => {
    const fixture = text("DEMO 101 Examples 3 cr.\nA description.\n\nThe Example Program in\nHumanities (EPH)\n\nEXPH 201 Example Humanities 3 cr.\nAnother description.");
    const { records } = extractCatalogueText(fixture, { ...source, units: ["The Example Program in Humanities (EPH)"] });
    assert.equal(records[1].course.department, "The Example Program in Humanities (EPH)");
  });
  it("keeps a department through internal degree-program subheadings", () => {
    const fixture = "Department of Example Studies\n\nMaster of Science Program\n\nCourse Descriptions\nDEMO 301 Examples 3 cr.\nA description.";
    const { records } = extractCatalogueText(fixture, { ...source, units: ["Department of Example Studies"] });
    assert.equal(records[0].course.department, "Department of Example Studies");
  });
  it("recognizes named academic units wrapped across four PDF lines", () => {
    const unit = "The Example Center for International Cooperation and Academic Studies (EICAS)";
    const fixture = text("DEMO 101 Examples 3 cr.\nA description.\n\nThe Example Center for\nInternational Cooperation\nand Academic Studies\n(EICAS)\n\nEXPH 201 More Examples 3 cr.\nAnother description.");
    const { records } = extractCatalogueText(fixture, { ...source, units: [unit] });
    assert.equal(records[1].course.department, unit);
  });
  it("keeps descriptions spanning PDF page headers and tracks the starting PDF page", () => {
    const fixture = text("DEMO 101 Examples 3 cr.\nA description continues") + "\fFaculty of Example Studies 2026-27\n\nonto this page.\n\nDEMO 102 Next Example 3 cr.\nA second description.\n43\n";
    const { records } = extractCatalogueText(fixture, source);
    assert.match(records[0].course.description, /continues onto this page/);
    assert.equal(records[0].source.page, 1);
    assert.equal(records[1].source.page, 2);
  });
  it("does not treat code references or sentences mentioning courses as headings", () => {
    const fixture = text("DEMO 101 Examples 3 cr.\nStudents taking courses will learn techniques. It builds on\nDEMO 100 or an equivalent introduction.\n\nSpecial Courses\nDEMO 102 More Examples 0 cr.\nA second description.");
    const { records } = extractCatalogueText(fixture, source);
    assert.equal(records.length, 2);
    assert.match(records[0].course.description, /DEMO 100 or an equivalent/);
    assert.doesNotMatch(records[0].course.description, /Special Courses/);
    assert.equal(records[1].course.credits, 0);
  });
  it("keeps wrapped prerequisite references before repeat-credit limits in the description", () => {
    const fixture = text("DEMO 210 Medieval Literature 3 cr.\nA survey of literature. Prerequisite:\nDEMO 203 or higher, based on placement. Occasionally. May be repeated for credit for a maximum of 6\ncredits.\n\nDEMO 244 Special Topics 3 cr.\nA second description. Prerequisite:\nDEMO 203 or higher. May be repeated for credit for a maximum of 6\ncredits.");
    const { records } = extractCatalogueText(fixture, source);
    assert.deepEqual(records.map((record) => record.course.code), ["DEMO 210", "DEMO 244"]);
    for (const record of records) {
      assert.match(record.course.description, /maximum of 6 credits\.$/);
      assert.match(record.course.prerequisites, /^Prerequisite: DEMO 203 or higher/);
    }
  });
  it("ends descriptions before mission statements and additional course options", () => {
    const fixture = text("DEMO 300 Graduate Writing 0 cr.\nA course in writing.\n\nMission Statement\nThe department offers graduate programs.\n\nDEMO 313 Translation 3 cr.\nA course in translation.\n\nAdditional Course Options\nDEMO 314 Special Topics 3 cr.\nA third description.");
    const { records } = extractCatalogueText(fixture, source);
    assert.equal(records[0].course.description, "A course in writing.");
    assert.equal(records[1].course.description, "A course in translation.");
    assert.equal(records.length, 3);
  });
  it("holds variable credits, multiple course codes and missing departments for review", () => {
    const fixture = "DEMO 101 Variable Study 1–3 cr.\nA description.\n\nDEMO 201/202 Paired Courses 3 cr.\nAnother description.";
    const result = buildCatalogue([extractCatalogueText(fixture, source)]);
    assert.equal(result.courses.length, 0);
    assert.equal(result.review.length, 2);
    assert.ok(result.review[0].issues.includes("variable_or_ambiguous_credits"));
    assert.ok(result.review[0].issues.includes("department_not_identified"));
    assert.ok(result.review[1].issues.includes("multiple_or_ambiguous_course_codes"));
  });
  it("retains unrecognized course-like lines in coverage warnings", () => {
    const result = extractCatalogueText(text("DEMO 999 Unusual Format\nA description without a credit label."), source);
    assert.equal(result.records.length, 0);
    assert.equal(result.warnings.length, 1);
    assert.equal(result.warnings[0].reason, "unparsed_course_like_line");
  });
  it("does not turn a study-plan row and the next term's credit heading into a course", () => {
    const fixture = text("DEMO 208                     3\nTerm 2                       Credits\nEXAM 210                     3\n\nCourse Descriptions\nDEMO 208 Computing Examples 3.2; 3 cr.\nA real course description.");
    const { records, warnings } = extractCatalogueText(fixture, source);
    assert.equal(records.length, 1);
    assert.equal(records[0].course.name, "Computing Examples");
    assert.equal(records[0].course.credits, 3);
    assert.ok(warnings.some((item) => item.text.startsWith("DEMO 208")));
    assert.deepEqual(buildCatalogue([{ records, warnings }]).review, []);
  });
  it("excludes missing descriptions and uncertain paragraph boundaries", () => {
    const fixture = text("DEMO 101 No Description 3 cr.\n\nDEMO 102 Long Description 3 cr.\nFirst paragraph.\n\nSecond paragraph to review.");
    const result = buildCatalogue([extractCatalogueText(fixture, source)]);
    assert.equal(result.courses.length, 0);
    assert.equal(result.review.length, 2);
  });
  it("deduplicates identical records with both sources and holds conflicting duplicates", () => {
    const a = extractCatalogueText(text("DEMO 101 Examples 3 cr.\nA description."), source);
    const b = extractCatalogueText(text("DEMO 101 Examples 3 cr.\nA description."), { ...source, level: "gr" });
    const merged = buildCatalogue([a, b]);
    assert.equal(merged.courses.length, 1);
    assert.equal(merged.provenance[0].sources.length, 2);
    const changed = extractCatalogueText(text("DEMO 101 Different Title 3 cr.\nA description."), source);
    const conflicts = buildCatalogue([a, changed]);
    assert.equal(conflicts.courses.length, 0);
    assert.ok(conflicts.review[0].issues.includes("conflicting_duplicate_code"));
  });
  it("round trips commas, quotes and Arabic through the actual importer", () => {
    const fixture = text('DEMO 101 Examples 3 cr.\nمقدمة, with "quoted" material.');
    const result = buildCatalogue([extractCatalogueText(fixture, source)]);
    assert.deepEqual(parseCourseCatalogue(toCSV(result.courses)), result.courses);
  });
});
