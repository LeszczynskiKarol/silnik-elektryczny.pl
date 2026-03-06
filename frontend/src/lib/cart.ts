export interface CartItem {
  productId: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  stock: number;
  manufacturer: string;
  condition: string;
  categorySlug: string;
  productSlug: string;
  power?: string;
  rpm?: string;
  weight?: number;
}

const KEY = 'silnik_cart';

function read(): CartItem[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}
function write(items: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent('cart-updated'));
}

export const cart = {
  getItems: () => read(),
  getCount: () => read().reduce((s, i) => s + i.quantity, 0),
  getSubtotal: () => read().reduce((s, i) => s + i.price * i.quantity, 0),
  add(item: CartItem) {
    const items = read();
    const idx = items.findIndex(i => i.productId === item.productId);
    if (idx >= 0) items[idx].quantity = Math.min(items[idx].quantity + item.quantity, items[idx].stock);
    else items.push({ ...item });
    write(items);
  },
  updateQuantity(productId: string, quantity: number) {
    const items = read();
    const idx = items.findIndex(i => i.productId === productId);
    if (idx >= 0) {
      if (quantity <= 0) items.splice(idx, 1);
      else items[idx].quantity = Math.min(quantity, items[idx].stock);
      write(items);
    }
  },
  remove: (productId: string) => write(read().filter(i => i.productId !== productId)),
  clear: () => write([]),
};
