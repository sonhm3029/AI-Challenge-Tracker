-- Section 27 — PostgreSQL full-text search is sufficient; no Elasticsearch.
--
-- A generated, stored tsvector over the challenge's own text fields covers
-- "challenge name" search directly. Venue name / domain / task-tag search
-- (also required by Section 27) is done at query time via joins against
-- venues/domains/task_tags rather than a maintained cross-table tsvector,
-- since those relations are small lookup tables where a plain match is
-- already fast at our expected scale (Section 58).
ALTER TABLE "challenges"
  ADD COLUMN "search_vector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("name", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("short_name", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'C')
  ) STORED;

CREATE INDEX "challenges_search_vector_idx" ON "challenges" USING GIN ("search_vector");
