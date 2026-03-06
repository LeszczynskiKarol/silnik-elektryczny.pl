import { useState, useEffect, useRef } from 'react';
import { cart, type CartItem } from '../lib/cart';

function fmt(n: number) {
  return n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function CartDropdown() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);

  const refresh = () => setItems(cart.getItems());

  useEffect(() => {
    refresh();
    window.addEventListener('cart-updated', refresh);
    return () => window.removeEventListener('cart-updated', refresh);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Przycisk */}
      <button
        onClick={() => setOpen(!open)}
        aria-label="Koszyk"
        style={{
          position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '8px', borderRadius: '10px', border: 'none',
          background: open ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
          color: 'white', cursor: 'pointer', transition: 'background 0.15s',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
        </svg>
        {count > 0 && (
          <span style={{
            position: 'absolute', top: '-4px', right: '-4px',
            minWidth: '20px', height: '20px', padding: '0 5px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            borderRadius: '10px', fontSize: '11px', fontWeight: '700',
            background: '#2563eb', color: 'white', fontFamily: 'Sora, sans-serif',
          }}>{count}</span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 10px)', right: 0,
          width: '340px', background: 'white',
          border: '1px solid #e8e8e4', borderRadius: '16px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)', zIndex: 999,
          overflow: 'hidden', fontFamily: 'Sora, sans-serif',
          animation: 'cartSlide 0.18s ease-out',
        }}>
          <style>{`@keyframes cartSlide { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }`}</style>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #f0f0ee' }}>
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a1a' }}>Koszyk ({count} szt.)</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              {items.length > 0 && (
                <button onClick={() => cart.clear()} style={{ fontSize: '11px', color: '#aaa', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  Wyczyść
                </button>
              )}
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', display: 'flex', padding: '2px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Lista */}
          <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {items.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '32px 20px', color: '#aaa', fontSize: '13px' }}>Koszyk jest pusty</p>
            ) : items.map(item => (
              <div key={item.productId} style={{ display: 'flex', gap: '10px', padding: '12px 16px', borderBottom: '1px solid #f7f7f5' }}>
                <div style={{ width: '56px', height: '56px', flexShrink: 0, borderRadius: '8px', overflow: 'hidden', background: '#f5f5f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {item.image && <img src={item.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain', padding: '4px' }} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <a href={`/silnik/${item.productSlug}`} style={{ fontSize: '12px', fontWeight: '500', color: '#1a1a1a', textDecoration: 'none', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4' }}>
                    {item.name}
                  </a>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px' }}>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#1a2744' }}>{fmt(item.price * item.quantity)} zł</span>
                    <button onClick={() => cart.remove(item.productId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', display: 'flex', padding: '4px', borderRadius: '4px', transition: 'color 0.1s' }}
                      onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                      onMouseLeave={e => (e.currentTarget.style.color = '#ccc')}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div style={{ padding: '14px 16px', borderTop: '1px solid #f0f0ee' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '13px', color: '#8a8a8a' }}>Razem</span>
                <span style={{ fontSize: '18px', fontWeight: '800', color: '#1a1a1a' }}>{fmt(subtotal)} zł</span>
              </div>
              <a href="/checkout" onClick={() => setOpen(false)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                width: '100%', height: '44px', borderRadius: '12px', textDecoration: 'none',
                background: '#1a2744', color: 'white', fontSize: '14px', fontWeight: '700',
                transition: 'background 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = '#243562')}
                onMouseLeave={e => (e.currentTarget.style.background = '#1a2744')}>
                Przejdź do kasy →
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
