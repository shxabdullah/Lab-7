(() => {
  "use strict";

  const PRODUCTS = {
    "arc-headphones": {
      id: "arc-headphones",
      name: "Arc Headphones",
      category: "Audio",
      price: 129,
      image: "assets/product-headphones.png"
    },
    "day-bottle": {
      id: "day-bottle",
      name: "Day Bottle",
      category: "Hydration",
      price: 38,
      image: "assets/product-bottle.png"
    },
    "field-pack": {
      id: "field-pack",
      name: "Field Pack",
      category: "Carry",
      price: 94,
      image: "assets/product-backpack.png"
    },
    "tempo-runner": {
      id: "tempo-runner",
      name: "Tempo Runner",
      category: "Footwear",
      price: 112,
      image: "assets/product-sneaker.png"
    }
  };

  const CART_KEY = "northPineCart";
  const PROFILE_KEY = "northPineProfile";
  const SESSION_KEY = "northPineSession";
  const FREE_SHIPPING_THRESHOLD = 75;
  const STANDARD_SHIPPING = 7.5;
  const TAX_RATE = 0.08;
  const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

  const byId = (id) => document.getElementById(id);
  const safeParse = (value, fallback) => {
    try { return JSON.parse(value) ?? fallback; } catch { return fallback; }
  };
  const local = {
    get(key, fallback) {
      try { return safeParse(window.localStorage.getItem(key), fallback); } catch { return fallback; }
    },
    set(key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ }
    },
    remove(key) {
      try { window.localStorage.removeItem(key); } catch { /* Storage is optional. */ }
    }
  };
  const session = {
    get(key, fallback) {
      try { return safeParse(window.sessionStorage.getItem(key), fallback); } catch { return fallback; }
    },
    set(key, value) {
      try { window.sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage is optional. */ }
    },
    remove(key) {
      try { window.sessionStorage.removeItem(key); } catch { /* Storage is optional. */ }
    }
  };

  let cart = normalizeCart(local.get(CART_KEY, {}));
  let profile = local.get(PROFILE_KEY, null);
  let currentUser = session.get(SESSION_KEY, false) && profile ? profile : null;

  const cartCount = byId("cartCount");
  const cartButton = byId("cartButton");
  const cartItemLabel = byId("cartItemLabel");
  const cartLiveRegion = byId("cartLiveRegion");
  const emptyCart = byId("emptyCart");
  const cartContent = byId("cartContent");
  const cartItems = byId("cartItems");
  const shippingMessage = byId("shippingMessage");
  const shippingProgress = byId("shippingProgress");
  const checkoutButton = byId("checkoutButton");
  const accountButton = byId("accountButton");
  const accountLabel = byId("accountLabel");
  const accountEmail = byId("accountEmail");
  const authModal = byId("authModal");
  const checkoutModal = byId("checkoutModal");
  const checkoutForm = byId("checkoutForm");
  const orderSuccess = byId("orderSuccess");
  const placeOrderButton = byId("placeOrderButton");
  const checkoutCloseButton = byId("checkoutCloseButton");
  const toastElement = byId("storeToast");
  const storeToast = window.bootstrap ? bootstrap.Toast.getOrCreateInstance(toastElement, { delay: 2600 }) : null;
  let orderSubmitting = false;

  function normalizeCart(candidate) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return {};
    return Object.fromEntries(
      Object.entries(candidate)
        .filter(([id, quantity]) => PRODUCTS[id] && Number.isInteger(Number(quantity)) && Number(quantity) > 0)
        .map(([id, quantity]) => [id, Math.min(Number(quantity), 20)])
    );
  }

  function getCartEntries() {
    return Object.entries(cart)
      .filter(([id, quantity]) => PRODUCTS[id] && quantity > 0)
      .map(([id, quantity]) => ({ ...PRODUCTS[id], quantity }));
  }

  function getTotals() {
    const subtotal = getCartEntries().reduce((sum, item) => sum + item.price * item.quantity, 0);
    const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : STANDARD_SHIPPING;
    const tax = subtotal * TAX_RATE;
    return { subtotal, shipping, tax, total: subtotal + shipping + tax };
  }

  function persistCart() {
    local.set(CART_KEY, cart);
  }

  function announce(message) {
    cartLiveRegion.textContent = "";
    window.requestAnimationFrame(() => { cartLiveRegion.textContent = message; });
  }

  function showToast(message, icon = "bi-check-lg") {
    byId("toastMessage").textContent = message;
    const iconElement = toastElement.querySelector(".toast-icon i");
    iconElement.className = `bi ${icon}`;
    storeToast?.show();
  }

  function renderCart() {
    const entries = getCartEntries();
    const quantity = entries.reduce((sum, item) => sum + item.quantity, 0);
    const totals = getTotals();

    cartCount.textContent = String(quantity);
    cartItemLabel.textContent = `(${quantity})`;
    cartButton.setAttribute("aria-label", `Open cart, ${quantity} ${quantity === 1 ? "item" : "items"}`);

    if (entries.length === 0) {
      emptyCart.classList.remove("d-none");
      cartContent.classList.add("d-none");
      cartContent.classList.remove("d-flex");
      cartItems.innerHTML = "";
    } else {
      emptyCart.classList.add("d-none");
      cartContent.classList.remove("d-none");
      cartContent.classList.add("d-flex");
      cartItems.innerHTML = entries.map((item) => `
        <article class="cart-item" data-cart-item="${item.id}">
          <div class="cart-item-image"><img src="${item.image}" alt="" width="88" height="88"></div>
          <div class="cart-item-info">
            <h3>${item.name}</h3>
            <span>${item.category}</span>
            <div class="quantity-control" aria-label="Quantity for ${item.name}">
              <button type="button" data-cart-action="decrease" data-product-id="${item.id}" aria-label="Decrease ${item.name} quantity"><i class="bi bi-dash" aria-hidden="true"></i></button>
              <span aria-live="polite">${item.quantity}</span>
              <button type="button" data-cart-action="increase" data-product-id="${item.id}" aria-label="Increase ${item.name} quantity" ${item.quantity >= 20 ? "disabled" : ""}><i class="bi bi-plus" aria-hidden="true"></i></button>
            </div>
          </div>
          <div class="cart-item-side">
            <strong>${currency.format(item.price * item.quantity)}</strong>
            <button class="remove-item" type="button" data-cart-action="remove" data-product-id="${item.id}" aria-label="Remove ${item.name} from cart">Remove</button>
          </div>
        </article>
      `).join("");
    }

    byId("cartSubtotal").textContent = currency.format(totals.subtotal);
    byId("cartShipping").textContent = totals.shipping === 0 && totals.subtotal > 0 ? "Free" : currency.format(totals.shipping);
    byId("cartTax").textContent = currency.format(totals.tax);
    byId("cartTotal").textContent = currency.format(totals.total);

    const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - totals.subtotal);
    const progress = Math.min(100, (totals.subtotal / FREE_SHIPPING_THRESHOLD) * 100);
    shippingProgress.style.width = `${progress}%`;
    shippingProgress.parentElement.setAttribute("aria-valuenow", String(Math.round(progress)));
    shippingMessage.textContent = remaining > 0
      ? `Add ${currency.format(remaining)} for free shipping`
      : "You unlocked free shipping";

    renderCheckoutSummary();
  }

  function addToCart(productId, quantity = 1, options = {}) {
    const product = PRODUCTS[productId];
    if (!product) throw new Error("Unknown product.");
    const nextQuantity = Math.min(20, (cart[productId] || 0) + Math.max(1, Number(quantity) || 1));
    cart[productId] = nextQuantity;
    persistCart();
    renderCart();
    if (!options.silent) {
      showToast(`${product.name} added to your cart.`);
      announce(`${product.name} added. Quantity ${nextQuantity}.`);
    }
    return { product_id: productId, quantity: nextQuantity, cart_total: getTotals().total };
  }

  function updateCartItem(productId, quantity, options = {}) {
    const product = PRODUCTS[productId];
    if (!product) throw new Error("Unknown product.");
    const normalized = Math.max(0, Math.min(20, Math.trunc(Number(quantity))));
    if (!Number.isFinite(normalized)) throw new Error("Quantity must be a number.");
    if (Number(quantity) > 20 && !options.silent) announce(`${product.name} is limited to 20 per cart.`);
    if (normalized === 0) delete cart[productId];
    else cart[productId] = normalized;
    persistCart();
    renderCart();
    if (!options.silent) announce(normalized === 0 ? `${product.name} removed from your cart.` : `${product.name} quantity updated to ${normalized}.`);
    return { product_id: productId, quantity: normalized, cart_total: getTotals().total };
  }

  function renderCheckoutSummary() {
    const container = byId("checkoutItems");
    if (!container) return;
    const entries = getCartEntries();
    const totals = getTotals();
    container.innerHTML = entries.map((item) => `
      <div class="checkout-item">
        <div class="checkout-item-image"><img src="${item.image}" alt="" width="62" height="62"><span class="checkout-item-qty">${item.quantity}</span></div>
        <div class="checkout-item-info"><strong>${item.name}</strong><span>${item.category}</span></div>
        <strong>${currency.format(item.price * item.quantity)}</strong>
      </div>
    `).join("");
    byId("checkoutSubtotal").textContent = currency.format(totals.subtotal);
    byId("checkoutShipping").textContent = totals.shipping === 0 && totals.subtotal > 0 ? "Free" : currency.format(totals.shipping);
    byId("checkoutTax").textContent = currency.format(totals.tax);
    byId("checkoutTotal").textContent = currency.format(totals.total);
  }

  function flashAddButton(button) {
    const label = button.querySelector("span");
    const icon = button.querySelector("i");
    const originalLabel = label.textContent;
    const originalIcon = icon.className;
    button.classList.add("is-added");
    label.textContent = "Added";
    icon.className = "bi bi-check-lg";
    window.setTimeout(() => {
      button.classList.remove("is-added");
      label.textContent = originalLabel;
      icon.className = originalIcon;
    }, 1200);
  }

  document.addEventListener("click", (event) => {
    const addButton = event.target.closest("[data-add-product]");
    if (addButton) {
      addToCart(addButton.dataset.addProduct);
      flashAddButton(addButton);
      return;
    }

    const authSwitch = event.target.closest("[data-switch-auth], [data-auth-tab]");
    if (authSwitch) showAuthTab(authSwitch.dataset.switchAuth || authSwitch.dataset.authTab);

    if (event.target.closest("[data-scroll-shop]")) {
      window.setTimeout(() => byId("shop").scrollIntoView({ behavior: "smooth" }), 250);
    }
  });

  cartItems.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-cart-action]");
    if (!actionButton) return;
    const id = actionButton.dataset.productId;
    const currentQuantity = cart[id] || 0;
    if (actionButton.dataset.cartAction === "increase") updateCartItem(id, currentQuantity + 1);
    if (actionButton.dataset.cartAction === "decrease") updateCartItem(id, currentQuantity - 1);
    if (actionButton.dataset.cartAction === "remove") {
      updateCartItem(id, 0);
      showToast(`${PRODUCTS[id].name} removed.`, "bi-trash3");
    }
  });

  function showAuthTab(name) {
    const tab = byId(name === "signup" ? "signupTab" : "loginTab");
    if (window.bootstrap && tab) bootstrap.Tab.getOrCreateInstance(tab).show();
  }

  function updateAuthHeading(targetId) {
    const signingUp = targetId === "signupPane";
    byId("authModalTitle").textContent = signingUp ? "Make yourself at home." : "Welcome back.";
    byId("authIntro").textContent = signingUp
      ? "Create a browser-local profile for this demo store."
      : "Sign in to your browser-local demo profile.";
  }

  document.querySelectorAll('[data-bs-toggle="pill"]').forEach((tab) => {
    tab.addEventListener("shown.bs.tab", (event) => updateAuthHeading(event.target.dataset.bsTarget.slice(1)));
  });

  authModal.addEventListener("show.bs.modal", (event) => {
    const requestedTab = event.relatedTarget?.dataset.authTab;
    if (requestedTab) showAuthTab(requestedTab);
  });

  function renderAccount() {
    if (currentUser) {
      accountLabel.textContent = `Hi, ${currentUser.name}`;
      accountEmail.textContent = currentUser.email;
      accountButton.removeAttribute("data-bs-target");
      accountButton.setAttribute("data-bs-toggle", "dropdown");
      accountButton.setAttribute("aria-expanded", "false");
    } else {
      accountLabel.textContent = "Sign in";
      accountEmail.textContent = "";
      accountButton.setAttribute("data-bs-toggle", "modal");
      accountButton.setAttribute("data-bs-target", "#authModal");
      accountButton.removeAttribute("aria-expanded");
    }
  }

  async function hashPassword(value) {
    if (window.crypto?.subtle && window.TextEncoder) {
      const bytes = new TextEncoder().encode(value);
      const digest = await window.crypto.subtle.digest("SHA-256", bytes);
      return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    }
    return window.btoa(unescape(encodeURIComponent(value)));
  }

  const signupForm = byId("signupForm");
  const signupConfirm = byId("signupConfirm");
  const signupPassword = byId("signupPassword");
  signupConfirm.addEventListener("input", () => {
    signupConfirm.setCustomValidity(signupConfirm.value === signupPassword.value ? "" : "Passwords do not match.");
  });
  signupPassword.addEventListener("input", () => {
    if (signupConfirm.value) signupConfirm.setCustomValidity(signupConfirm.value === signupPassword.value ? "" : "Passwords do not match.");
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    signupConfirm.setCustomValidity(signupConfirm.value === signupPassword.value ? "" : "Passwords do not match.");
    signupForm.classList.add("was-validated");
    if (!signupForm.checkValidity()) return;

    const submitButton = signupForm.querySelector('[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = "Creating account…";
    try {
      const nextProfile = {
        name: byId("signupName").value.trim(),
        email: byId("signupEmail").value.trim().toLowerCase(),
        passwordHash: await hashPassword(signupPassword.value)
      };
      profile = nextProfile;
      currentUser = nextProfile;
      local.set(PROFILE_KEY, nextProfile);
      session.set(SESSION_KEY, true);
      renderAccount();
      prefillCheckout();
      bootstrap.Modal.getOrCreateInstance(authModal).hide();
      showToast(`Welcome, ${nextProfile.name}. Your account is ready.`);
      signupForm.reset();
      signupForm.classList.remove("was-validated");
    } catch {
      showToast("We couldn’t create the local profile. Please try again.", "bi-exclamation-circle");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = "Create account";
    }
  });

  const loginForm = byId("loginForm");
  const loginError = byId("loginError");
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    loginForm.classList.add("was-validated");
    loginError.classList.add("d-none");
    if (!loginForm.checkValidity()) return;

    const email = byId("loginEmail").value.trim().toLowerCase();
    const passwordHash = await hashPassword(byId("loginPassword").value);
    profile = local.get(PROFILE_KEY, null);
    if (!profile || profile.email !== email || profile.passwordHash !== passwordHash) {
      loginError.textContent = profile
        ? "That email and password don’t match your local profile."
        : "No local profile found yet. Create an account first.";
      loginError.classList.remove("d-none");
      return;
    }

    currentUser = profile;
    session.set(SESSION_KEY, true);
    renderAccount();
    prefillCheckout();
    bootstrap.Modal.getOrCreateInstance(authModal).hide();
    showToast(`Welcome back, ${profile.name}.`);
    loginForm.reset();
    loginForm.classList.remove("was-validated");
  });

  byId("logoutButton").addEventListener("click", () => {
    currentUser = null;
    session.remove(SESSION_KEY);
    renderAccount();
    showToast("You’re signed out.", "bi-box-arrow-right");
  });

  authModal.addEventListener("hidden.bs.modal", () => {
    loginError.classList.add("d-none");
    document.querySelectorAll("#authModal .was-validated").forEach((form) => form.classList.remove("was-validated"));
  });

  function prefillCheckout() {
    if (!currentUser) return;
    byId("checkoutEmail").value = currentUser.email || "";
    const names = (currentUser.name || "").trim().split(/\s+/);
    if (!byId("firstName").value) byId("firstName").value = names[0] || "";
    if (!byId("lastName").value && names.length > 1) byId("lastName").value = names.slice(1).join(" ");
  }

  function openCheckout() {
    if (getCartEntries().length === 0) throw new Error("Your cart is empty.");
    renderCheckoutSummary();
    prefillCheckout();
    const drawerElement = byId("cartDrawer");
    const drawer = bootstrap.Offcanvas.getOrCreateInstance(drawerElement);
    const showModal = () => bootstrap.Modal.getOrCreateInstance(checkoutModal).show();
    if (drawerElement.classList.contains("show")) {
      drawerElement.addEventListener("hidden.bs.offcanvas", showModal, { once: true });
      drawer.hide();
    } else {
      showModal();
    }
    return { status: "checkout_opened", item_count: getCartEntries().reduce((sum, item) => sum + item.quantity, 0) };
  }

  checkoutButton.addEventListener("click", () => openCheckout());

  const cardNumber = byId("cardNumber");
  const cardExpiry = byId("cardExpiry");
  const cardCvc = byId("cardCvc");
  cardNumber.addEventListener("input", () => {
    const digits = cardNumber.value.replace(/\D/g, "").slice(0, 16);
    cardNumber.value = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
  });
  cardExpiry.addEventListener("input", () => {
    const digits = cardExpiry.value.replace(/\D/g, "").slice(0, 4);
    cardExpiry.value = digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
  });
  cardCvc.addEventListener("input", () => {
    cardCvc.value = cardCvc.value.replace(/\D/g, "").slice(0, 4);
  });

  checkoutForm.addEventListener("submit", (event) => {
    event.preventDefault();
    event.stopPropagation();
    checkoutForm.classList.add("was-validated");
    if (!checkoutForm.checkValidity()) {
      checkoutForm.querySelector(":invalid")?.focus();
      return;
    }

    orderSubmitting = true;
    checkoutForm.setAttribute("aria-busy", "true");
    checkoutCloseButton.disabled = true;
    placeOrderButton.disabled = true;
    placeOrderButton.innerHTML = '<span class="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>Placing order…';
    window.setTimeout(completeOrder, 650);
  });

  function completeOrder() {
    const firstName = byId("firstName").value.trim() || currentUser?.name || "friend";
    const stamp = Date.now().toString().slice(-6);
    const orderNumber = `NP-${stamp}`;
    byId("orderFirstName").textContent = firstName.split(/\s+/)[0];
    byId("orderNumber").textContent = orderNumber;
    cart = {};
    persistCart();
    renderCart();
    checkoutForm.classList.add("d-none");
    orderSuccess.classList.add("is-visible");
    orderSubmitting = false;
    checkoutForm.removeAttribute("aria-busy");
    checkoutCloseButton.disabled = false;
    placeOrderButton.disabled = false;
    placeOrderButton.innerHTML = '<span>Place demo order</span><i class="bi bi-lock-fill ms-1" aria-hidden="true"></i>';
    orderSuccess.querySelector("button").focus();
  }

  byId("continueShopping").addEventListener("click", () => {
    bootstrap.Modal.getOrCreateInstance(checkoutModal).hide();
    window.setTimeout(() => byId("shop").scrollIntoView({ behavior: "smooth" }), 250);
  });

  checkoutModal.addEventListener("hide.bs.modal", (event) => {
    if (orderSubmitting) event.preventDefault();
  });

  checkoutModal.addEventListener("hidden.bs.modal", () => {
    if (orderSuccess.classList.contains("is-visible")) {
      orderSuccess.classList.remove("is-visible");
      checkoutForm.classList.remove("d-none", "was-validated");
      checkoutForm.reset();
      prefillCheckout();
    }
  });

  document.querySelectorAll("#mainNav a").forEach((link) => {
    link.addEventListener("click", () => {
      const collapseElement = byId("mainNav");
      if (collapseElement.classList.contains("show")) bootstrap.Collapse.getOrCreateInstance(collapseElement).hide();
    });
  });

  function registerWebMcpTools() {
    const context = document.modelContext;
    if (!context?.registerTool) return;

    const tools = [
      {
        name: "list_products",
        title: "List products",
        description: "List the products currently available in the North & Pine storefront.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute() {
          return Object.values(PRODUCTS).map(({ id, name, category, price }) => ({ id, name, category, price }));
        }
      },
      {
        name: "get_cart",
        title: "Read shopping cart",
        description: "Read the current cart contents and totals without changing them.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: true, untrustedContentHint: false },
        execute() {
          return { items: getCartEntries().map(({ id, name, price, quantity }) => ({ id, name, price, quantity })), ...getTotals() };
        }
      },
      {
        name: "add_product_to_cart",
        title: "Add product to cart",
        description: "Add a listed product to the visible shopping cart.",
        inputSchema: {
          type: "object",
          properties: { productId: { type: "string", enum: Object.keys(PRODUCTS) }, quantity: { type: "integer", minimum: 1, maximum: 20 } },
          required: ["productId"],
          additionalProperties: false
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          if (!input || !PRODUCTS[input.productId]) throw new Error("Choose a valid productId.");
          return addToCart(input.productId, input.quantity || 1);
        }
      },
      {
        name: "update_cart_item",
        title: "Update cart item",
        description: "Set a product quantity in the visible cart. Use zero to remove it.",
        inputSchema: {
          type: "object",
          properties: { productId: { type: "string", enum: Object.keys(PRODUCTS) }, quantity: { type: "integer", minimum: 0, maximum: 20 } },
          required: ["productId", "quantity"],
          additionalProperties: false
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) {
          if (!input || !PRODUCTS[input.productId] || !Number.isInteger(input.quantity)) throw new Error("Provide a valid productId and integer quantity.");
          return updateCartItem(input.productId, input.quantity);
        }
      },
      {
        name: "start_checkout",
        title: "Start checkout",
        description: "Open the checkout form for the products currently in the cart.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute() { return openCheckout(); }
      }
    ];

    tools.forEach((tool) => {
      try { Promise.resolve(context.registerTool(tool)).catch(() => {}); } catch { /* Unsupported implementations fail quietly. */ }
    });
  }

  renderCart();
  renderAccount();
  prefillCheckout();
  registerWebMcpTools();
})();
