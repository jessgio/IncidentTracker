-- Remove unused AI customer draft response column
ALTER TABLE public.incidents DROP COLUMN IF EXISTS ai_suggestion;
