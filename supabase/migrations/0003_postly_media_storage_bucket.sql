-- Private Storage bucket for Postly's compressed working copies of images.
-- Policies are bucket-scoped and additive; they never affect other apps' buckets.

insert into storage.buckets (id, name, public)
values ('postly-media', 'postly-media', false)
on conflict (id) do nothing;

create policy "postly_media_auth_select" on storage.objects
  for select to authenticated using (bucket_id = 'postly-media');
create policy "postly_media_auth_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'postly-media');
create policy "postly_media_auth_update" on storage.objects
  for update to authenticated using (bucket_id = 'postly-media') with check (bucket_id = 'postly-media');
create policy "postly_media_auth_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'postly-media');
