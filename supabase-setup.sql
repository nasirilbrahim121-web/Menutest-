-- ============================================================
-- إعداد قاعدة بيانات المنيو
-- الصقه كامل في: Supabase ← SQL Editor ← New query ← Run
-- آمن للتشغيل أكثر من مرة.
-- ============================================================

-- جدول المنيو: سجل واحد يحمل المنيو كامل
create table if not exists public.menu (
  id         int primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.menu enable row level security;

-- الزبائن (بدون تسجيل دخول) يقرؤون المنيو فقط
drop policy if exists "menu read for everyone" on public.menu;
create policy "menu read for everyone"
  on public.menu for select
  to anon, authenticated
  using (true);

-- الكتابة لمن سجّل دخوله فقط
drop policy if exists "menu write for signed in" on public.menu;
create policy "menu write for signed in"
  on public.menu for insert
  to authenticated
  with check (true);

drop policy if exists "menu update for signed in" on public.menu;
create policy "menu update for signed in"
  on public.menu for update
  to authenticated
  using (true)
  with check (true);

-- ============================================================
-- مخزن صور المنتجات
-- ============================================================
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do update set public = true;

-- الصور معروضة للجميع
drop policy if exists "images read for everyone" on storage.objects;
create policy "images read for everyone"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'menu-images');

-- الرفع والتعديل والحذف لمن سجّل دخوله فقط
drop policy if exists "images upload for signed in" on storage.objects;
create policy "images upload for signed in"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'menu-images');

drop policy if exists "images update for signed in" on storage.objects;
create policy "images update for signed in"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'menu-images');

drop policy if exists "images delete for signed in" on storage.objects;
create policy "images delete for signed in"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'menu-images');
