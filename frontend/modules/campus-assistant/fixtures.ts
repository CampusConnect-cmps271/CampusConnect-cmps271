import type { EvidenceChunk } from "./schema";

/** Deterministic evidence for tests. Not a stand-in for the stored sources in production. */
export const REGISTRAR_CHUNK: EvidenceChunk = {
  chunk_id: "registrar:0",
  source_id: "registrar",
  url: "https://www.aub.edu.lb/registrar/Pages/default.aspx",
  title: "Office of the Registrar",
  retrieved_at: "2026-10-24T08:00:00.000Z",
  text: "The Office of the Registrar manages student records, course registration, and issues transcripts and certificates.",
};

export const LIBRARY_CHUNK: EvidenceChunk = {
  chunk_id: "libraries:0",
  source_id: "libraries",
  url: "https://www.aub.edu.lb/libraries/Pages/default.aspx",
  title: "University Libraries",
  retrieved_at: "2026-10-24T08:00:00.000Z",
  text: "The libraries offer research support, library instruction and document delivery.",
};

export const COURSE_CHUNK: EvidenceChunk = {
  chunk_id: "course:CMPS 271",
  source_id: "course-catalogue",
  url: "/courses/CMPS-271",
  title: "CMPS 271 · Software Engineering",
  retrieved_at: null,
  text: "Course CMPS 271: Software Engineering. Department: Computer Science. Credits: 3. Prerequisites: CMPS 200. Description: Team-based software development.",
};

/** A provider reply as the model would write it. */
export const reply = (answer: string, ids: string[], insufficient = false) =>
  JSON.stringify({ answer, citation_chunk_ids: ids, insufficient_evidence: insufficient });
