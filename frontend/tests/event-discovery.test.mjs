
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

async function readMigration(filename) {
  const contents = await readFile(
    new URL(
      `../../supabase/migrations/${filename}`,
      import.meta.url,
    ),
    "utf8",
  );

  return contents.replace(/^\uFEFF/, "");
}

const migrationNames = [
  "20261005010000_roles_and_permissions.sql",
  "20261024120000_create_events.sql",
  "20261024130000_protect_event_ownership.sql",
  "20261028150000_event_management_rules.sql",
  "20261030190000_event_discovery_queries.sql",
  "20261030200000_event_discovery_categories.sql",
];

const migrations = await Promise.all(
  migrationNames.map(readMigration),
);

const users = {
  organizer: "40000000-0000-4000-8000-000000000001",
  student: "40000000-0000-4000-8000-000000000002",
  other: "40000000-0000-4000-8000-000000000003",
};

const foundation = `
  create role anon;
  create role authenticated;
  create role service_role;

  create schema auth;

  create table auth.users (
    id uuid primary key,
    email text
  );

  create function auth.uid()
  returns uuid
  language sql
  stable
  as $$
    select nullif(
      current_setting('request.jwt.claim.sub', true), ''
    )::uuid;
  $$;

  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;

  insert into auth.users (id, email) values
    ('${users.organizer}', 'organizer@aub.edu'),
    ('${users.student}', 'student@aub.edu'),
    ('${users.other}', 'other@aub.edu');
`;

async function asUser(db, userId, callback) {
  await db.exec(`
    set role authenticated;
    set request.jwt.claim.sub = '${userId}';
  `);

  try {
    return await callback();
  } finally {
    await db.exec(
      "reset role; reset request.jwt.claim.sub;",
    );
  }
}

async function insertEvent(db, options = {}) {
  const event = {
    organizerId: users.organizer,
    title: "Campus Event",
    description: "Event details",
    startsAt: "2099-11-15T12:00:00Z",
    endsAt: "2099-11-15T14:00:00Z",
    category: "Academics",
    status: "published",
    ...options,
  };

  const result = await db.query(
    `insert into public.events (
      organizer_id,
      title,
      description,
      starts_at,
      ends_at,
      timezone,
      location,
      category,
      status
    )
    values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    returning id, title, status, category, starts_at`,
    [
      event.organizerId,
      event.title,
      event.description,
      event.startsAt,
      event.endsAt,
      "Asia/Beirut",
      "AUB Campus",
      event.category,
      event.status,
    ],
  );

  return result.rows[0];
}

async function discover(db, options = {}) {
  const params = {
    category: null,
    startDate: null,
    endDate: null,
    limit: 21,
    offset: 0,
    includePast: false,
    ...options,
  };

  return db.query(
    `select *
     from public.list_published_events(
       $1::text,
       $2::date,
       $3::date,
       $4::integer,
       $5::integer,
       $6::boolean
     )`,
    [
      params.category,
      params.startDate,
      params.endDate,
      params.limit,
      params.offset,
      params.includePast,
    ],
  );
}

async function getCategories(db) {
  return db.query(
    `select category
     from public.list_published_event_categories()`,
  );
}

