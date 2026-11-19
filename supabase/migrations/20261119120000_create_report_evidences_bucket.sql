-- HU-06/T4: private bucket for report evidences and its storage.objects
-- policies (contract in docs/domain-design.md, PR #13). Objects live in
-- {user_id}/{report_id}/{uuid}.{png|jpg|webp}; the first folder is the owner.
-- Limits mirror web/src/lib/evidences/rules.ts and public.report_evidences.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'report-evidences',
  'report-evidences',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
);

-- Upload (also required by createSignedUploadUrl): own folder, active
-- profile, a readable report as second folder and a server-generated name.
create policy report_evidences_objects_insert_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'report-evidences'
    and array_length(storage.foldername(name), 1) = 2
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and storage.filename(name)
      ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$'
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_active
    )
    and exists (
      select 1 from public.reports r
      where r.id::text = (storage.foldername(name))[2]
    )
  );

-- Read (also required by createSignedUrl and download): own objects, or the
-- object of a registered evidence readable under the RLS of report_evidences.
create policy report_evidences_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'report-evidences'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1 from public.report_evidences e where e.storage_path = name
      )
    )
  );

-- Delete: own uploads that are not registered as evidences (compensation and
-- cancelled uploads). The uploader reads all of their own evidences, so the
-- check also sees hidden ones. There is no update policy: no overwrites.
create policy report_evidences_objects_delete_own_unregistered
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'report-evidences'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (
      select 1 from public.report_evidences e where e.storage_path = name
    )
  );
