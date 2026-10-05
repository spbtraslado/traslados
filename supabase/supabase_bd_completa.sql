-- =====================================================================
-- SPB Traslados · Base de datos completa para Supabase
-- Supabase -> SQL Editor -> New query -> pegar TODO -> clic en zona vacía -> Run
-- Es seguro correrlo varias veces (usa "if not exists").
-- Deducido del código de index.html (tablas: programaciones, usuarios,
-- configuracion, despachos) + bucket público "logos".
-- =====================================================================

-- 1) Tablas tipo documento (id + data json). Las usa la app para
--    programaciones, usuarios y configuración (correo, firma, estaciones).
create table if not exists public.programaciones (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.usuarios (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.configuracion (
  id         text primary key,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 2) Historial de movimientos / despachos
create table if not exists public.despachos (
  id                      bigint generated always as identity primary key,
  created_at              timestamptz not null default now(),
  accion                  text,
  programacion_id         text,
  origen                  text,
  destino                 text,
  tt_codigo               text,
  tt_operador             text,
  tt_cc                   text,
  bl                      text,
  cantidad                numeric,
  despachado_por          text,
  despachado_por_usuario  text,
  despachado_por_rol      text
);

create index if not exists despachos_created_at_idx on public.despachos (created_at desc);
create index if not exists despachos_tt_codigo_idx  on public.despachos (tt_codigo);

-- 3) Seguridad (RLS). La app entra con la llave "anon" sin login de Supabase,
--    por eso las políticas permiten todo al rol anon. Ojo: cualquiera que
--    tenga la llave anon puede leer/escribir estas tablas.
alter table public.programaciones enable row level security;
alter table public.usuarios       enable row level security;
alter table public.configuracion  enable row level security;
alter table public.despachos      enable row level security;

do $$
declare t text;
begin
  foreach t in array array['programaciones','usuarios','configuracion','despachos'] loop
    if not exists (
      select 1 from pg_policies
      where schemaname = 'public' and tablename = t and policyname = 'acceso_app_' || t
    ) then
      execute format(
        'create policy %I on public.%I for all to anon, authenticated using (true) with check (true)',
        'acceso_app_' || t, t
      );
    end if;
  end loop;
end $$;

-- 4) Tiempo real (la app se suscribe a cambios de programaciones, usuarios
--    y configuracion).
do $$
declare t text;
begin
  foreach t in array array['programaciones','usuarios','configuracion'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- 5) Bucket PÚBLICO "logos" para el logo del correo.
--    Después sube logo-correo.png desde Storage (sin carpetas).
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do update set public = true;
