alter table room add column "roomTitle" text;
alter table room add column "roomDescription" text;
alter table room add column "roomTitleColor" text;

CREATE TABLE IF NOT EXISTS movie_history(
  uid text NOT NULL,
  movie_id bigint NOT NULL,
  title text NOT NULL,
  poster_path text,
  backdrop_path text,
  rating double precision,
  platform text,
  watched_at timestamp with time zone NOT NULL DEFAULT NOW(),
  PRIMARY KEY(uid, movie_id)
);
CREATE INDEX IF NOT EXISTS movie_history_uid_watched_at_idx
  ON movie_history(uid, watched_at DESC);
