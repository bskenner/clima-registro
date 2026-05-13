create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.regions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.locations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  region_id uuid references public.regions(id) on delete set null,
  name text not null,
  city text,
  state text,
  country text default 'Brasil',
  latitude numeric not null,
  longitude numeric not null,
  is_active boolean default true,
  collect_daily boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.weather_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  region_id uuid references public.regions(id) on delete set null,
  date_time timestamptz not null,
  precipitation_mm numeric,
  weather_condition text,
  weather_code integer,
  temperature_c numeric,
  pressure_hpa numeric,
  humidity_percent numeric,
  wind_kmh numeric,
  source text not null default 'Manual',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  name text not null,
  type text not null,
  is_active boolean default true,
  threshold_value numeric,
  comparison_operator text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint alert_rules_type_check check (
    type in (
      'frost_risk',
      'heavy_rain',
      'pressure_drop',
      'cold_front_signal',
      'high_wind',
      'custom'
    )
  ),
  constraint alert_rules_operator_check check (
    comparison_operator is null
    or comparison_operator in ('>', '>=', '<', '<=', '=', '!=')
  )
);

create table if not exists public.alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  location_id uuid references public.locations(id) on delete cascade,
  weather_record_id uuid references public.weather_records(id) on delete cascade,
  alert_rule_id uuid references public.alert_rules(id) on delete set null,
  type text not null,
  severity text not null,
  title text not null,
  message text not null,
  is_read boolean default false,
  created_at timestamptz default now(),
  constraint alert_events_severity_check check (severity in ('baixa', 'média', 'alta', 'crítica'))
);

create index if not exists idx_weather_records_user_id on public.weather_records(user_id);
create index if not exists idx_weather_records_location_id on public.weather_records(location_id);
create index if not exists idx_weather_records_region_id on public.weather_records(region_id);
create index if not exists idx_weather_records_date_time on public.weather_records(date_time);
create index if not exists idx_locations_user_id on public.locations(user_id);
create index if not exists idx_regions_user_id on public.regions(user_id);
create index if not exists idx_alert_events_user_id on public.alert_events(user_id);
create index if not exists idx_alert_events_created_at on public.alert_events(created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists regions_set_updated_at on public.regions;
create trigger regions_set_updated_at
before update on public.regions
for each row execute function public.set_updated_at();

drop trigger if exists locations_set_updated_at on public.locations;
create trigger locations_set_updated_at
before update on public.locations
for each row execute function public.set_updated_at();

drop trigger if exists weather_records_set_updated_at on public.weather_records;
create trigger weather_records_set_updated_at
before update on public.weather_records
for each row execute function public.set_updated_at();

drop trigger if exists alert_rules_set_updated_at on public.alert_rules;
create trigger alert_rules_set_updated_at
before update on public.alert_rules
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.regions enable row level security;
alter table public.locations enable row level security;
alter table public.weather_records enable row level security;
alter table public.alert_rules enable row level security;
alter table public.alert_events enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own"
on public.profiles for delete
using (id = auth.uid());

drop policy if exists "regions_select_own" on public.regions;
create policy "regions_select_own"
on public.regions for select
using (user_id = auth.uid());

drop policy if exists "regions_insert_own" on public.regions;
create policy "regions_insert_own"
on public.regions for insert
with check (user_id = auth.uid());

drop policy if exists "regions_update_own" on public.regions;
create policy "regions_update_own"
on public.regions for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "regions_delete_own" on public.regions;
create policy "regions_delete_own"
on public.regions for delete
using (user_id = auth.uid());

drop policy if exists "locations_select_own" on public.locations;
create policy "locations_select_own"
on public.locations for select
using (user_id = auth.uid());

drop policy if exists "locations_insert_own" on public.locations;
create policy "locations_insert_own"
on public.locations for insert
with check (user_id = auth.uid());

drop policy if exists "locations_update_own" on public.locations;
create policy "locations_update_own"
on public.locations for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "locations_delete_own" on public.locations;
create policy "locations_delete_own"
on public.locations for delete
using (user_id = auth.uid());

drop policy if exists "weather_records_select_own" on public.weather_records;
create policy "weather_records_select_own"
on public.weather_records for select
using (user_id = auth.uid());

drop policy if exists "weather_records_insert_own" on public.weather_records;
create policy "weather_records_insert_own"
on public.weather_records for insert
with check (user_id = auth.uid());

drop policy if exists "weather_records_update_own" on public.weather_records;
create policy "weather_records_update_own"
on public.weather_records for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "weather_records_delete_own" on public.weather_records;
create policy "weather_records_delete_own"
on public.weather_records for delete
using (user_id = auth.uid());

drop policy if exists "alert_rules_select_own" on public.alert_rules;
create policy "alert_rules_select_own"
on public.alert_rules for select
using (user_id = auth.uid());

drop policy if exists "alert_rules_insert_own" on public.alert_rules;
create policy "alert_rules_insert_own"
on public.alert_rules for insert
with check (user_id = auth.uid());

drop policy if exists "alert_rules_update_own" on public.alert_rules;
create policy "alert_rules_update_own"
on public.alert_rules for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "alert_rules_delete_own" on public.alert_rules;
create policy "alert_rules_delete_own"
on public.alert_rules for delete
using (user_id = auth.uid());

drop policy if exists "alert_events_select_own" on public.alert_events;
create policy "alert_events_select_own"
on public.alert_events for select
using (user_id = auth.uid());

drop policy if exists "alert_events_insert_own" on public.alert_events;
create policy "alert_events_insert_own"
on public.alert_events for insert
with check (user_id = auth.uid());

drop policy if exists "alert_events_update_own" on public.alert_events;
create policy "alert_events_update_own"
on public.alert_events for update
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "alert_events_delete_own" on public.alert_events;
create policy "alert_events_delete_own"
on public.alert_events for delete
using (user_id = auth.uid());
