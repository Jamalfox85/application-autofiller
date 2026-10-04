-- Storage upsert (replacing a resume already in the user's folder) checks the
-- UPDATE policy's WITH CHECK, not only USING. The previous policy set USING
-- and left WITH CHECK empty, so a replacement could be rejected and the popup
-- upload would fail after the first object existed.

drop policy if exists "resumes: owner update" on storage.objects;

create policy "resumes: owner update"
on storage.objects
for update
to public
using (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'resumes'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
