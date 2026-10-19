/** Pure extraction helpers. Uncertain records go to review, never to the CSV. */
import { parseCourseCatalogue } from "../import-courses.mjs";

export const COLUMNS = ["code", "name", "description", "credits", "prerequisites", "department"];
// Recognize every code in a cross-listing as a heading boundary. Combined
// codes still fail the single-registration check and require manual review.
const CODE_START = /^([A-Z]{2,8}(?:\s*\/\s*[A-Z]{2,8})?)\s*(\d{2,4}[A-Z]*(?:\s*[/–-]\s*(?:(?:[A-Z]{2,8}\s*)?\d{2,4}[A-Z]*|[A-Z]))*)\s+(.+)/;
const CREDIT_END = /(?:\s+|(?<=[;,]))(\d+(?:\.\d+)?(?:\s*[-–—/]\s*\d+(?:\.\d+)?)?|\d+(?:\s*(?:,(?:\s*or)?|\bor\b)\s*\d+)+)\s*cr(?:edits?)?\.?(?:\s+\(each\))?\s*$/i;
const REQUIREMENT_LABEL = /\b(?:pre(?:-?requisites?)?\s*(?:\/|-?\s*and|or)\s*co[- ]?requisites?|pre[- ]?requisites?|co[- ]?requisites?|requisites?)(?:\s*:|\s+(?=[A-Z]{2,8}\s*\d{2,4}[A-Z]*\b))|\bprerequisites?(?:\s+course\s*:|\s+is\b|\s+for\s+the\s+course\s+include\b|\s+for\s+[A-Z]+\s+students\s+only\s*:|\s+at\s+least\b|\.(?=\s+[A-Z]{2,8}\s*\d))|\b(?:the|this)\s+course\s+prerequisites?\s+(?:are|is)\b/i;

function clean(text) {
  return text.normalize("NFKC").replace(/[\u00ad\u200b-\u200d\ufeff]/g, "").replace(/\u0002/g, "");
}

export function toCSV(courses) {
  const quote = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [COLUMNS.join(","), ...courses.map((course) => COLUMNS.map((column) => quote(course[column])).join(","))].join("\n") + "\n";
}

function decodeHTML(text) {
  return text.replace(/&#(x[0-9a-f]+|\d+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code.replace(/^x/i, ""), /^x/i.test(code) ? 16 : 10)))
    .replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

export function catalogueURL(value, year) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !["www.aub.edu.lb", "aub.edu.lb", "www.aub.edu", "aub.edu"].includes(url.hostname) ||
      url.username || url.password || url.port || url.search || url.hash ||
      !url.pathname.toLowerCase().startsWith(`/registrar/catalogue${year}/`)) {
    throw new Error(`Source must be an official HTTPS AUB catalogue URL for ${year}: ${value}`);
  }
  return url.href;
}

export function extractLinks(html, baseURL) {
  const links = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = match[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if (!href) continue;
    try {
      links.push({ url: new URL(decodeHTML(href[1] ?? href[2]), baseURL).href,
        text: clean(decodeHTML(match[2].replace(/<[^>]*>/g, " "))).replace(/\s+/g, " ").trim() });
    } catch { /* Navigation fragments and malformed links are not sources. */ }
  }
  return links;
}

export function discoverFacultyLinks(html, indexURL, year) {
  const found = new Map();
  for (const link of extractLinks(html, indexURL)) {
    if (!/^Section\s+\d+\s*[-–—]/i.test(link.text) ||
        !/\bFaculty of\b|\bSchool of\b|Division of University Interdisciplinary/i.test(link.text)) continue;
    catalogueURL(link.url, year);
    found.set(link.url, { landing_url: link.url, faculty: link.text.replace(/^Section\s+\d+\s*[-–—]\s*/i, "") });
  }
  if (found.size === 0) throw new Error(`No faculty links discovered at ${indexURL}; catalogue layout needs review.`);
  return [...found.values()];
}

export function discoverFacultyPDF(html, landingURL, year) {
  const links = extractLinks(html, landingURL).filter((link) => /^Download\b/i.test(link.text) && /\.pdf$/i.test(link.url));
  const unique = [...new Set(links.map((link) => catalogueURL(link.url, year)))];
  if (unique.length !== 1) throw new Error(`Expected one faculty PDF at ${landingURL}; found ${unique.length}.`);
  return unique[0];
}

