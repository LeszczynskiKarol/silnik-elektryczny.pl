import { useState, useEffect, useCallback } from "react";
import { cart, type CartItem } from "../lib/cart";

const LAMBDA = "https://vos9dl4ovl.execute-api.eu-north-1.amazonaws.com";
const FF = "'Sora', sans-serif";
const MONO = "'DM Mono', monospace";

function fmt(v: number) {
  return v.toLocaleString("pl-PL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fmtPostal(v: string) {
  const d = v.replace(/\D/g, "");
  return d.length > 2 ? `${d.slice(0, 2)}-${d.slice(2, 5)}` : d;
}

export function CheckoutForm() {
  const [items, setItems] = useState<CartItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<"prepaid" | "cod">(
    "prepaid",
  );
  const [isCompany, setIsCompany] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [nip, setNip] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");
  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [shippingCosts, setShippingCosts] = useState({ prepaid: 0, cod: 0 });
  const [isCalc, setIsCalc] = useState(false);
  const [stripeCancel, setStripeCancel] = useState(false);

  useEffect(() => {
    const cartItems = cart.getItems();
    if (cartItems.length === 0) {
      window.location.href = "/";
      return;
    }
    setItems(cartItems);
    const params = new URLSearchParams(window.location.search);
    if (params.get("stripe_cancel") === "true") {
      setStripeCancel(true);
      window.history.replaceState({}, "", "/checkout");
    }
    try {
      const saved = JSON.parse(
        sessionStorage.getItem("silnik_checkout_form") || "null",
      );
      if (saved) {
        setIsCompany(saved.isCompany || false);
        setCompanyName(saved.companyName || "");
        setNip(saved.nip || "");
        setFirstName(saved.firstName || "");
        setLastName(saved.lastName || "");
        setEmail(saved.email || "");
        setPhone(saved.phone || "");
        setStreet(saved.street || "");
        setPostalCode(saved.postalCode || "");
        setCity(saved.city || "");
        setNotes(saved.notes || "");
        setWantsInvoice(saved.wantsInvoice || false);
        if (saved.paymentMethod) setPaymentMethod(saved.paymentMethod);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (items.length === 0) return;
    try {
      sessionStorage.setItem(
        "silnik_checkout_form",
        JSON.stringify({
          isCompany,
          companyName,
          nip,
          firstName,
          lastName,
          email,
          phone,
          street,
          postalCode,
          city,
          notes,
          wantsInvoice,
          paymentMethod,
          returnUrl: window.location.origin,
        }),
      );
    } catch {}
  }, [
    isCompany,
    companyName,
    nip,
    firstName,
    lastName,
    email,
    phone,
    street,
    postalCode,
    city,
    notes,
    wantsInvoice,
    paymentMethod,
    items,
  ]);

  useEffect(() => {
    const h = () => {
      const u = cart.getItems();
      if (u.length === 0) {
        window.location.href = "/";
        return;
      }
      setItems(u);
    };
    window.addEventListener("cart-updated", h);
    return () => window.removeEventListener("cart-updated", h);
  }, []);

  const totalWeight = items.reduce(
    (s, i) => s + (i.weight || 0) * i.quantity,
    0,
  );
  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const codAvailable = totalWeight <= 575;
  const shippingCost =
    paymentMethod === "cod" ? shippingCosts.cod : shippingCosts.prepaid;
  const total = subtotal + shippingCost;
  const totalCount = items.reduce((s, i) => s + i.quantity, 0);

  const calcShipping = useCallback(async () => {
    if (items.length === 0) return;
    setIsCalc(true);
    try {
      const apiItems = items.map((i) => ({
        productId: i.productId,
        quantity: i.quantity,
      }));
      const [resPrepaid, resCod] = await Promise.all([
        fetch(
          "https://api.silniki-elektryczne.com.pl/api/orders/calculate-shipping",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: apiItems, paymentMethod: "prepaid" }),
          },
        ),
        codAvailable
          ? fetch(
              "https://api.silniki-elektryczne.com.pl/api/orders/calculate-shipping",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ items: apiItems, paymentMethod: "cod" }),
              },
            )
          : Promise.resolve(null),
      ]);
      const dataPrepaid = await resPrepaid.json();
      const dataCod = resCod ? await resCod.json() : null;
      setShippingCosts({
        prepaid: dataPrepaid.data?.cost ?? 0,
        cod: dataCod?.data?.cost ?? 0,
      });
    } catch {
      setShippingCosts({ prepaid: 0, cod: 0 });
    } finally {
      setIsCalc(false);
    }
  }, [items, codAvailable]);

  useEffect(() => {
    calcShipping();
  }, [calcShipping]);

  // Jeśli COD niedostępne i wybrane — przełącz na prepaid
  useEffect(() => {
    if (!codAvailable && paymentMethod === "cod") setPaymentMethod("prepaid");
  }, [codAvailable, paymentMethod]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (isCompany) {
      if (!companyName.trim()) e.companyName = "Podaj nazwę firmy";
      if (wantsInvoice && nip.replace(/\D/g, "").length !== 10)
        e.nip = "NIP musi mieć 10 cyfr";
    } else {
      if (!firstName.trim()) e.firstName = "Podaj imię";
      if (!lastName.trim()) e.lastName = "Podaj nazwisko";
    }
    if (!email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      e.email = "Podaj poprawny email";
    if (!phone.trim() || phone.replace(/\D/g, "").length < 9)
      e.phone = "Podaj numer telefonu";
    if (!street.trim()) e.street = "Podaj adres";
    if (!/^\d{2}-\d{3}$/.test(postalCode)) e.postalCode = "Format: 00-000";
    if (!city.trim()) e.city = "Podaj miejscowość";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const res = await fetch(`${LAMBDA}/create-checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            name: i.name,
            price: i.price,
            image: i.image,
            weight: i.weight || 0,
            slug: i.productSlug,
            categorySlug: i.categorySlug,
          })),
          shipping: {
            firstName: isCompany ? companyName : firstName,
            lastName: isCompany ? "-" : lastName,
            companyName: isCompany ? companyName : undefined,
            nip: wantsInvoice ? nip : undefined,
            email,
            phone,
            street,
            postalCode,
            city,
            notes: notes || undefined,
          },
          subtotal,
          shippingCost,
          total,
          totalWeight,
          paymentMethod,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Błąd płatności");

      if (paymentMethod === "cod") {
        // COD — brak Stripe, backend od razu tworzy zamówienie
        cart.clear();
        try {
          sessionStorage.removeItem("silnik_checkout_form");
        } catch {}
        window.location.href = `/zamowienie/sukces?order_id=${data.data.orderId}`;
      } else {
        if (!data.data?.checkoutUrl) throw new Error("Brak URL płatności");
        window.location.href = data.data.checkoutUrl;
      }
    } catch (err: any) {
      setSubmitError(err.message || "Wystąpił błąd. Spróbuj ponownie.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (items.length === 0)
    return (
      <div
        style={{ display: "flex", justifyContent: "center", padding: "80px 0" }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            border: "3px solid #1a2744",
            borderTopColor: "transparent",
            borderRadius: "50%",
            animation: "spin 0.7s linear infinite",
          }}
        />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );

  const col: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  };
  const grid2: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  };

  return (
    <form onSubmit={handleSubmit}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .co-wrap { display: grid; grid-template-columns: 1fr 360px; gap: 32px; align-items: start; }
        @media (max-width: 800px) { .co-wrap { grid-template-columns: 1fr; } }
        .co-card { background: white; border: 1px solid #e8e8e4; border-radius: 16px; padding: 24px; }
        .co-card h2 { font-size: 14px; font-weight: 700; letter-spacing: -0.2px; margin-bottom: 18px; color: #1a1a1a; font-family: ${FF}; }
        .co-sticky { position: sticky; top: 16px; display: flex; flex-direction: column; gap: 14px; }
        .co-input { width: 100%; height: 44px; padding: 0 14px; border-radius: 10px; border: 1.5px solid #e0e0da; background: #fafaf8; font-size: 14px; font-family: ${FF}; color: #1a1a1a; outline: none; transition: border-color 0.15s; }
        .co-input:focus { border-color: #1a2744; background: white; }
        .co-input.err { border-color: #ef4444; }
        .co-label { display: block; font-size: 11px; font-weight: 600; letter-spacing: 0.5px; text-transform: uppercase; color: #8a8a8a; margin-bottom: 6px; font-family: ${FF}; }
        .co-err { font-size: 11px; color: #ef4444; margin-top: 4px; font-family: ${FF}; }
        .co-tab { padding: 8px 16px; border-radius: 8px; border: 1.5px solid transparent; font-size: 13px; font-weight: 600; cursor: pointer; font-family: ${FF}; transition: all 0.15s; }
        .co-tab.active { background: #1a2744; color: white; border-color: #1a2744; }
        .co-tab:not(.active) { background: #f5f5f3; color: #555; border-color: #e8e8e4; }
        .co-tab:not(.active):hover { border-color: #1a2744; }
        .co-pay-card { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-radius: 12px; border: 2px solid #e8e8e4; cursor: pointer; transition: all 0.15s; background: white; }
        .co-pay-card.selected { border-color: #1a2744; background: #f8f9ff; }
        .co-pay-card:hover:not(.selected) { border-color: #93c5fd; }
        .co-pay-radio { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #d0d0c8; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: all 0.15s; }
        .co-pay-card.selected .co-pay-radio { border-color: #1a2744; background: #1a2744; }
        .co-pay-dot { width: 8px; height: 8px; border-radius: 50%; background: white; }
        .co-submit { width: 100%; height: 56px; border-radius: 14px; border: none; background: #1a2744; color: white; font-size: 16px; font-weight: 700; cursor: pointer; font-family: ${FF}; transition: all 0.15s; display: flex; align-items: center; justify-content: center; gap: 8px; }
        .co-submit:hover:not(:disabled) { background: #243562; }
        .co-submit:disabled { opacity: 0.6; cursor: not-allowed; }
        .co-qty-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border: 1.5px solid #e0e0da; border-radius: 6px; background: white; cursor: pointer; font-size: 14px; color: #555; font-family: ${FF}; transition: all 0.1s; }
        .co-qty-btn:hover { border-color: #1a2744; color: #1a2744; }
        .co-qty-btn:disabled { opacity: 0.3; cursor: default; }
      `}</style>

      <div className="co-wrap">
        <div style={col}>
          {stripeCancel && (
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "#fffbeb",
                border: "1.5px solid #fcd34d",
                color: "#92400e",
                fontSize: 13,
                fontFamily: FF,
              }}
            >
              Płatność została anulowana. Dane zostały zachowane — możesz
              spróbować ponownie.
            </div>
          )}

          {/* Metoda płatności */}
          <div className="co-card">
            <h2>Metoda płatności</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div
                className={`co-pay-card${paymentMethod === "prepaid" ? " selected" : ""}`}
                onClick={() => setPaymentMethod("prepaid")}
              >
                <div className="co-pay-radio">
                  {paymentMethod === "prepaid" && (
                    <div className="co-pay-dot" />
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#1a1a1a",
                      fontFamily: FF,
                      marginBottom: 2,
                    }}
                  >
                    Płatność online
                  </div>
                  <div
                    style={{ fontSize: 12, color: "#8a8a8a", fontFamily: FF }}
                  >
                    BLIK · karta · przelew · Google Pay · Apple Pay
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: "#1a2744",
                    fontFamily: MONO,
                    whiteSpace: "nowrap",
                  }}
                >
                  {isCalc
                    ? "..."
                    : shippingCosts.prepaid > 0
                      ? `+${fmt(shippingCosts.prepaid)} zł`
                      : "–"}
                </div>
              </div>

              {codAvailable && (
                <div
                  className={`co-pay-card${paymentMethod === "cod" ? " selected" : ""}`}
                  onClick={() => setPaymentMethod("cod")}
                >
                  <div className="co-pay-radio">
                    {paymentMethod === "cod" && <div className="co-pay-dot" />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: "#1a1a1a",
                        fontFamily: FF,
                        marginBottom: 2,
                      }}
                    >
                      Za pobraniem
                    </div>
                    <div
                      style={{ fontSize: 12, color: "#8a8a8a", fontFamily: FF }}
                    >
                      Gotówka przy odbiorze · dostępne do 575 kg
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#1a2744",
                      fontFamily: MONO,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isCalc
                      ? "..."
                      : shippingCosts.cod > 0
                        ? `+${fmt(shippingCosts.cod)} zł`
                        : "–"}
                  </div>
                </div>
              )}

              {!codAvailable && (
                <div
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "#f5f5f3",
                    border: "1px solid #e8e8e4",
                    fontSize: 12,
                    color: "#aaa",
                    fontFamily: FF,
                  }}
                >
                  Za pobraniem niedostępne — całkowita waga ({fmt(totalWeight)}{" "}
                  kg) przekracza 575 kg
                </div>
              )}
            </div>
          </div>

          {/* Dane kontaktowe */}
          <div className="co-card">
            <h2>Dane kontaktowe</h2>
            <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
              <button
                type="button"
                className={`co-tab ${!isCompany ? "active" : ""}`}
                onClick={() => setIsCompany(false)}
              >
                Osoba prywatna
              </button>
              <button
                type="button"
                className={`co-tab ${isCompany ? "active" : ""}`}
                onClick={() => setIsCompany(true)}
              >
                Firma
              </button>
            </div>
            <div style={col}>
              {isCompany ? (
                <>
                  <F
                    label="Nazwa firmy *"
                    value={companyName}
                    onChange={setCompanyName}
                    error={errors.companyName}
                  />
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 13,
                      cursor: "pointer",
                      fontFamily: FF,
                      color: "#555",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={wantsInvoice}
                      onChange={(e) => setWantsInvoice(e.target.checked)}
                    />
                    Faktura VAT
                  </label>
                  {wantsInvoice && (
                    <F
                      label="NIP *"
                      value={nip}
                      onChange={(v) =>
                        setNip(v.replace(/\D/g, "").slice(0, 10))
                      }
                      error={errors.nip}
                    />
                  )}
                </>
              ) : (
                <div style={grid2}>
                  <F
                    label="Imię *"
                    value={firstName}
                    onChange={setFirstName}
                    error={errors.firstName}
                  />
                  <F
                    label="Nazwisko *"
                    value={lastName}
                    onChange={setLastName}
                    error={errors.lastName}
                  />
                </div>
              )}
              <F
                label="Email *"
                value={email}
                onChange={setEmail}
                error={errors.email}
                type="email"
              />
              <F
                label="Telefon *"
                value={phone}
                onChange={setPhone}
                error={errors.phone}
                type="tel"
              />
            </div>
          </div>

          {/* Adres */}
          <div className="co-card">
            <h2>Adres dostawy</h2>
            <div style={col}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "150px 1fr",
                  gap: 12,
                }}
              >
                <F
                  label="Kod pocztowy *"
                  value={postalCode}
                  onChange={(v) => setPostalCode(fmtPostal(v))}
                  error={errors.postalCode}
                  placeholder="00-000"
                  maxLength={6}
                />
                <F
                  label="Miejscowość *"
                  value={city}
                  onChange={setCity}
                  error={errors.city}
                />
              </div>
              <F
                label="Ulica i numer *"
                value={street}
                onChange={setStreet}
                error={errors.street}
              />
            </div>
          </div>

          {/* Uwagi */}
          <div className="co-card">
            <h2>Uwagi do zamówienia</h2>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Opcjonalne uwagi..."
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: 10,
                border: "1.5px solid #e0e0da",
                background: "#fafaf8",
                fontSize: 14,
                fontFamily: FF,
                color: "#1a1a1a",
                resize: "none",
                outline: "none",
              }}
            />
          </div>

          {submitError && (
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 12,
                background: "#fef2f2",
                border: "1.5px solid #fca5a5",
                color: "#991b1b",
                fontSize: 13,
                fontFamily: FF,
              }}
            >
              {submitError}
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div className="co-sticky">
          <div className="co-card">
            <h2>
              Zamówienie ({totalCount}{" "}
              {totalCount === 1
                ? "produkt"
                : totalCount < 5
                  ? "produkty"
                  : "produktów"}
              )
            </h2>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                marginBottom: 16,
              }}
            >
              {items.map((item) => (
                <div key={item.productId} style={{ display: "flex", gap: 10 }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      flexShrink: 0,
                      borderRadius: 8,
                      background: "#f5f5f3",
                      overflow: "hidden",
                    }}
                  >
                    <img
                      src={item.image}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "contain",
                        padding: 4,
                      }}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "#1a1a1a",
                        lineHeight: 1.4,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                        fontFamily: FF,
                      }}
                    >
                      {item.name}
                    </p>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginTop: 8,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                        }}
                      >
                        <button
                          type="button"
                          className="co-qty-btn"
                          onClick={() =>
                            cart.updateQuantity(
                              item.productId,
                              item.quantity - 1,
                            )
                          }
                        >
                          {item.quantity <= 1 ? "✕" : "−"}
                        </button>
                        <span
                          style={{
                            width: 24,
                            textAlign: "center",
                            fontSize: 13,
                            fontWeight: 600,
                            fontFamily: MONO,
                          }}
                        >
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          className="co-qty-btn"
                          disabled={item.quantity >= item.stock}
                          onClick={() =>
                            cart.updateQuantity(
                              item.productId,
                              item.quantity + 1,
                            )
                          }
                        >
                          +
                        </button>
                      </div>
                      <span
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: "#1a2744",
                          fontFamily: MONO,
                        }}
                      >
                        {fmt(item.price * item.quantity)} zł
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div
              style={{
                borderTop: "1.5px solid #f0f0ee",
                paddingTop: 14,
                display: "flex",
                flexDirection: "column",
                gap: 8,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  color: "#8a8a8a",
                  fontFamily: FF,
                }}
              >
                <span>Produkty</span>
                <span style={{ fontFamily: MONO }}>{fmt(subtotal)} zł</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 13,
                  color: "#8a8a8a",
                  fontFamily: FF,
                }}
              >
                <span>
                  Dostawa ({paymentMethod === "cod" ? "za pobraniem" : "online"}
                  )
                </span>
                <span style={{ fontFamily: MONO }}>
                  {isCalc
                    ? "..."
                    : shippingCost > 0
                      ? `${fmt(shippingCost)} zł`
                      : "–"}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  borderTop: "1.5px solid #f0f0ee",
                  paddingTop: 12,
                  marginTop: 4,
                }}
              >
                <span style={{ fontSize: 15, fontWeight: 700, fontFamily: FF }}>
                  Razem
                </span>
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: "#1a2744",
                    fontFamily: MONO,
                  }}
                >
                  {fmt(total)} zł
                </span>
              </div>
              <p style={{ fontSize: 11, color: "#aaa", fontFamily: FF }}>
                Cena zawiera 23% VAT
              </p>
            </div>
          </div>

          <button type="submit" className="co-submit" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <div
                  style={{
                    width: 20,
                    height: 20,
                    border: "2.5px solid rgba(255,255,255,0.3)",
                    borderTopColor: "white",
                    borderRadius: "50%",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
                Przetwarzanie...
              </>
            ) : paymentMethod === "cod" ? (
              "Zamawiam za pobraniem →"
            ) : (
              "Kupuję i płacę online →"
            )}
          </button>

          <p
            style={{
              fontSize: 11,
              color: "#aaa",
              textAlign: "center",
              fontFamily: FF,
              lineHeight: 1.6,
            }}
          >
            Klikając akceptujesz{" "}
            <a
              href="/regulamin"
              style={{ color: "#555", textDecoration: "underline" }}
            >
              regulamin
            </a>{" "}
            i{" "}
            <a
              href="/polityka-prywatnosci"
              style={{ color: "#555", textDecoration: "underline" }}
            >
              politykę prywatności
            </a>
            .
          </p>
          {paymentMethod === "prepaid" && (
            <p
              style={{
                fontSize: 12,
                color: "#aaa",
                textAlign: "center",
                fontFamily: FF,
              }}
            >
              🔒 BLIK · karta · przelew · P24
            </p>
          )}
        </div>
      </div>
    </form>
  );
}

function F({
  label,
  value,
  onChange,
  error,
  type = "text",
  placeholder,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  placeholder?: string;
  maxLength?: number;
}) {
  return (
    <div>
      <label className="co-label">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        className={`co-input${error ? " err" : ""}`}
      />
      {error && <p className="co-err">{error}</p>}
    </div>
  );
}
