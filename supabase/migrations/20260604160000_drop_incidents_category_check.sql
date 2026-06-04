-- Categories are managed in public.categories (Manage lists). The legacy CHECK
-- only allowed four English values and blocked imports/UI for all other names.
alter table public.incidents drop constraint if exists incidents_category_check;
