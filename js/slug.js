// slug.js
//
// Remove acentos via normalização NFD (separa a letra base da marca
// diacrítica, depois descarta as marcas diacríticas combinantes, intervalo
// Unicode U+0300-U+036F).
function slugify(input) {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}
