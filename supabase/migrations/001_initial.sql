-- MÓJ WARSZTAT — instalacja schematu Supabase (PostgreSQL 15+)
-- URUCHOM JEDNORAZOWO w SQL Editorze nowego, oddzielnego projektu Supabase.
-- Nie uruchamiaj na bazie z istniejącymi danymi bez przeglądu migracji.

create table public.workshops (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  owner_id uuid not null references auth.users(id),
  phone text not null default '',
  created_at timestamptz not null default now()
);
create table public.members (
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin')),
  created_at timestamptz not null default now(),
  primary key (workshop_id,user_id)
);
create index members_user_idx on public.members (user_id);

-- Security-definer omija RLS wewnątrz helpera: nie powoduje rekursji polityk.
create function public.is_member(w uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.members m where m.workshop_id = w and m.user_id = (select auth.uid()));
$$;
create function public.is_owner(w uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.workshops t where t.id = w and t.owner_id = (select auth.uid()));
$$;

create function public.create_workshop(p_name text,p_phone text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'Zaloguj się'; end if;
  if length(trim(coalesce(p_name,''))) not between 2 and 120 then raise exception 'Niepoprawna nazwa warsztatu'; end if;
  if exists(select 1 from public.workshops where owner_id = v_user) then raise exception 'Masz już warsztat'; end if;
  insert into public.workshops(name,phone,owner_id)
    values(trim(p_name),left(coalesce(p_phone,''),40),v_user) returning id into v_id;
  insert into public.members(workshop_id,user_id,role) values(v_id,v_user,'owner');
  return v_id;
end; $$;

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  token_hash text not null unique,
  invited_email text not null,
  role text not null check(role = 'admin'),
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index invites_workshop_idx on public.invites (workshop_id,created_at desc);

create function public.create_admin_invite(p_workshop uuid,p_email text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_email text := lower(trim(coalesce(p_email,'')));
begin
  if not public.is_owner(p_workshop) then raise exception 'Tylko właściciel może zaprosić administratora'; end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email) > 255 then
    raise exception 'Wpisz poprawny adres e-mail';
  end if;
  if (select count(*) from public.invites where workshop_id=p_workshop and used_at is null and expires_at>now()) >= 5 then
    raise exception 'Limit aktywnych zaproszeń (5)';
  end if;
  v_token := replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-','');
  insert into public.invites(workshop_id,token_hash,invited_email,role,created_by,expires_at)
    values(p_workshop, encode(sha256(convert_to(v_token,'UTF8')),'hex'),v_email,'admin',auth.uid(),now()+interval '48 hours');
  return v_token;
end; $$;

create function public.accept_admin_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_inv public.invites%rowtype; v_email text := lower(coalesce(auth.jwt()->>'email',''));
begin
  if auth.uid() is null then raise exception 'Zaloguj się'; end if;
  if length(coalesce(p_token,'')) <> 64 then raise exception 'Nieprawidłowe zaproszenie'; end if;
  select * into v_inv from public.invites
    where token_hash = encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
  if not found or v_inv.expires_at < now() or v_inv.used_at is not null then
    raise exception 'Zaproszenie nieważne lub wykorzystane';
  end if;
  if v_email <> v_inv.invited_email then raise exception 'Zaloguj się na zaproszony e-mail'; end if;
  if not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then
    raise exception 'Najpierw potwierdź swój adres e-mail';
  end if;
  if exists(select 1 from public.members where user_id=auth.uid() and workshop_id=v_inv.workshop_id) then
    raise exception 'Masz już dostęp do tego warsztatu';
  end if;
  insert into public.members(workshop_id,user_id,role) values(v_inv.workshop_id,auth.uid(),'admin');
  update public.invites set used_at=now() where id=v_inv.id;
  return v_inv.workshop_id;
end; $$;

create function public.remove_admin(p_workshop uuid,p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_owner(p_workshop) then raise exception 'Tylko właściciel może cofnąć dostęp'; end if;
  delete from public.members where workshop_id=p_workshop and user_id=p_user and role='admin';
end; $$;

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  name text not null check(length(trim(name)) between 2 and 160),
  phone text not null default '',
  email text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique(workshop_id,id)
);
create index customers_workshop_idx on public.customers(workshop_id,name);
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  customer_id uuid not null,
  make text not null check(length(trim(make)) between 1 and 80),
  model text not null default '',
  registration text not null default '',
  vin text not null default '' check(vin = '' or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  year integer check (year between 1900 and 2100),
  mileage integer check(mileage >= 0),
  created_at timestamptz not null default now(),
  foreign key (workshop_id,customer_id) references public.customers(workshop_id,id) on delete restrict,
  unique(workshop_id,id)
);
create index vehicles_workshop_idx on public.vehicles(workshop_id,registration);
create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  customer_id uuid not null,
  vehicle_id uuid,
  title text not null check(length(trim(title)) between 2 and 200),
  description text not null default '',
  status text not null default 'new' check(status in ('new','diagnosis','repair','ready','done')),
  received_on date not null default current_date,
  due_on date,
  estimate numeric(12,2) not null default 0 check(estimate >= 0),
  created_at timestamptz not null default now(),
  foreign key (workshop_id,customer_id) references public.customers(workshop_id,id) on delete restrict,
  foreign key (workshop_id,vehicle_id) references public.vehicles(workshop_id,id) on delete restrict,
  unique(workshop_id,id)
);
create index jobs_workshop_idx on public.jobs(workshop_id,created_at desc);

