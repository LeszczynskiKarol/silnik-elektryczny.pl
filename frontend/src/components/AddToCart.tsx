import { useState } from "react";
import { cart, type CartItem } from "../lib/cart";

interface Props {
  product: any;
  slug: string;
}

export default function AddToCart({ product: p, slug }: Props) {
  const [added, setAdded] = useState(false);
  const [qty, setQty] = useState(1);

  const price = Number(p.marketplaces?.ownStore?.price ?? p.price);
  const catPath = p.marketplaces?.ownStore?.category_path || "/trojfazowe";
  const categorySlug = catPath.replace(/^\//, "").split("/")[0] || "trojfazowe";

  const addToCart = () => {
    const item: CartItem = {
      productId: p.id,
      name: p.name,
      price,
      image: p.mainImage || p.images?.[0] || "",
      quantity: qty,
      stock: p.stock,
      manufacturer: p.manufacturer || "",
      condition: p.condition,
      categorySlug,
      productSlug: slug,
      power: p.power?.value,
      weight: Number(p.weight) || 0,
    };
    cart.add(item);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  const s = {
    qtyWrap: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      marginBottom: "12px",
    } as React.CSSProperties,
    qtyBox: {
      display: "flex",
      alignItems: "center",
      border: "1.5px solid #e0e0da",
      borderRadius: "12px",
      overflow: "hidden",
    } as React.CSSProperties,
    qtyBtn: {
      width: "44px",
      height: "44px",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "none",
      border: "none",
      cursor: "pointer",
      fontSize: "20px",
      fontWeight: "300",
      color: "#666",
      transition: "background 0.1s",
    } as React.CSSProperties,
    qtyNum: {
      width: "44px",
      textAlign: "center" as const,
      fontWeight: "600",
      fontSize: "15px",
      fontFamily: "DM Mono, monospace",
    },
    addBtn: {
      width: "100%",
      height: "52px",
      borderRadius: "14px",
      border: "none",
      background: added ? "#16a34a" : "#1a2744",
      color: "white",
      fontFamily: "Sora, sans-serif",
      fontSize: "15px",
      fontWeight: "700",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "8px",
      transition: "all 0.25s",
      transform: added ? "scale(0.98)" : "scale(1)",
      marginBottom: "10px",
    } as React.CSSProperties,
    buyBtn: {
      width: "100%",
      height: "44px",
      borderRadius: "14px",
      border: "2px solid #1a2744",
      background: "white",
      color: "#1a2744",
      fontFamily: "Sora, sans-serif",
      fontSize: "14px",
      fontWeight: "600",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "6px",
      textDecoration: "none",
      transition: "all 0.15s",
    } as React.CSSProperties,
  };

  return (
    <div>
      <div style={s.qtyWrap}>
        <div style={s.qtyBox}>
          <button
            style={s.qtyBtn}
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f3")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            −
          </button>
          <span style={s.qtyNum}>{qty}</span>
          <button
            style={s.qtyBtn}
            onClick={() => setQty((q) => Math.min(p.stock, q + 1))}
            onMouseEnter={(e) => (e.currentTarget.style.background = "#f5f5f3")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
          >
            +
          </button>
        </div>
        <span style={{ fontSize: "12px", color: "#aaa" }}>
          z {p.stock} dostępnych
        </span>
      </div>

      <a
        href="/checkout"
        style={s.buyBtn}
        onClick={addToCart}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = "#1a2744";
          (e.currentTarget as HTMLElement).style.color = "white";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "white";
          (e.currentTarget as HTMLElement).style.color = "#1a2744";
        }}
      >
        Kup teraz
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </a>
    </div>
  );
}
