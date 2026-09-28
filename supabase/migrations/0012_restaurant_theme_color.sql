-- 0012_restaurant_theme_color.sql
-- Cor de destaque do restaurante (restaurants.theme_color): coluna aditiva,
-- não quebra restaurantes existentes (default = o laranja atual do app,
-- #FF6823). Cadastrada no painel (restaurante/painel.js, seção "Identidade
-- visual") e aplicada em tempo de execução via CSS var (--brand-orange-rgb,
-- ver js/util.js applyThemeColor()) no cardápio público e no próprio painel
-- — substitui o laranja padrão em botões, badges, preços e destaques. O
-- tema continua escuro por padrão no cardápio (isso aqui não mexe nisso);
-- vermelho (erro/exclusão) e azul (links) continuam fixos, só a cor de
-- destaque é editável.

alter table public.restaurants
  add column if not exists theme_color text not null default '#FF6823';

alter table public.restaurants
  drop constraint if exists restaurants_theme_color_format;
alter table public.restaurants
  add constraint restaurants_theme_color_format check (theme_color ~* '^#[0-9a-f]{6}$');
