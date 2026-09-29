// category-icons.js — banco de ícones das categorias do cardápio.
//
// O dono escolhe um ícone ao criar/editar a categoria no painel
// (restaurante/painel.js); a CHAVE fica em categories.icon (migration 0014) e
// o cardápio público (cliente/cardapio.js) desenha o SVG. Ícones de traço
// (24×24, currentColor), no mesmo estilo dos demais do app. Ícone não
// reconhecido (chave antiga/removida) devolve '' e quem chama cai no automático.

const CATEGORY_ICONS = [
  { key: 'utensils', label: 'Pratos', body: '<path d="M3 3v7a3 3 0 0 0 3 3v8M6 3v7M9 3v7M15 3c-1.5 1.5-2 3-2 5.5S15 13 15 13v8M15 3v18"/>' },
  { key: 'bowl', label: 'Entradas', body: '<path d="M2 12a10 10 0 0 1 20 0Z"/><path d="M2 12h20M6 12V9M18 12V9"/>' },
  { key: 'pasta', label: 'Massas', body: '<path d="M3 11h18a9 9 0 0 1-18 0z"/><path d="M8 7c0-1.5 1-1.5 1-3M12 7c0-1.5 1-1.5 1-3M16 7c0-1.5 1-1.5 1-3"/>' },
  { key: 'pizza', label: 'Pizzas', body: '<path d="M12 21 4 5a18 18 0 0 1 16 0z"/><circle cx="10" cy="9" r="1"/><circle cx="14" cy="11" r="1"/>' },
  { key: 'burger', label: 'Hambúrgueres', body: '<path d="M4 11a8 6 0 0 1 16 0z"/><path d="M3 14.5h18"/><path d="M5 14.5v1.5a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-1.5"/>' },
  { key: 'sandwich', label: 'Lanches', body: '<path d="M3 10l9-6 9 6-2 2v7H5v-7z"/><path d="M5 15h14"/>' },
  { key: 'fries', label: 'Porções', body: '<path d="M6 10h12l-1.5 11h-9z"/><path d="M8 10 7 4M11 10V3M14 10l1-6M17 10l1-4"/>' },
  { key: 'steak', label: 'Carnes', body: '<path d="M4 12c0-5 5-8 10-7 5 1 7 5 6 9s-5 6-9 5c-5-1-7-3-7-7z"/><circle cx="14" cy="11" r="2.5"/>' },
  { key: 'drumstick', label: 'Aves', body: '<path d="M15 3a6 6 0 0 1 0 9l-2 2-5-5 2-2a6 6 0 0 1 5-4z"/><path d="M8 14l-4 4M4 15l2 2M6 13l2 2"/>' },
  { key: 'fish', label: 'Peixes', body: '<path d="M2 12c3-5 8-6 12-4l4-3v14l-4-3c-4 2-9 1-12-4z"/><circle cx="8" cy="11" r=".6"/>' },
  { key: 'salad', label: 'Saladas', body: '<path d="M11 20A7 7 0 0 1 4 13c0-6 6-9 16-9 0 10-3 16-9 16z"/><path d="M4 21c3-6 6-9 10-11"/>' },
  { key: 'fruit', label: 'Frutas', body: '<path d="M12 7c-3-2-8-1-8 5 0 5 3 9 6 9 1 0 1.5-.5 2-.5s1 .5 2 .5c3 0 6-4 6-9 0-6-5-7-8-5z"/><path d="M12 7c0-2 1-4 3-5"/>' },
  { key: 'egg', label: 'Café da manhã', body: '<path d="M12 3c-4 0-7 6-7 11a7 7 0 0 0 14 0c0-5-3-11-7-11z"/>' },
  { key: 'bread', label: 'Padaria', body: '<path d="M5 10a4 4 0 0 1 3-7h8a4 4 0 0 1 3 7v9a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z"/>' },
  { key: 'dessert', label: 'Sobremesas', body: '<path d="M4 21v-6a8 8 0 0 1 16 0v6"/><path d="M2 21h20M12 3v4M9 4.5 12 7l3-2.5"/>' },
  { key: 'icecream', label: 'Sorvetes', body: '<path d="M7 11a5 5 0 0 1 10 0"/><path d="M6 11h12l-6 11z"/>' },
  { key: 'coffee', label: 'Cafés', body: '<path d="M4 8h13v6a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M8 2v3M12 2v3"/>' },
  { key: 'drink', label: 'Bebidas', body: '<path d="M6 3h12l-1.5 15.5a2 2 0 0 1-2 1.8h-5a2 2 0 0 1-2-1.8L6 3Z"/><path d="M5 8h14"/>' },
  { key: 'beer', label: 'Cervejas', body: '<path d="M6 7h10v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2z"/><path d="M16 10h2a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-2"/><path d="M6 7a3 3 0 0 1 3-3 3 3 0 0 1 4 0 3 3 0 0 1 3 3"/>' },
  { key: 'cocktail', label: 'Drinks', body: '<path d="M4 4h16l-8 9z"/><path d="M12 13v8M8 21h8"/>' },
  { key: 'kids', label: 'Infantil', body: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2.5 4 2.5S16 14 16 14M9 9.5h.01M15 9.5h.01"/>' },
  { key: 'combo', label: 'Combos', body: '<rect x="3" y="8" width="18" height="4"/><path d="M5 12v9h14v-9M12 8v13"/><path d="M12 8c-1.7 0-3-1-3-2.5S10 3 11 4l1 4zm0 0c1.7 0 3-1 3-2.5S14 3 13 4l-1 4z"/>' },
  { key: 'tag', label: 'Promoções', body: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/>' },
  { key: 'flame', label: 'Mais pedidos', body: '<path d="M12 22c4 0 7-3 7-7 0-3-2-5-3-7-1 1-2 2-3 2 0-3-1-6-4-8 0 4-4 6-4 12 0 5 3 8 7 8z"/>' },
  { key: 'star', label: 'Destaques', body: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>' },
  { key: 'heart', label: 'Favoritos', body: '<path d="M12 21s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 6-8 11-8 11z"/>' },
]

// SVG do ícone pela chave, ou '' se a chave for vazia/desconhecida.
function categoryIconSvg(key, size = 15) {
  const icon = CATEGORY_ICONS.find((i) => i.key === key)
  if (!icon) return ''
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.body}</svg>`
}