-- Nie pozwalaj podpiąć do zlecenia samochodu innego klienta.
create function public.validate_job_vehicle() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.vehicle_id is not null and not exists (
    select 1 from public.vehicles v where v.id=new.vehicle_id
      and v.workshop_id=new.workshop_id and v.customer_id=new.customer_id
  ) then raise exception 'Pojazd nie należy do wskazanego klienta'; end if;
  return new;
end; $$;
create trigger jobs_vehicle_check before insert or update of customer_id,vehicle_id on public.jobs
for each row execute function public.validate_job_vehicle();

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  job_id uuid,
  title text not null check(length(trim(title)) between 2 and 180),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  foreign key (workshop_id,job_id) references public.jobs(workshop_id,id) on delete set null (job_id),
  unique(workshop_id,id)
);
create index appointments_workshop_idx on public.appointments(workshop_id,starts_at);

create table public.calendar_links (
  workshop_id uuid not null,
  appointment_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  google_event_id text not null,
  updated_at timestamptz not null default now(),
  primary key (appointment_id,user_id),
  foreign key (workshop_id,appointment_id) references public.appointments(workshop_id,id) on delete cascade
);
create table public.parts (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  name text not null check(length(trim(name)) between 2 and 160),
  sku text not null default '',
  supplier text not null default '',
  price numeric(12,2) not null default 0 check(price >= 0),
  qty integer not null default 0 check(qty >= 0),
  created_at timestamptz not null default now(),
  unique(workshop_id,id)
);
create index parts_workshop_idx on public.parts(workshop_id,name);
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  job_id uuid not null,
  object_path text not null unique,
  note text not null default '',
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (workshop_id,job_id) references public.jobs(workshop_id,id) on delete restrict
);
create index photos_job_idx on public.photos(workshop_id,job_id);
create table public.sms_log (
  id uuid primary key default gen_random_uuid(),
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  customer_id uuid not null,
  actor_id uuid not null references auth.users(id),
  status text not null default 'pending' check(status in ('pending','sent','failed')),
  provider_id text,
  created_at timestamptz not null default now(),
  foreign key (workshop_id,customer_id) references public.customers(workshop_id,id)
);
create index sms_log_ratelimit_idx on public.sms_log(actor_id,created_at desc);

