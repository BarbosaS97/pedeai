-- 0009_restaurant_logo.sql
-- Logo do restaurante, exibida no cabeçalho do cardápio público junto ao nome.

alter table public.restaurants
  add column if not exists logo_url text;

-- Storage: bucket "logos" para as logos dos restaurantes (separado do bucket
-- "products", que guarda fotos de prato — mantém os dois tipos de mídia
-- organizados em pastas/policies próprias).
insert into storage.buckets (id, name, public)
values ('logos', 'logos', true)
on conflict (id) do nothing;

-- Leitura pública (necessário para exibir no cabeçalho do cardápio).
drop policy if exists "restaurant_logos_select_public" on storage.objects;
create policy "restaurant_logos_select_public"
  on storage.objects for select
  using (bucket_id = 'logos');

-- Upload/edição/remoção só para quem tem o token do restaurante. Mesma
-- convenção de path do bucket "products": logos/{restaurant_id}/{arquivo}.
drop policy if exists "restaurant_logos_insert_by_token" on storage.objects;
create policy "restaurant_logos_insert_by_token"
  on storage.objects for insert
  with check (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (
      select id::text from public.restaurants
      where access_token = public.current_restaurant_token()
    )
  );

drop policy if exists "restaurant_logos_update_by_token" on storage.objects;
create policy "restaurant_logos_update_by_token"
  on storage.objects for update
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (
      select id::text from public.restaurants
      where access_token = public.current_restaurant_token()
    )
  );

drop policy if exists "restaurant_logos_delete_by_token" on storage.objects;
create policy "restaurant_logos_delete_by_token"
  on storage.objects for delete
  using (
    bucket_id = 'logos'
    and (storage.foldername(name))[1] in (
      select id::text from public.restaurants
      where access_token = public.current_restaurant_token()
    )
  );
