-- Cover referencing columns identified by Supabase's performance advisor.
create index attempts_notebook on public.attempts(user_id,notebook_id,answered_at desc);
create index import_items_question on public.import_items(user_id,question_id);
create index review_policies_catalog on public.review_policies(user_id,catalog_id);
create index review_policies_question on public.review_policies(user_id,question_id);
create index review_schedules_attempt on public.review_schedules(user_id,last_attempt_id);
