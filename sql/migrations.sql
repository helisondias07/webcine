alter table room add column "roomTitle" text;
alter table room add column "roomDescription" text;
alter table room add column "roomTitleColor" text;
alter table room drop column if exists "isSubRoom";
drop table if exists subscriber;

-- Firebase identities are no longer used. Existing rooms can be claimed again
-- using the browser-local identity after this one-time migration.
UPDATE room SET owner = NULL WHERE owner IS NOT NULL;
DROP TABLE IF EXISTS link_account;
DROP TABLE IF EXISTS active_user;
DROP TABLE IF EXISTS movie_history;