create function public.reserve_sms(p_workshop uuid,p_customer uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_user uuid := auth.uid();
begin
  if v_user is null or not public.is_member(p_workshop) then raise exception 'Brak dostępu'; end if;
  if not exists(select 1 from public.customers where id=p_customer and workshop_id=p_workshop and length(trim(phone)) >= 9) then
    raise exception 'Klient nie ma numeru telefonu';
  end if;
  perform pg_advisory_xact_lock(hashtext(v_user::text));
  if (select count(*) from public.sms_log where actor_id=v_user and created_at>now()-interval '24 hours') >= 25 then
    raise exception 'Przekroczono limit SMS (25 na dobę)';
  end if;
  if (select count(*) from public.sms_log where actor_id=v_user and customer_id=p_customer and created_at>now()-interval '1 hour') >= 3 then
    raise exception 'Za dużo SMS do tego klienta w ciągu godziny';
  end if;
  insert into public.sms_log(workshop_id,customer_id,actor_id) values (p_workshop,p_customer,v_user) returning id into v_id;
  return v_id;
end; $$;

create table public.audit_log (
  id bigint generated always as identity primary key,
  workshop_id uuid not null references public.workshops(id) on delete cascade,
  actor_id uuid,
  entity text not null,
  entity_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index audit_workshop_idx on public.audit_log(workshop_id,created_at desc);
create function public.log_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row record;
begin
  if tg_op='DELETE' then v_row := old; else v_row := new; end if;
  insert into public.audit_log(workshop_id,actor_id,entity,entity_id,action)
    values (v_row.workshop_id,auth.uid(),tg_table_name,v_row.id,tg_op);
  return coalesce(new,old);
end; $$;

-- RLS na WSZYSTKICH prywatnych tabelach.
alter table public.workshops enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.jobs enable row level security;
alter table public.appointments enable row level security;
alter table public.calendar_links enable row level security;
alter table public.parts enable row level security;
alter table public.photos enable row level security;
alter table public.sms_log enable row level security;
alter table public.audit_log enable row level security;

create policy workshops_read on public.workshops for select to authenticated using (public.is_member(id));
create policy workshops_update on public.workshops for update to authenticated using (public.is_owner(id)) with check(public.is_owner(id));
create policy members_read on public.members for select to authenticated using (public.is_member(workshop_id));
create policy invites_read on public.invites for select to authenticated using (public.is_owner(workshop_id));
create policy customers_manage on public.customers for all to authenticated using(public.is_member(workshop_id)) with check(public.is_member(workshop_id));
create policy vehicles_manage on public.vehicles for all to authenticated using(public.is_member(workshop_id)) with check(public.is_member(workshop_id));
create policy jobs_manage on public.jobs for all to authenticated using(public.is_member(workshop_id)) with check(public.is_member(workshop_id));
create policy appointments_manage on public.appointments for all to authenticated using(public.is_member(workshop_id)) with check(public.is_member(workshop_id));
create policy calendar_links_manage on public.calendar_links for all to authenticated
  using(user_id=auth.uid() and public.is_member(workshop_id))
  with check(user_id=auth.uid() and public.is_member(workshop_id));
create policy parts_manage on public.parts for all to authenticated using(public.is_member(workshop_id)) with check(public.is_member(workshop_id));
create policy photos_manage on public.photos for all to authenticated using(public.is_member(workshop_id)) with check(public.is_member(workshop_id) and uploaded_by=auth.uid());
create policy sms_log_read on public.sms_log for select to authenticated using(public.is_member(workshop_id));
create policy audit_read on public.audit_log for select to authenticated using(public.is_owner(workshop_id));

-- Nie pozwól klientowi modyfikować identyfikatorów / właściciela rekordu.
revoke all on public.workshops,public.members,public.invites,public.customers,public.vehicles,public.jobs,public.appointments,public.calendar_links,public.parts,public.photos,public.sms_log,public.audit_log from anon,authenticated;
grant select on public.workshops,public.members,public.invites,public.customers,public.vehicles,public.jobs,public.appointments,public.calendar_links,public.parts,public.photos,public.sms_log,public.audit_log to authenticated;
grant update (name,phone) on public.workshops to authenticated;
grant insert (workshop_id,name,phone,email,notes) on public.customers to authenticated;
grant update (name,phone,email,notes) on public.customers to authenticated;
grant delete on public.customers to authenticated;
grant insert (workshop_id,customer_id,make,model,registration,vin,year,mileage) on public.vehicles to authenticated;
grant update (customer_id,make,model,registration,vin,year,mileage) on public.vehicles to authenticated;
grant delete on public.vehicles to authenticated;
grant insert (workshop_id,customer_id,vehicle_id,title,description,status,received_on,due_on,estimate) on public.jobs to authenticated;
grant update (customer_id,vehicle_id,title,description,status,received_on,due_on,estimate) on public.jobs to authenticated;
grant delete on public.jobs to authenticated;
grant insert (workshop_id,job_id,title,starts_at,ends_at,notes) on public.appointments to authenticated;
grant update (job_id,title,starts_at,ends_at,notes) on public.appointments to authenticated;
grant delete on public.appointments to authenticated;
grant insert (workshop_id,appointment_id,user_id,google_event_id) on public.calendar_links to authenticated;
grant update (google_event_id,updated_at) on public.calendar_links to authenticated;
grant delete on public.calendar_links to authenticated;
grant insert (workshop_id,name,sku,supplier,price,qty) on public.parts to authenticated;
grant update (name,sku,supplier,price,qty) on public.parts to authenticated;
grant delete on public.parts to authenticated;
grant insert (workshop_id,job_id,object_path,note,uploaded_by) on public.photos to authenticated;
grant update (note) on public.photos to authenticated;
grant delete on public.photos to authenticated;

revoke all on function public.is_member(uuid),public.is_owner(uuid),public.create_workshop(text,text),public.create_admin_invite(uuid,text),public.accept_admin_invite(text),public.remove_admin(uuid,uuid),public.reserve_sms(uuid,uuid) from public,anon;
grant execute on function public.is_member(uuid),public.is_owner(uuid),public.create_workshop(text,text),public.create_admin_invite(uuid,text),public.accept_admin_invite(text),public.remove_admin(uuid,uuid),public.reserve_sms(uuid,uuid) to authenticated;

-- Twórz dziennik operacji dla rekordów (nie zapisuje danych osobowych w logu).
create trigger audit_customers after insert or update or delete on public.customers for each row execute function public.log_change();
create trigger audit_vehicles after insert or update or delete on public.vehicles for each row execute function public.log_change();
create trigger audit_jobs after insert or update or delete on public.jobs for each row execute function public.log_change();
create trigger audit_appointments after insert or update or delete on public.appointments for each row execute function public.log_change();
create trigger audit_parts after insert or update or delete on public.parts for each row execute function public.log_change();
create trigger audit_photos after insert or update or delete on public.photos for each row execute function public.log_change();

-- Zdjęcia prywatne: nazwy plików zaczynają się od UUID warsztatu (folder 1).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('damage-photos','damage-photos',false,10485760,array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
create policy "workshop_photo_read" on storage.objects for select to authenticated
  using (bucket_id='damage-photos' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "workshop_photo_upload" on storage.objects for insert to authenticated
  with check (bucket_id='damage-photos' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and public.is_member(((storage.foldername(name))[1])::uuid));
create policy "workshop_photo_delete" on storage.objects for delete to authenticated
  using (bucket_id='damage-photos' and (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$' and public.is_member(((storage.foldername(name))[1])::uuid));

-- Zasada: żadnych danych klientów w plikach GitHub Pages ani w publicznym buckecie.