export function discoverAcademicUnits(html, landingURL, year) {
  return [...new Set(extractLinks(html, landingURL).filter((link) => {
    if (!/\b(?:Department|Program|Center|Centre|Division|School|Humanities)\b/.test(link.text) ||
        /Courses?\s*$|Download|Section\s+\d/i.test(link.text) || !academicUnitLabel(link.text)) return false;
    try { catalogueURL(link.url, year); return true; } catch { return false; }
  }).map((link) => link.text))];
}

const unitKey = (text) => clean(text).toLowerCase().replace(/^the\s+/, "").replace(/[^\p{L}\p{N}]+/gu, "");

function academicUnitLabel(text) {
  return !/^(?:Undergraduate|Graduate)\s+Program\s*:/i.test(text);
}

function academicUnitAt(lines, index, units) {
  for (let size = 1; size <= 5 && index + size <= lines.length; size += 1) {
    const candidate = lines.slice(index, index + size).map((item) => item.text).join(" ");
    if (units.has(unitKey(candidate))) return { name: units.get(unitKey(candidate)), size };
    if (!lines[index + size - 1].text) break;
  }
  return null;
}

function unresolvedUnitHeading(text) {
  return titleCase(text) && /\b(?:Program|Center|Centre|Division|Humanities)\b/.test(text) &&
    !/Courses?|Requirements|Objectives|Outcomes|Study|Officers?|Undergraduate|Graduate/.test(text);
}

function heading(text) {
  return /^(?:Course Descriptions?|(?:[\w,&()/-]+\s+){0,10}Courses)\s*$/i.test(text) ||
    (/^(?:BA|BS|BBA|MA|MS|MBA|PhD)\s+in\s+/.test(text) && titleCase(text)) ||
    /^(?:Mission Statement|Additional Course Options|Transfers? Between (?:the )?(?:Two )?Programs|Electives(?:\s*\([^)]*\))?)\s*$/i.test(text) ||
    /^(?:Art History Program|Architecture Professional Practice|(?:Elective Courses )?Category [A-Z]:|Specialization Electives:|Major in .+:\s*\d+\s+Credits)/.test(text) ||
    /^(?:BA|BS|BBA|MA|MS|MBA|PhD)\s+in\s+.+:\s*\d+\s+Credits\b/i.test(text) ||
    /^(?:(?:Sample\s+)?(?:Study Plan|Curriculum(?=\s*$|\s*[:(])|Degree Requirements)|(?:\d+(?:\s*\+\s*\d+)*\s+)?Credits(?:\s+in\b|\s*$)|Modes of Analysis|Program Requirements|Major Requirements|Minor in\b|Notes?:)/i.test(text);
}

