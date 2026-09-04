-- ============================================================
-- إعداد منصة المنيو (تخدم كل المحلات من قاعدة بيانات واحدة)
-- الصقه كامل في: Supabase ← SQL Editor ← New query ← Run
-- آمن للتشغيل أكثر من مرة.
--
-- بعد تشغيله، شغّل سطر «تعيين مدير المنصة» في آخر الملف بإيميلك.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- جدول المحلات: كل صف = محل واحد بمنيوه كامل
-- ------------------------------------------------------------
create table if not exists public.shops (
  id          uuid primary key default gen_random_uuid(),
  slug        text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]{1,39}$'),
  name        text not null,
  owner_email text,
  data        jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists shops_owner_email_idx on public.shops (lower(owner_email));

-- ------------------------------------------------------------
-- مديرو المنصة (أنت) — يضافون يدوياً من محرر SQL فقط
-- ------------------------------------------------------------
create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email   text
);

create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.owns_shop(shop_slug text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shops s
    where s.slug = shop_slug
      and s.owner_email is not null
      and lower(s.owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

-- ------------------------------------------------------------
-- صلاحيات المحلات
-- ------------------------------------------------------------
alter table public.shops enable row level security;

-- الزبائن يقرؤون المحلات المفعّلة، ومدير المنصة يشوف الكل
drop policy if exists "shops read" on public.shops;
create policy "shops read"
  on public.shops for select
  to anon, authenticated
  using (active or public.is_platform_admin());

-- صاحب المحل يعدّل محله فقط، ومدير المنصة يعدّل أي محل
drop policy if exists "shops update" on public.shops;
create policy "shops update"
  on public.shops for update
  to authenticated
  using (
    public.is_platform_admin()
    or lower(coalesce(owner_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  with check (
    public.is_platform_admin()
    or lower(coalesce(owner_email, '')) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

-- إضافة وحذف المحلات لمدير المنصة فقط
drop policy if exists "shops insert" on public.shops;
create policy "shops insert"
  on public.shops for insert
  to authenticated
  with check (public.is_platform_admin());

drop policy if exists "shops delete" on public.shops;
create policy "shops delete"
  on public.shops for delete
  to authenticated
  using (public.is_platform_admin());

-- صاحب المحل ما يقدر يغيّر رابط محله ولا مالكه ولا يفعّل نفسه:
-- نرجّع هذي الأعمدة لقيمها القديمة إذا مو مدير منصة
create or replace function public.shops_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    new.slug        := old.slug;
    new.owner_email := old.owner_email;
    new.active      := old.active;
    new.created_at  := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists shops_guard_trg on public.shops;
create trigger shops_guard_trg
  before update on public.shops
  for each row execute function public.shops_guard();

-- ------------------------------------------------------------
-- صلاحيات جدول المديرين: كل مدير يقرأ صفه فقط، ولا أحد يكتب عبر الموقع
-- ------------------------------------------------------------
alter table public.platform_admins enable row level security;

drop policy if exists "admins read self" on public.platform_admins;
create policy "admins read self"
  on public.platform_admins for select
  to authenticated
  using (user_id = auth.uid());

-- ------------------------------------------------------------
-- مخزن الصور: مجلد لكل محل
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do update set public = true;

drop policy if exists "images read" on storage.objects;
create policy "images read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'menu-images');

-- الرفع داخل مجلد محلك فقط: shops/<slug>/...
drop policy if exists "images write own shop" on storage.objects;
create policy "images write own shop"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] = 'shops'
    and (
      public.is_platform_admin()
      or public.owns_shop((storage.foldername(name))[2])
    )
  );

drop policy if exists "images delete own shop" on storage.objects;
create policy "images delete own shop"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'menu-images'
    and (storage.foldername(name))[1] = 'shops'
    and (
      public.is_platform_admin()
      or public.owns_shop((storage.foldername(name))[2])
    )
  );

-- ============================================================
-- تعيين مدير المنصة
-- أنشئ حسابك أولاً من Authentication ← Users ← Add user،
-- ثم بدّل الإيميل تحت بإيميلك وشغّل هذين السطرين.
-- ============================================================
-- insert into public.platform_admins (user_id, email)
-- select id, email from auth.users where lower(email) = lower('YOUR@EMAIL.COM')
-- on conflict (user_id) do nothing;