describe("SP3-21 event discovery filters and boundaries", () => {
  let db;
  let records;

  before(async () => {
    db = new PGlite();

    await db.exec(foundation);

    for (const migration of migrations) {
      await db.exec(migration);
    }

    await db.exec(`
      update public.user_roles
      set role = 'club_representative'
      where user_id = '${users.organizer}';
    `);

    records = {};

    records.academic = await insertEvent(db, {
      title: "Academic Workshop",
      category: "Academics",
      startsAt: "2099-11-15T12:00:00Z",
      endsAt: "2099-11-15T14:00:00Z",
    });

    records.sports = await insertEvent(db, {
      title: "Sports Tournament",
      category: "Sports",
      startsAt: "2099-11-16T12:00:00Z",
      endsAt: "2099-11-16T14:00:00Z",
    });

    records.arts = await insertEvent(db, {
      title: "Art Exhibition",
      category: "Arts",
      startsAt: "2099-11-17T12:00:00Z",
      endsAt: "2099-11-17T14:00:00Z",
    });

    records.draft = await insertEvent(db, {
      title: "Private Draft",
      category: "Private",
      status: "draft",
    });

    records.cancelled = await insertEvent(db, {
      title: "Cancelled Workshop",
      category: "Cancelled",
      status: "cancelled",
    });

    records.past = await insertEvent(db, {
      title: "Past Workshop",
      category: "History",
      startsAt: "2020-01-10T10:00:00Z",
      endsAt: "2020-01-10T12:00:00Z",
    });

    records.winterBeforeMidnight = await insertEvent(db, {
      title: "Before Beirut Midnight",
      category: "Winter Boundary",
      startsAt: "2099-12-09T21:59:00Z",
      endsAt: "2099-12-09T22:30:00Z",
    });

    records.winterAtMidnight = await insertEvent(db, {
      title: "At Beirut Midnight",
      category: "Winter Boundary",
      startsAt: "2099-12-09T22:00:00Z",
      endsAt: "2099-12-10T00:00:00Z",
    });

    records.summerBeforeMidnight = await insertEvent(db, {
      title: "Before Summer Midnight",
      category: "Summer Boundary",
      startsAt: "2099-07-09T20:59:00Z",
      endsAt: "2099-07-09T21:30:00Z",
    });

    records.summerAtMidnight = await insertEvent(db, {
      title: "At Summer Midnight",
      category: "Summer Boundary",
      startsAt: "2099-07-09T21:00:00Z",
      endsAt: "2099-07-09T23:00:00Z",
    });

    records.equalFirst = await insertEvent(db, {
      title: "Same Start A",
      category: "Ordering",
      startsAt: "2099-08-01T12:00:00Z",
      endsAt: "2099-08-01T14:00:00Z",
    });

    records.equalSecond = await insertEvent(db, {
      title: "Same Start B",
      category: "Ordering",
      startsAt: "2099-08-01T12:00:00Z",
      endsAt: "2099-08-01T14:00:00Z",
    });
  });

  after(async () => {
    await db?.close();
  });

  it("shows only published upcoming events by default", async () => {
    await asUser(db, users.student, async () => {
      const result = await discover(db);

      assert.ok(result.rows.length > 0);

      for (const row of result.rows) {
        assert.equal(row.status, "published");
        assert.notEqual(row.id, records.draft.id);
        assert.notEqual(row.id, records.cancelled.id);
        assert.notEqual(row.id, records.past.id);
      }
    });
  });

  it("filters by the requested category", async () => {
    await asUser(db, users.student, async () => {
      const result = await discover(db, {
        category: "Sports",
      });

      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].id, records.sports.id);
    });
  });

  it("uses exact category matching", async () => {
    await asUser(db, users.student, async () => {
      const result = await discover(db, {
        category: "Sport",
      });

      assert.equal(result.rows.length, 0);
    });
  });

  it("returns an empty result when no category matches", async () => {
    await asUser(db, users.student, async () => {
      const result = await discover(db, {
        category: "Nonexistent Category",
      });

      assert.deepEqual(result.rows, []);
    });
  });

  it("resetting the category filter restores published results", async () => {
    await asUser(db, users.student, async () => {
      const filtered = await discover(db, {
        category: "Nonexistent Category",
      });

      const reset = await discover(db);

      assert.equal(filtered.rows.length, 0);
      assert.ok(reset.rows.length > 0);

      assert.ok(
        reset.rows.some(
          (row) => row.id === records.academic.id,
        ),
      );
    });
  });

  it("filters inclusively by Beirut start date", async () => {
    await asUser(db, users.student, async () => {
      const result = await discover(db, {
        category: "Academics",
        startDate: "2099-11-15",
        endDate: "2099-11-15",
      });

      assert.equal(result.rows.length, 1);
      assert.equal(result.rows[0].id, records.academic.id);
    });
  });

  it("excludes dates outside the selected range", async () => {
    await asUser(db, users.student, async () => {
      const result = await discover(db, {
        category: "Academics",
        startDate: "2099-11-16",
        endDate: "2099-11-20",
      });

      assert.equal(result.rows.length, 0);
    });
  });

  it("treats winter midnight as the next Beirut calendar day", async () => {
    await asUser(db, users.student, async () => {
      const result = await discover(db, {
        category: "Winter Boundary",
        startDate: "2099-12-10",
        endDate: "2099-12-10",
      });

      assert.equal(result.rows.length, 1);
      assert.equal(
        result.rows[0].id,
        records.winterAtMidnight.id,
      );
    });
  });

  it("keeps winter events just before midnight on the previous day", async () => {
    await asUser(db, users.student, async () => {
      const result = await discover(db, {
        category: "Winter Boundary",
        startDate: "2099-12-09",
        endDate: "2099-12-09",
      });

      assert.equal(result.rows.length, 1);
      assert.equal(
        result.rows[0].id,
        records.winterBeforeMidnight.id,
      );
    });
  });

  it("treats summer midnight using Beirut UTC+3", async () => {
    await asUser(db, users.student, async () => {
      const result = await discover(db, {
        category: "Summer Boundary",
        startDate: "2099-07-10",
        endDate: "2099-07-10",
      });

      assert.equal(result.rows.length, 1);
      assert.equal(
        result.rows[0].id,
        records.summerAtMidnight.id,
      );
    });
  });

  it("keeps summer events just before midnight on the previous day", async () => {
    await asUser(db, users.student, async () => {
      const result = await discover(db, {
        category: "Summer Boundary",
        startDate: "2099-07-09",
        endDate: "2099-07-09",
      });

      assert.equal(result.rows.length, 1);
      assert.equal(
        result.rows[0].id,
        records.summerBeforeMidnight.id,
      );
    });
  });

  it("rejects a reversed date range", async () => {
    await asUser(db, users.student, async () => {
      await assert.rejects(
        discover(db, {
          startDate: "2099-11-20",
          endDate: "2099-11-10",
        }),
        /End date cannot precede start date/,
      );
    });
  });

  it("includes past published events only when requested", async () => {
    await asUser(db, users.student, async () => {
      const upcoming = await discover(db, {
        category: "History",
      });

      const includingPast = await discover(db, {
        category: "History",
        includePast: true,
      });

      assert.equal(upcoming.rows.length, 0);
      assert.equal(includingPast.rows.length, 1);
      assert.equal(
        includingPast.rows[0].id,
        records.past.id,
      );
    });
  });

  it("never exposes drafts when past events are included", async () => {
    await asUser(db, users.student, async () => {
      const result = await discover(db, {
        includePast: true,
      });

      assert.ok(
        !result.rows.some(
          (row) => row.id === records.draft.id,
        ),
      );
    });
  });

  it("never exposes cancelled events when past events are included", async () => {
    await asUser(db, users.student, async () => {
      const result = await discover(db, {
        includePast: true,
      });

      assert.ok(
        !result.rows.some(
          (row) => row.id === records.cancelled.id,
        ),
      );
    });
  });

  it("orders events by start time and then ID", async () => {
    await asUser(db, users.student, async () => {
      const result = await discover(db, {
        includePast: true,
      });

      const keys = result.rows.map(
        (row) =>
          `${new Date(row.starts_at).toISOString()}|${row.id}`,
      );

      const sorted = [...keys].sort();

      assert.deepEqual(keys, sorted);
    });
  });

  it("uses event IDs to break equal-time ties", async () => {
    await asUser(db, users.student, async () => {
      const result = await discover(db, {
        category: "Ordering",
      });

      assert.equal(result.rows.length, 2);

      const ids = result.rows.map((row) => row.id);

      assert.deepEqual(ids, [...ids].sort());
    });
  });

  it("returns a bounded first page", async () => {
    await asUser(db, users.student, async () => {
      const result = await discover(db, {
        limit: 2,
        offset: 0,
      });

      assert.equal(result.rows.length, 2);
    });
  });

  it("returns the next page without duplicating the first", async () => {
    await asUser(db, users.student, async () => {
      const first = await discover(db, {
        limit: 2,
        offset: 0,
      });

      const second = await discover(db, {
        limit: 2,
        offset: 2,
      });

      assert.equal(first.rows.length, 2);
      assert.equal(second.rows.length, 2);

      const firstIds = new Set(
        first.rows.map((row) => row.id),
      );

      for (const row of second.rows) {
        assert.equal(firstIds.has(row.id), false);
      }
    });
  });

  it("returns deterministic results when a page is requested again", async () => {
    await asUser(db, users.student, async () => {
      const first = await discover(db, {
        limit: 3,
        offset: 3,
      });

      const again = await discover(db, {
        limit: 3,
        offset: 3,
      });

      assert.deepEqual(
        first.rows.map((row) => row.id),
        again.rows.map((row) => row.id),
      );
    });
  });

  it("returns an empty result beyond the last page", async () => {
    await asUser(db, users.student, async () => {
      const result = await discover(db, {
        limit: 5,
        offset: 1000,
      });

      assert.equal(result.rows.length, 0);
    });
  });

  it("rejects a zero page size", async () => {
    await asUser(db, users.student, async () => {
      await assert.rejects(
        discover(db, { limit: 0 }),
        /Limit must be between 1 and 51/,
      );
    });
  });

  it("rejects oversized page requests", async () => {
    await asUser(db, users.student, async () => {
      await assert.rejects(
        discover(db, { limit: 52 }),
        /Limit must be between 1 and 51/,
      );
    });
  });

  it("rejects negative offsets", async () => {
    await asUser(db, users.student, async () => {
      await assert.rejects(
        discover(db, { offset: -1 }),
        /Offset must be between 0 and 1000/,
      );
    });
  });

  it("rejects offsets beyond the limit", async () => {
    await asUser(db, users.student, async () => {
      await assert.rejects(
        discover(db, { offset: 1001 }),
        /Offset must be between 0 and 1000/,
      );
    });
  });

  it("rejects invalid category filters", async () => {
    await asUser(db, users.student, async () => {
      await assert.rejects(
        discover(db, {
          category: " ",
        }),
        /Invalid category/,
      );
    });
  });

  it("lists only categories belonging to published events", async () => {
    await asUser(db, users.student, async () => {
      const result = await getCategories(db);

      const categories = result.rows.map(
        (row) => row.category,
      );

      assert.ok(categories.includes("Academics"));
      assert.ok(categories.includes("Sports"));
      assert.ok(categories.includes("Arts"));

      assert.equal(categories.includes("Private"), false);
      assert.equal(categories.includes("Cancelled"), false);
    });
  });

  it("returns category options in alphabetical order", async () => {
    await asUser(db, users.student, async () => {
      const result = await getCategories(db);

      const categories = result.rows.map(
        (row) => row.category,
      );

      assert.deepEqual(
        categories,
        [...categories].sort(),
      );
    });
  });

  it("does not grant anonymous users event discovery access", async () => {
    await db.exec(`
      set role anon;
      reset request.jwt.claim.sub;
    `);

    try {
      await assert.rejects(
        discover(db),
      );
    } finally {
      await db.exec(
        "reset role; reset request.jwt.claim.sub;",
      );
    }
  });

  it("does not silently turn invalid queries into empty results", async () => {
    await asUser(db, users.student, async () => {
      const empty = await discover(db, {
        category: "No Such Category",
      });

      assert.deepEqual(empty.rows, []);

      await assert.rejects(
        discover(db, {
          startDate: "2099-12-31",
          endDate: "2099-01-01",
        }),
      );
    });
  });

  it("returns published results after removing restrictive filters", async () => {
    await asUser(db, users.student, async () => {
      const restrictive = await discover(db, {
        category: "Academics",
        startDate: "2099-12-01",
        endDate: "2099-12-31",
      });

      const reset = await discover(db);

      assert.equal(restrictive.rows.length, 0);

      assert.ok(
        reset.rows.some(
          (row) => row.id === records.academic.id,
        ),
      );
    });
  });
});