function titleCase(text) {
  return text.length < 120 && text.split(/\s+/).every((word) =>
    /^(?:of|and|for|the|in|at|or)$/.test(word) || /^[A-Z][A-Za-z'’(),./-]*$/.test(word.replace(/^\(/, "")));
}

function departmentHeading(text) {
  return /^(?:Department|Division|School|Center|Centre) (?:of|for) [A-Z]/.test(text) && titleCase(text);
}

function prepareLines(text) {
  return text.split("\f").flatMap((page, index) => {
    const lines = clean(page).replace(/\r\n?/g, "\n").split("\n")
      .filter((line) => !/^\s*\d+\s*$/.test(line) &&
        !/(?:Faculty|School|Division|Catalogue|Graduate|Undergraduate).*20\d\d\s*[-–]\s*\d{2,4}\s*$/.test(line));
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    return lines.map((line) => ({ text: line.trim(), page: index + 1 }));
  });
}

function parseHeader(lines, index) {
  if (!CODE_START.test(lines[index].text)) return null;
  // Wrapped requirements may end in a repeat-credit limit, which otherwise
  // resembles a multi-line course title and credit label.
  if (/^(?:or|and)\b/.test(lines[index].text.match(CODE_START)[3])) return null;
  // Titles/credit labels can wrap. Never consume the next course as a title.
  for (let size = 1; size <= 3 && index + size <= lines.length; size += 1) {
    if (size > 1 && (CODE_START.test(lines[index + size - 1].text) || !lines[index + size - 1].text)) break;
    const text = lines.slice(index, index + size).map((line) => line.text).join(" ");
    const match = text.match(CODE_START);
    const credit = match[3].match(CREDIT_END);
    if (!credit) continue;
    const name = match[3].slice(0, credit.index)
      .replace(/\s+\d+(?:[.,:]\d+)+(?:\s*[-–—]\s*\d+(?:[.,:]\d+)*)?\s*[;,:]?\s*$/, "").replace(/;\s*$/, "").trim();
    // A study-plan row followed by "Term 2 Credits" can look like a
    // wrapped course heading (e.g. "CMPS 208 3 Term 2 Credits").
    if (/^\d+\s+(?:Term|Semester|Year)$/i.test(name)) return null;
    return { code: `${match[1].replace(/\s/g, "")} ${match[2].replace(/\s/g, "")}`, name,
      integer_contact_hours: /\s+\d+\s*[;,]\s*$/.test(match[3].slice(0, credit.index)),
      credit_label: credit[1], end: index + size, header: text };
  }
  return null;
}

function prerequisiteText(description) {
  const label = description.match(REQUIREMENT_LABEL);
  if (!label) return "";
  // Retain the complete requirement wording, including subsequent restrictions
  // and corequisites. Remove only explicit, single-code catalogue metadata
  // sentences; they remain available in the full source description.
  return description.slice(label.index)
    .replace(/(?:^|(?<=[.!?])\s+)(?:This course (?:was previously (?:numbered|offered as)|is equivalent to)\s+|Equivalent to:?\s*|Formerly:?\s*|Previously\s+)[A-Z]{2,8}\s+\d{2,4}[A-Z]*\.(?=\s|$)/g, " ")
    .replace(/\s+\(Students who receive credits? for [A-Z]{2,8}\s+\d{2,4}[A-Z]* cannot receive credit for [A-Z]{2,8}\s+\d{2,4}[A-Z]*\. Spring only\)\./g, " ")
    .replace(/(?:^|(?<=[.!?])\s+)(?:Students cannot (?:receive|earn|get) credit for both [^.!?]*\.|Students who receive credits? for [A-Z]{2,8}\s+\d{2,4}[A-Z]* cannot receive credit for [A-Z]{2,8}\s+\d{2,4}[A-Z]*\.)/g, " ")
    .replace(/(?:^|(?<=[.!?])\s+)May(?: not)? be repeated for credits?(?: when topics vary)?\.(?=\s|$)/g, " ")
    .replace(/(?:^|(?<=[.!?])\s+)(?:Annually|Biennially|Occasionally|Every term|Alternate years|Alternate semesters|First term|Second term|Third term|Fall|Spring|Summer|Offered on demand|Offered in the (?:summer|fall|spring) term only)\.(?=\s|$)/gi, " ")
    .replace(/\s+/g, " ").trim();
}

export function extractCatalogueText(text, source) {
  const lines = prepareLines(text);
  const records = [];
  const warnings = [];
  let department = source.department || "";
  // These printed chapter names are absent from the catalogue landing-page
  // unit links. Recognize their exact PDF headings to avoid inheriting the
  // preceding, unrelated program's department label.
  const pdfUnits = source.units?.length ? ["Master of Science in Business Analytics (MSBA)",
    "MS in Rural Community Development (RCODE)", "Graduate Studies in Biomedical Sciences"] : [];
  const units = new Map([...(source.units || []), ...pdfUnits].filter(academicUnitLabel).map((unit) => [unitKey(unit), unit]));
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const namedUnit = academicUnitAt(lines, index, units);
    if (namedUnit) {
      department = namedUnit.name;
      index += namedUnit.size - 1;
      continue;
    }
    if (departmentHeading(line.text)) {
      department = line.text;
      // AUB often wraps a unit's name directly onto a second title-case line.
      const continuation = lines[index + 1]?.text;
      if (continuation && titleCase(continuation) && !departmentHeading(continuation) &&
          !/^(?:Chair(?:person|man|woman)?|Professors?|Directors?|Deans?|Associate|Assistant|Lecturers?|Instructors?|Officers?|Mission|Undergraduate|Graduate|Courses?)\b/.test(continuation)) {
        department += ` ${continuation}`;
        index += 1;
      }
      continue;
    }
    // Without official unit metadata, do not carry a preceding department
    // through a named program/center section and silently mislabel its courses.
    if (units.size === 0 && unresolvedUnitHeading(line.text)) {
      department = "";
    }
    if (!CODE_START.test(line.text)) continue;
    const header = parseHeader(lines, index);
    if (!header) {
      // Retain unmatched course-like lines for coverage review. Some are
      // study-plan references, others can reveal a new catalogue format.
      warnings.push({ reason: "unparsed_course_like_line", page: line.page, text: line.text, source: source.url });
      continue;
    }
    const body = [];
    let uncertainBoundary = false;
    let end = header.end;
    for (; end < lines.length; end += 1) {
      const next = lines[end].text;
      const possibleCode = next.match(CODE_START);
      // A reference wrapped inside prose ("CMPS 201 or ...") is not a new
      // course heading. Uppercase title-like unmatched lines are boundaries
      // and will be retained in the coverage warnings by the outer loop.
      const nextHeader = possibleCode && parseHeader(lines, end);
      const detachedSuffixReference = possibleCode && /^[A-Z]\s+(?:is|are|was|were|introduces|provides|covers)\b/.test(possibleCode[3]);
      if (possibleCode && (nextHeader || (/^[A-Z]/.test(possibleCode[3]) && !detachedSuffixReference))) {
        uncertainBoundary = !nextHeader;
        break;
      }
      if (departmentHeading(next) || (next && heading(next)) || academicUnitAt(lines, end, units) ||
          (units.size === 0 && unresolvedUnitHeading(next))) break;
      body.push(next);
    }
    const paragraphs = body.join("\n").trim().split(/\n\s*\n/).filter(Boolean);
    const description = paragraphs.map((paragraph) => paragraph.replace(/\s+/g, " ")).join("\n\n");
    const issues = [];
    if (header.integer_contact_hours) issues.push("possible_integer_contact_hours_in_title");
    if (uncertainBoundary) issues.push("unparsed_description_boundary");
    if (/\b[A-Z]{2,8}\s+\d{2,4}\b/.test(header.name)) issues.push("possible_merged_course_headings");
    if (!/^\d+(?:\.\d{1,2})?$/.test(header.credit_label)) issues.push("variable_or_ambiguous_credits");
    if (/\bcr(?:edits?)?\b/i.test(header.name)) issues.push("ambiguous_credit_label");
    if (/[A-Za-z]\d+\.\d+\s*[;,]?$/.test(header.name)) issues.push("possible_contact_hours_in_title");
    if (!/^[A-Z]{2,8} \d{2,4}[A-Z]*$/.test(header.code) || /^[(/]/.test(header.name)) issues.push("multiple_or_ambiguous_course_codes");
    if (!department) issues.push("department_not_identified");
    if (paragraphs.length > 1) issues.push("multiple_paragraphs_check_boundary");
    if (/\uFFFD/.test(description + header.name)) issues.push("unreadable_pdf_text");
    const withoutSchedule = description.replace(/\b(?:Annually|Biennially|Occasionally|Every term)\.?(?=\s|$)/gi, "").trim();
    if (description && !withoutSchedule) issues.push("description_contains_only_schedule");
    const withoutRegistration = withoutSchedule.replace(/\b(?:This course )?May(?: not)? be repeated for (?:a )?credits?(?: on different topics)?(?: with (?:the )?consent of (?:the )?(?:department|instructor|advis[eo]r))?\.?(?=\s|$)/gi, "").trim();
    if (withoutSchedule && !withoutRegistration) issues.push("description_contains_only_registration_metadata");
    if (withoutRegistration.match(REQUIREMENT_LABEL)?.index === 0) issues.push("description_contains_only_requirements");
    if (/\b(?:Course Number|Course Title|Understanding Communication|Modes of Analysis)\b/.test(description)) issues.push("possible_curriculum_table");
    const course = { code: header.code, name: header.name, description,
      credits: /^\d+(?:\.\d{1,2})?$/.test(header.credit_label) ? Number(header.credit_label) : null,
      prerequisites: prerequisiteText(description), department };
    try { parseCourseCatalogue(toCSV([course])); }
    catch (error) { issues.push(`importer_validation: ${error.message}`); }
    records.push({ course, issues, source: { url: source.url, faculty: source.faculty, level: source.level,
      page: line.page, department, header: header.header, credit_label: header.credit_label } });
    index = Math.max(index, end - 1);
  }
  return { records, warnings };
}

export function buildCatalogue(extractions) {
  const groups = new Map();
  const review = [];
  const warnings = [];
  for (const extraction of extractions) {
    warnings.push(...extraction.warnings);
    for (const record of extraction.records) {
      if (!groups.has(record.course.code)) groups.set(record.course.code, []);
      groups.get(record.course.code).push(record);
    }
  }
  const courses = [];
  const provenance = [];
  for (const [code, records] of [...groups].sort(([a], [b]) => a.localeCompare(b, "en"))) {
    const signatures = new Set(records.map((record) => JSON.stringify(record.course)));
    const issues = [...new Set(records.flatMap((record) => record.issues))];
    if (signatures.size > 1) issues.push("conflicting_duplicate_code");
    if (issues.length) {
      review.push({ code, issues, records });
    } else {
      courses.push(records[0].course);
      provenance.push({ code, sources: records.map((record) => record.source) });
    }
  }
  // Reuse the existing importer's exact contract for the final combined CSV.
  if (courses.length) parseCourseCatalogue(toCSV(courses));
  return { courses, provenance, review, warnings };
}
