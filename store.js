/**
 * The Green Room — Shopify Headless Store Engine
 * Storefront API integration with live inventory, description & pricing.
 * Design System: Organic Minimalism | Mobile-First
 */
// Inject global transition styles to prevent content flash during loading
(function() {
  const style = document.createElement('style');
  style.textContent = `
    body {
      opacity: 0;
      transition: opacity 0.22s ease-in-out !important;
    }
    body.fade-in {
      opacity: 1 !important;
    }
  `;
  document.head.appendChild(style);
})();

// ─── Shopify Storefront Config ────────────────────────────────────────────────
const SHOPIFY_CONFIG = {
  domain: 'thegreenroom-6728.myshopify.com',
  storefrontAccessToken: '940b408743e7fc0492c5eb0302d81846',
  apiVersion: '2024-01'
};

// ─── Shopify GraphQL Fetcher ──────────────────────────────────────────────────
async function shopifyQuery(query, variables = {}) {
  const url = `https://${SHOPIFY_CONFIG.domain}/api/${SHOPIFY_CONFIG.apiVersion}/graphql.json`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Storefront-Access-Token': SHOPIFY_CONFIG.storefrontAccessToken
      },
      body: JSON.stringify({ query, variables })
    });
    const json = await res.json();
    if (json.errors) {
      console.error('[Shopify]', json.errors);
      return null;
    }
    return json.data;
  } catch (e) {
    console.error('[Shopify fetch error]', e);
    return null;
  }
}

// ─── Product Handle ↔ Page Map ───────────────────────────────────────────────
const HANDLE_TO_PAGE = {
  'green-tote': 'green-tote.html',
  'blue-tote': 'blue-tote.html',
  'red-tote': 'red-tote.html'
};

// Maps Shopify product handles to their design color subtitle
const HANDLE_TO_COLOR = {
  'green-tote': 'Forest Green',
  'blue-tote': 'Deep Indigo',
  'red-tote': 'Warm Clay'
};

// ─── Fallback product images (used if Shopify has none) ──────────────────────
const FALLBACK_IMAGES = {
  'green-tote': 'https://lh3.googleusercontent.com/aida-public/AB6AXuC4iDTklygtlJaOLjGOS_8lAquoZiHZ0mBPjgX4Ru_T4puyqEowRtgMFy6Jtj2bc_-bLE3Xo_Nz4k6XMUJUIqvvjiniZ_7bxDJouzwJvSm3uOaRHG-IsAI2ovr4YghhF4Yi_AxVVNgDVJI4mjTMVA2DBdT7eNQHRRk19EtoKGst9YRs-1rMjrEW96XUNKKTMPKCYs10Ba4kPoHTXuZRjK8iqaZ6WYHkw_TJJGSmvrtxXaOUggJwvAgW8n9-o9hNd9AeTimJ6LZrfGHB',
  'blue-tote': 'https://lh3.googleusercontent.com/aida-public/AB6AXuCAYfzuSD0vlq2-qfV-BBox0EOA95KlRS-5wZJCRiDKnVRZETn9nxiVZJt5QILJvnNGgRcXXIyEnIR-NzEqvpSC8vCeT1pub9j7C_yL15FdqL03QT2ef5Pq7_2cs16WmgksqAXZKZWUm-Pm55WiCC8OcVemxp1J9lYNw8Hx-v7EdzIs1RKn8Ll-ULypgoZOrNG3kProZvUllpdbHqlAkeylpB9FKz_66nXAVymcA3_LjKLP212UMWdKx7YP_HycFdwtAK_1fL7JHaqTHbE',
  'red-tote': 'https://lh3.googleusercontent.com/aida-public/AB6AXuAirX-FFYsnn_DIU7EAbhU8UFAC4NnScsuZVtF5ZEjoaeSauy7FNuqPlVb7xe0LRz43DdAgxvg1XmLttR8XjMeNHOc0Ppby9lemJ_wzlJ01aHDDf5btKNgkEmkTAFZLKEQXL2v7yWgtB-YKyNiWlptEQu7X-MDPumTnc3uNiTmWqVbVCrmaLtz9cYuH4q4MUH7c4L7hF4Fjc8o3tyEN8bm5U-Vfoea4gfFspiYk5D0-Vg8HN-FXEsK_kXR8mKfZX2fLcLk0eL5NT_PH'
};

// ─── GraphQL Queries ──────────────────────────────────────────────────────────
const QUERIES = {
  allProducts: `{
    products(first: 10) {
      edges {
        node {
          id
          title
          handle
          description
          priceRange {
            minVariantPrice { amount currencyCode }
          }
          variants(first: 5) {
            edges {
              node {
                id
                title
                availableForSale
                quantityAvailable
              }
            }
          }
          images(first: 3) {
            edges { node { url altText } }
          }
        }
      }
    }
  }`,

  productByHandle: `query getProduct($handle: String!) {
    productByHandle(handle: $handle) {
      id
      title
      handle
      description
      priceRange {
        minVariantPrice { amount currencyCode }
      }
      variants(first: 5) {
        edges {
          node {
            id
            title
            availableForSale
            quantityAvailable
          }
        }
      }
      images(first: 5) {
        edges { node { url altText } }
      }
    }
  }`
};

// ─── Shopify Checkout (Cart API) ──────────────────────────────────────────────
const CART_CREATE_MUTATION = `
  mutation cartCreate($input: CartInput!) {
    cartCreate(input: $input) {
      cart {
        id
        checkoutUrl
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ─── Product Cache (populated on page load & saved to sessionStorage) ─────────
let PRODUCTS_CACHE = {};
try {
  const cached = sessionStorage.getItem('tgr_products_cache');
  if (cached) {
    PRODUCTS_CACHE = JSON.parse(cached);
  }
} catch (e) {}

function saveProductsCache() {
  try {
    sessionStorage.setItem('tgr_products_cache', JSON.stringify(PRODUCTS_CACHE));
  } catch (e) {}
}

async function fetchAllProducts() {
  const data = await shopifyQuery(QUERIES.allProducts);
  if (!data) return PRODUCTS_CACHE;
  const map = {};
  data.products.edges.forEach(({ node }) => {
    const variant = node.variants.edges[0]?.node || {};
    const image = node.images.edges[0]?.node;
    map[node.handle] = {
      id: node.id,
      variantId: variant.id,
      handle: node.handle,
      name: node.title,
      description: node.description,
      price: parseFloat(node.priceRange.minVariantPrice.amount),
      currency: node.priceRange.minVariantPrice.currencyCode,
      available: variant.availableForSale,
      quantity: variant.quantityAvailable,
      image: image?.url || FALLBACK_IMAGES[node.handle] || '',
      imageAlt: image?.altText || node.title,
      url: HANDLE_TO_PAGE[node.handle] || '#'
    };
  });
  PRODUCTS_CACHE = { ...PRODUCTS_CACHE, ...map };
  saveProductsCache();
  return PRODUCTS_CACHE;
}

async function fetchProductByHandle(handle) {
  const data = await shopifyQuery(QUERIES.productByHandle, { handle });
  if (!data?.productByHandle) return null;
  const node = data.productByHandle;
  const variant = node.variants.edges[0]?.node || {};
  const images = node.images.edges.map(e => ({ url: e.node.url, alt: e.node.altText || node.title }));
  return {
    id: node.id,
    variantId: variant.id,
    handle: node.handle,
    name: node.title,
    description: node.description,
    price: parseFloat(node.priceRange.minVariantPrice.amount),
    currency: node.priceRange.minVariantPrice.currencyCode,
    available: variant.availableForSale,
    quantity: variant.quantityAvailable,
    image: images[0]?.url || FALLBACK_IMAGES[handle] || '',
    images: images.length ? images : [{ url: FALLBACK_IMAGES[handle] || '', alt: node.title }],
    url: HANDLE_TO_PAGE[handle] || '#'
  };
}

// ─── Currency Formatter ───────────────────────────────────────────────────────
function formatPrice(amount, currency = 'BHD') {
  if (amount === 0 || isNaN(amount)) return 'Free';
  try {
    return new Intl.NumberFormat('en-BH', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 3
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(3)}`;
  }
}

// ─── Inventory Badge ──────────────────────────────────────────────────────────
function inventoryBadge(product) {
  if (!product.available) {
    return `<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-error/10 border border-error/20 text-error font-label-md text-xs font-semibold">
      <span class="w-1.5 h-1.5 rounded-full bg-error inline-block"></span>Out of Stock
    </span>`;
  }
  if (product.quantity !== undefined && product.quantity !== null && product.quantity <= 5 && product.quantity > 0) {
    return `<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-tertiary/10 border border-tertiary/20 text-tertiary font-label-md text-xs font-semibold">
      <span class="w-1.5 h-1.5 rounded-full bg-tertiary inline-block"></span>Only ${product.quantity} left
    </span>`;
  }
  return `<span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary font-label-md text-xs font-semibold">
    <span class="w-1.5 h-1.5 rounded-full bg-primary inline-block"></span>In Stock
  </span>`;
}

// ─── Global Store State ────────────────────────────────────────────────────────
const Store = {
  cart: [],

  init() {
    try {
      const stored = localStorage.getItem('tgr_cart');
      this.cart = stored ? JSON.parse(stored) : [];
    } catch (e) {
      this.cart = [];
    }
  },

  save() {
    try {
      localStorage.setItem('tgr_cart', JSON.stringify(this.cart));
    } catch (e) { /* silent */ }
    this.updateUI();
  },

  getCartCount() {
    return this.cart.reduce((t, item) => t + item.quantity, 0);
  },

  getCartSubtotal() {
    return this.cart.reduce((t, item) => t + (item.price * item.quantity), 0);
  },

  getCartCurrency() {
    return this.cart[0]?.currency || 'BHD';
  },

  addToCart(handle, quantity = 1) {
    const product = PRODUCTS_CACHE[handle];
    if (!product) {
      showToast('Product not found.'); return;
    }
    if (!product.available) {
      showToast('This item is out of stock.'); return;
    }

    const existing = this.cart.find(item => item.handle === handle);
    if (existing) {
      existing.quantity += quantity;
    } else {
      this.cart.push({
        handle: product.handle,
        variantId: product.variantId,
        name: product.name,
        price: product.price,
        currency: product.currency,
        image: product.image,
        quantity
      });
    }

    this.save();
    showToast(`${product.name} added to bag!`, () => toggleCartDrawer(true));
  },

  updateQuantity(handle, delta) {
    const item = this.cart.find(i => i.handle === handle);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) this.removeFromCart(handle);
    else this.save();
  },

  removeFromCart(handle) {
    this.cart = this.cart.filter(i => i.handle !== handle);
    this.save();
  },

  clearCart() {
    this.cart = [];
    this.save();
  },

  updateUI() {
    const count = this.getCartCount();
    document.querySelectorAll('.cart-badge').forEach(badge => {
      badge.textContent = count;
      badge.classList.toggle('hidden', count === 0);
      badge.classList.toggle('flex', count > 0);
    });
    renderCartDrawerItems();
  }
};

// ─── Drawer Toggles ───────────────────────────────────────────────────────────
function toggleMenuDrawer(open) {
  const drawer = document.getElementById('global-menu-drawer');
  const backdrop = document.getElementById('global-backdrop');
  if (!drawer || !backdrop) return;
  if (open) {
    backdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      backdrop.classList.remove('opacity-0');
      drawer.classList.remove('-translate-x-full');
    }, 10);
  } else {
    drawer.classList.add('-translate-x-full');
    backdrop.classList.add('opacity-0');
    document.body.style.overflow = '';
    setTimeout(() => backdrop.classList.add('hidden'), 300);
  }
}

function toggleCartDrawer(open) {
  const drawer = document.getElementById('global-cart-drawer');
  const backdrop = document.getElementById('global-backdrop');
  if (!drawer || !backdrop) return;
  if (open) {
    backdrop.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    setTimeout(() => {
      backdrop.classList.remove('opacity-0');
      drawer.classList.remove('translate-x-full');
    }, 10);
  } else {
    drawer.classList.add('translate-x-full');
    backdrop.classList.add('opacity-0');
    document.body.style.overflow = '';
    setTimeout(() => backdrop.classList.add('hidden'), 300);
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function showToast(message, onClickAction = null) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed top-20 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-2 pointer-events-none w-[90%] max-w-sm';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'bg-primary/95 text-on-primary font-label-md px-6 py-4 rounded-xl shadow-lg border border-primary-container/20 flex items-center justify-between gap-4 pointer-events-auto cursor-pointer transition-all duration-300 transform scale-95 opacity-0';
  toast.innerHTML = `
    <div class="flex items-center gap-2">
      <span class="material-symbols-outlined text-xl">spa</span>
      <span class="text-sm font-semibold">${message}</span>
    </div>
    ${onClickAction ? '<span class="text-xs uppercase font-bold text-inverse-primary border-b border-inverse-primary/50 tracking-wider">View Bag</span>' : ''}
  `;
  if (onClickAction) toast.addEventListener('click', () => { onClickAction(); toast.remove(); });
  container.appendChild(toast);
  setTimeout(() => toast.classList.remove('scale-95', 'opacity-0'), 10);
  setTimeout(() => {
    toast.classList.add('scale-95', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ─── Global Drawers Injection ─────────────────────────────────────────────────
function injectGlobalDrawers() {
  // Backdrop
  if (!document.getElementById('global-backdrop')) {
    const backdrop = document.createElement('div');
    backdrop.id = 'global-backdrop';
    backdrop.className = 'fixed inset-0 bg-on-background/40 backdrop-blur-sm z-[90] transition-opacity duration-300 opacity-0 hidden';
    backdrop.addEventListener('click', () => { toggleMenuDrawer(false); toggleCartDrawer(false); });
    document.body.appendChild(backdrop);
  }

  // Menu Drawer (Left)
  if (!document.getElementById('global-menu-drawer')) {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const isHome = currentPath === 'index.html' || currentPath === '';
    const isShop = currentPath === 'collection.html';
    const isStory = currentPath === 'about.html';
    const isContact = currentPath === 'contact.html';

    const menuDrawer = document.createElement('nav');
    menuDrawer.id = 'global-menu-drawer';
    menuDrawer.ariaLabel = 'Main Navigation';
    menuDrawer.className = 'fixed top-0 left-0 h-full w-80 bg-surface rounded-r-2xl shadow-2xl border-r border-outline-variant/15 z-[100] flex flex-col p-6 transition-transform duration-300 ease-in-out -translate-x-full';
    menuDrawer.innerHTML = `
      <div class="flex items-center justify-between py-6">
        <h2 class="font-headline-md text-primary font-bold tracking-widest uppercase">THE GREEN ROOM</h2>
        <button id="close-menu-btn" aria-label="Close menu" class="text-on-surface-variant hover:text-primary transition-colors p-2 rounded-full hover:bg-surface-container-high">
          <span class="material-symbols-outlined text-2xl">close</span>
        </button>
      </div>
      <ul class="flex flex-col gap-sm flex-grow mt-8 overflow-y-auto">
        <li>
          <a class="flex items-center gap-md px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${isHome ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-primary'}" href="index.html">
            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' ${isHome ? '1' : '0'};">home</span>
            <span>Home</span>
          </a>
        </li>
        <li>
          <a class="flex items-center gap-md px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${isShop ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-primary'}" href="collection.html">
            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' ${isShop ? '1' : '0'};">storefront</span>
            <span>Shop</span>
          </a>
        </li>
        <li>
          <a class="flex items-center gap-md px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${isStory ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-primary'}" href="about.html">
            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' ${isStory ? '1' : '0'};">auto_stories</span>
            <span>Story</span>
          </a>
        </li>
        <li>
          <a class="flex items-center gap-md px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${isContact ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface-variant hover:bg-surface-container-high hover:text-primary'}" href="contact.html">
            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' ${isContact ? '1' : '0'};">mail</span>
            <span>Contact</span>
          </a>
        </li>
      </ul>
      <div class="pt-6 border-t border-outline/10 text-center">
        <p class="font-body-md text-xs text-on-surface-variant leading-relaxed">Consciously Crafted in Bahrain</p>
      </div>
    `;
    document.body.appendChild(menuDrawer);
    document.getElementById('close-menu-btn').addEventListener('click', () => toggleMenuDrawer(false));
  }

  // Cart Drawer (Right)
  if (!document.getElementById('global-cart-drawer')) {
    const cartDrawer = document.createElement('aside');
    cartDrawer.id = 'global-cart-drawer';
    cartDrawer.className = 'fixed top-0 right-0 h-full w-[90%] max-w-sm bg-surface z-[100] flex flex-col shadow-2xl transition-transform duration-300 ease-in-out translate-x-full md:w-96 rounded-l-2xl';
    cartDrawer.innerHTML = `
      <header class="flex items-center justify-between p-6 border-b border-outline-variant/20 bg-surface rounded-tl-2xl">
        <h2 class="font-headline-md text-on-surface font-semibold flex items-center gap-2">
          <span>Your Bag</span>
          <span class="text-xs bg-primary-container/10 text-primary border border-primary/10 rounded-full px-2 py-0.5" id="cart-drawer-count">0</span>
        </h2>
        <button id="close-cart-btn" aria-label="Close cart" class="p-2 rounded-full text-on-surface-variant hover:text-primary hover:bg-surface-container-high transition-all">
          <span class="material-symbols-outlined text-2xl">close</span>
        </button>
      </header>
      <div class="flex-1 overflow-y-auto p-6 flex flex-col gap-4 no-scrollbar" id="cart-drawer-items-container"></div>
      <div class="p-6 bg-surface border-t border-outline-variant/20 shadow-[0_-4px_24px_rgba(0,104,56,0.04)] pb-safe rounded-bl-2xl">
        <div class="flex justify-between items-center mb-4">
          <span class="font-body-md text-on-surface-variant">Subtotal</span>
          <span class="font-headline-md text-headline-md-mobile text-primary font-bold" id="cart-drawer-subtotal">BHD 0.000</span>
        </div>
        <p class="font-body-md text-[13px] text-on-surface-variant/80 mb-6 leading-relaxed">Taxes & shipping calculated at checkout.</p>
        <button id="checkout-btn" class="w-full bg-primary text-on-primary hover:bg-surface-tint transition-all py-4 rounded-full font-label-md text-label-md flex justify-center items-center gap-2 shadow-md active:scale-95 duration-200">
          <span>Checkout</span>
          <span class="material-symbols-outlined text-sm">arrow_forward</span>
        </button>
      </div>
    `;
    document.body.appendChild(cartDrawer);
    document.getElementById('close-cart-btn').addEventListener('click', () => toggleCartDrawer(false));
    document.getElementById('checkout-btn').addEventListener('click', initiateShopifyCheckout);
  }
}

// ─── Render Cart Drawer Items ─────────────────────────────────────────────────
function renderCartDrawerItems() {
  const container = document.getElementById('cart-drawer-items-container');
  const subtotalEl = document.getElementById('cart-drawer-subtotal');
  const countBadge = document.getElementById('cart-drawer-count');
  if (!container) return;

  const count = Store.getCartCount();
  const subtotal = Store.getCartSubtotal();
  const currency = Store.getCartCurrency();

  if (countBadge) countBadge.textContent = count;
  if (subtotalEl) subtotalEl.textContent = formatPrice(subtotal, currency);

  if (Store.cart.length === 0) {
    container.innerHTML = `
      <div class="flex flex-col items-center justify-center h-full text-center py-12">
        <span class="material-symbols-outlined text-6xl text-outline-variant/50 mb-4 select-none">shopping_bag</span>
        <p class="font-headline-md text-on-surface mb-2">Your bag is empty</p>
        <p class="font-body-md text-on-surface-variant/70 max-w-[200px] mx-auto text-sm leading-relaxed">Add mindful, organic pieces from our shop to get started.</p>
        <button onclick="toggleCartDrawer(false)" class="mt-8 px-6 py-3 bg-primary text-on-primary hover:bg-surface-tint rounded-full font-label-md text-sm border border-primary/10 shadow-sm active:scale-95 duration-200">
          Continue Shopping
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = Store.cart.map(item => `
    <div class="flex gap-4 bg-surface-container-low p-3.5 rounded-xl border border-outline-variant/10 shadow-sm">
      <div class="w-20 h-24 rounded-lg overflow-hidden bg-surface-container shrink-0 border border-outline-variant/10">
        <img alt="${item.name}" class="w-full h-full object-cover" src="${item.image}">
      </div>
      <div class="flex flex-col flex-1 py-1">
        <div class="flex justify-between items-start gap-2">
          <h3 class="font-label-md text-on-surface text-sm font-semibold">${item.name}</h3>
          <button onclick="Store.removeFromCart('${item.handle}')" aria-label="Remove item" class="text-on-surface-variant hover:text-error transition-colors p-1 -mr-1 rounded-full hover:bg-surface-container-high">
            <span class="material-symbols-outlined text-[18px]">delete</span>
          </button>
        </div>
        <p class="font-body-md text-xs text-on-surface-variant mt-0.5">${formatPrice(item.price, item.currency)} each</p>
        <div class="mt-auto flex justify-between items-end">
          <div class="flex items-center bg-surface border border-outline-variant/20 rounded-full scale-90 -ml-2">
            <button onclick="Store.updateQuantity('${item.handle}', -1)" aria-label="Decrease quantity" class="w-7 h-7 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors">
              <span class="material-symbols-outlined text-[16px]">remove</span>
            </button>
            <span class="font-label-md text-xs w-6 text-center text-on-surface select-none">${item.quantity}</span>
            <button onclick="Store.updateQuantity('${item.handle}', 1)" aria-label="Increase quantity" class="w-7 h-7 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors">
              <span class="material-symbols-outlined text-[16px]">add</span>
            </button>
          </div>
          <p class="font-label-md text-sm text-primary font-bold">${formatPrice(item.price * item.quantity, item.currency)}</p>
        </div>
      </div>
    </div>
  `).join('');
}

// ─── Shopify Checkout (Real) ───────────────────────────────────────────────────
async function initiateShopifyCheckout() {
  if (Store.cart.length === 0) return;

  const btn = document.getElementById('checkout-btn');
  if (btn) {
    btn.innerHTML = `<span class="w-5 h-5 border-2 border-on-primary/40 border-t-on-primary rounded-full animate-spin"></span><span>Preparing checkout…</span>`;
    btn.disabled = true;
  }

  const lines = Store.cart.map(item => ({
    merchandiseId: item.variantId,
    quantity: item.quantity
  }));

  const data = await shopifyQuery(CART_CREATE_MUTATION, {
    input: { lines }
  });

  if (btn) {
    btn.innerHTML = `<span>Checkout</span><span class="material-symbols-outlined text-sm">arrow_forward</span>`;
    btn.disabled = false;
  }

  const cart = data?.cartCreate?.cart;
  const errors = data?.cartCreate?.userErrors;

  if (errors && errors.length > 0) {
    showToast('Checkout error: ' + errors[0].message);
    return;
  }

  if (cart?.checkoutUrl) {
    window.location.href = cart.checkoutUrl;
  } else {
    showToast('Could not start checkout. Please try again.');
  }
}

// ─── Header & Footer Binding ──────────────────────────────────────────────────
function bindHeaderAndFooter() {
  // Hamburger
  document.querySelectorAll('button[aria-label="Menu"]').forEach(btn => {
    btn.addEventListener('click', () => toggleMenuDrawer(true));
  });

  // Cart bag buttons
  document.querySelectorAll('button[aria-label="Shopping Bag"]').forEach(btn => {
    let badge = btn.querySelector('.cart-badge');
    if (!badge) {
      btn.classList.add('relative');
      badge = document.createElement('span');
      badge.className = 'cart-badge absolute -top-1 -right-1 w-5 h-5 bg-tertiary text-on-tertiary rounded-full font-label-md text-[10px] items-center justify-center hidden select-none';
      btn.appendChild(badge);
    }
    btn.addEventListener('click', () => toggleCartDrawer(true));
  });

  // Bottom Nav
  const currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav[class*="bottom-0"], div[class*="bottom-0"]').forEach(nav => {
    if (nav.id !== 'global-bottom-nav') nav.remove();
  });

  let bottomNav = document.getElementById('global-bottom-nav');
  if (!bottomNav) {
    bottomNav = document.createElement('nav');
    bottomNav.id = 'global-bottom-nav';
    document.body.appendChild(bottomNav);
  }

  const isHome = currentPath === 'index.html' || currentPath === '';
  const isShop = currentPath === 'collection.html';
  const isStory = currentPath === 'about.html';
  const isContact = currentPath === 'contact.html';

  bottomNav.className = 'md:hidden fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-lg border-t border-outline-variant/15 px-margin-mobile pb-safe pt-2.5 flex justify-between items-center z-[80] shadow-[0_-4px_24px_rgba(0,104,56,0.03)]';
  bottomNav.innerHTML = `
    <a href="index.html" class="flex flex-col items-center justify-center p-1.5 flex-1 transition-all ${isHome ? 'text-primary scale-105 font-semibold' : 'text-on-surface-variant hover:text-primary'}">
      <span class="material-symbols-outlined text-[24px] mb-1" style="font-variation-settings: 'FILL' ${isHome ? '1' : '0'};">home</span>
      <span class="text-[10px] tracking-wider uppercase font-label-md">Home</span>
    </a>
    <a href="collection.html" class="flex flex-col items-center justify-center p-1.5 flex-1 transition-all ${isShop ? 'text-primary scale-105 font-semibold' : 'text-on-surface-variant hover:text-primary'}">
      <span class="material-symbols-outlined text-[24px] mb-1" style="font-variation-settings: 'FILL' ${isShop ? '1' : '0'};">storefront</span>
      <span class="text-[10px] tracking-wider uppercase font-label-md">Shop</span>
    </a>
    <a href="about.html" class="flex flex-col items-center justify-center p-1.5 flex-1 transition-all ${isStory ? 'text-primary scale-105 font-semibold' : 'text-on-surface-variant hover:text-primary'}">
      <span class="material-symbols-outlined text-[24px] mb-1" style="font-variation-settings: 'FILL' ${isStory ? '1' : '0'};">auto_stories</span>
      <span class="text-[10px] tracking-wider uppercase font-label-md">Story</span>
    </a>
    <a href="contact.html" class="flex flex-col items-center justify-center p-1.5 flex-1 transition-all ${isContact ? 'text-primary scale-105 font-semibold' : 'text-on-surface-variant hover:text-primary'}">
      <span class="material-symbols-outlined text-[24px] mb-1" style="font-variation-settings: 'FILL' ${isContact ? '1' : '0'};">mail</span>
      <span class="text-[10px] tracking-wider uppercase font-label-md">Contact</span>
    </a>
  `;
}

// ─── Product Detail Page Hydration ────────────────────────────────────────────
function renderProductPage(handle, product) {
  // Update hero image
  const heroImg = document.getElementById('pdp-hero-img');
  if (heroImg && product.images && product.images[0]) {
    heroImg.src = product.images[0].url || product.image;
    heroImg.alt = product.images[0].alt || product.name;
  }

  // Update title
  const titleEl = document.getElementById('pdp-title');
  if (titleEl) titleEl.textContent = product.name;

  // Update price
  const priceEl = document.getElementById('pdp-price');
  if (priceEl) priceEl.textContent = formatPrice(product.price, product.currency);

  // Update description
  const descEl = document.getElementById('pdp-description');
  if (descEl) descEl.textContent = product.description;

  // Update Add to Bag button
  const addBtn = document.getElementById('pdp-add-to-bag');
  if (addBtn) {
    if (!product.available) {
      addBtn.textContent = 'Out of Stock';
      addBtn.disabled = true;
      addBtn.classList.add('opacity-50', 'cursor-not-allowed');
    } else {
      addBtn.textContent = `Add to Bag • ${formatPrice(product.price, product.currency)}`;
      addBtn.onclick = () => Store.addToCart(handle);
    }
  }

  // Update inventory badge
  const badgeEl = document.getElementById('pdp-inventory-badge');
  if (badgeEl) badgeEl.innerHTML = inventoryBadge(product);

  // Update page title
  document.title = `${product.name} — The Green Room`;
}

async function hydrateProductPage(handle) {
  // 1. Instantly hydrate from cache for 0ms page lag
  const cachedProduct = PRODUCTS_CACHE[handle];
  if (cachedProduct) {
    renderProductPage(handle, cachedProduct);
  }

  const product = await fetchProductByHandle(handle);
  if (!product) return;

  // Cache it
  PRODUCTS_CACHE[handle] = product;
  saveProductsCache();

  // 2. Re-render fresh live Shopify data silently
  renderProductPage(handle, product);
}

// ─── Collection Page Hydration ────────────────────────────────────────────────
function renderCollectionPage(products) {
  const grid = document.getElementById('collection-grid');
  if (!grid) return;

  grid.innerHTML = products.map(product => `
    <a href="${product.url}" class="group cursor-pointer block">
      <article>
        <div class="relative w-full aspect-square rounded-lg overflow-hidden bg-surface-container-low mb-sm shadow-[0_4px_24px_rgba(0,104,56,0.04)]">
          <img alt="${product.imageAlt}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" src="${product.image}">
          <div class="absolute bottom-sm left-sm flex gap-2 flex-wrap">
            ${product.available
              ? `<span class="inline-block px-3 py-1 rounded-full bg-surface-container/90 backdrop-blur-sm text-primary font-label-md text-label-md text-xs">In Stock</span>`
              : `<span class="inline-block px-3 py-1 rounded-full bg-error/80 backdrop-blur-sm text-on-primary font-label-md text-label-md text-xs">Out of Stock</span>`
            }
          </div>
        </div>
        <div>
          <h3 class="font-headline-md text-headline-md text-on-surface group-hover:text-primary transition-colors mb-xs text-lg">${product.name}</h3>
          <p class="font-body-md text-body-md text-on-surface-variant mb-xs">${HANDLE_TO_COLOR[product.handle] || ''}</p>
          <p class="font-label-md text-primary font-bold">${formatPrice(product.price, product.currency)}</p>
        </div>
      </article>
    </a>
  `).join('');
}

async function hydrateCollectionPage() {
  const grid = document.getElementById('collection-grid');
  if (!grid) return;

  // 1. Try to render instantly from cached catalog values
  const cachedProducts = Object.values(PRODUCTS_CACHE).filter(p => p.handle);
  if (cachedProducts.length >= 3) {
    renderCollectionPage(cachedProducts);
  } else {
    // Show pulsing skeleton loader only if cache is empty
    grid.innerHTML = `
      <div class="animate-pulse flex flex-col gap-md">
        ${[1,2,3].map(() => `
          <div class="w-full aspect-square bg-surface-container rounded-lg"></div>
          <div class="h-4 bg-surface-container rounded w-2/3"></div>
          <div class="h-4 bg-surface-container rounded w-1/3 mb-lg"></div>
        `).join('')}
      </div>
    `;
  }

  const data = await shopifyQuery(QUERIES.allProducts);
  if (!data) {
    if (!cachedProducts.length) {
      grid.innerHTML = `<p class="text-on-surface-variant text-center py-12">Could not load products. Please refresh.</p>`;
    }
    return;
  }

  const products = data.products.edges.map(({ node }) => {
    const variant = node.variants.edges[0]?.node || {};
    const image = node.images.edges[0]?.node;
    return {
      id: node.id,
      variantId: variant.id,
      handle: node.handle,
      name: node.title,
      description: node.description,
      price: parseFloat(node.priceRange.minVariantPrice.amount),
      currency: node.priceRange.minVariantPrice.currencyCode,
      available: variant.availableForSale,
      quantity: variant.quantityAvailable,
      image: image?.url || FALLBACK_IMAGES[node.handle] || '',
      imageAlt: image?.altText || node.title,
      url: HANDLE_TO_PAGE[node.handle] || '#'
    };
  });

  // Save fresh products to cache
  products.forEach(p => { PRODUCTS_CACHE[p.handle] = p; });
  saveProductsCache();

  // 2. Re-render live data silently in the background
  renderCollectionPage(products);
}

// ─── Home Page Product Hydration ──────────────────────────────────────────────
async function hydrateHomePage() {
  const redProduct = PRODUCTS_CACHE['red-tote'];
  const greenProduct = PRODUCTS_CACHE['green-tote'];
  const blueProduct = PRODUCTS_CACHE['blue-tote'];

  if (redProduct) {
    const redCard = document.querySelector('a[href="red-tote.html"]');
    if (redCard) {
      const titleEl = redCard.querySelector('h4');
      if (titleEl) titleEl.textContent = redProduct.name;
      const priceEl = redCard.querySelector('p.font-body-lg');
      if (priceEl) priceEl.textContent = formatPrice(redProduct.price, redProduct.currency);
      const imgEl = redCard.querySelector('img');
      if (imgEl) {
        imgEl.src = redProduct.image;
        imgEl.alt = redProduct.imageAlt;
      }
    }
  }

  if (greenProduct) {
    const greenCard = document.querySelector('a[href="green-tote.html"]');
    if (greenCard) {
      const titleEl = greenCard.querySelector('h4');
      if (titleEl) titleEl.textContent = greenProduct.name;
      const priceEl = greenCard.querySelector('p.font-body-lg');
      if (priceEl) priceEl.textContent = formatPrice(greenProduct.price, greenProduct.currency);
      const imgEl = greenCard.querySelector('img');
      if (imgEl) {
        imgEl.src = greenProduct.image;
        imgEl.alt = greenProduct.imageAlt;
      }
    }
  }

  if (blueProduct) {
    const blueCard = document.querySelector('a[href="blue-tote.html"]');
    if (blueCard) {
      const titleEl = blueCard.querySelector('h4');
      if (titleEl) titleEl.textContent = blueProduct.name;
      const priceEl = blueCard.querySelector('p.font-body-lg');
      if (priceEl) priceEl.textContent = formatPrice(blueProduct.price, blueProduct.currency);
      const imgEl = blueCard.querySelector('img');
      if (imgEl) {
        imgEl.src = blueProduct.image;
        imgEl.alt = blueProduct.imageAlt;
      }
    }
  }
}

// ─── Contact Form ─────────────────────────────────────────────────────────────
function bindContactForm() {
  const contactForm = document.querySelector('main section form');
  const isContactPage = window.location.pathname.includes('contact');
  if (!contactForm || !isContactPage) return;

  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('name')?.value || '';
    const email = document.getElementById('email')?.value || '';
    const message = document.getElementById('message')?.value || '';

    // Submit to real Shopify contact endpoint in background
    const bodyParams = new URLSearchParams();
    bodyParams.append('form_type', 'contact');
    bodyParams.append('utf8', '✓');
    bodyParams.append('contact[name]', name);
    bodyParams.append('contact[email]', email);
    bodyParams.append('contact[body]', message);

    try {
      await fetch(`https://${SHOPIFY_CONFIG.domain}/contact#contact_form`, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: bodyParams.toString()
      });
    } catch (err) {
      console.warn('[Shopify Contact Submission]', err);
    }

    const section = contactForm.parentElement;
    section.innerHTML = `
      <div class="relative z-10 flex flex-col items-center justify-center min-h-[300px] text-center p-6 gap-4">
        <div class="w-16 h-16 rounded-full bg-secondary-container flex items-center justify-center text-primary shadow-md border border-primary/10">
          <span class="material-symbols-outlined text-[32px]">spa</span>
        </div>
        <h3 class="font-headline-md text-primary font-bold">Message Sent, ${name}!</h3>
        <p class="font-body-md text-sm text-on-surface-variant max-w-[280px] leading-relaxed">
          We appreciate you reaching out. Our team will respond to
          <span class="font-semibold text-on-surface">${email}</span> within 24 hours.
        </p>
        <button onclick="window.location.reload()" class="mt-4 px-6 py-2.5 bg-primary text-on-primary hover:bg-surface-tint rounded-full font-label-md text-xs shadow-sm">
          Send Another Message
        </button>
      </div>
    `;
  });
}

// ─── Newsletter Form ──────────────────────────────────────────────────────────
function bindNewsletterForms() {
  document.querySelectorAll('form[data-newsletter]').forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailInput = form.querySelector('input[type="email"]');
      if (!emailInput) return;
      const email = emailInput.value;

      // Submit to real Shopify newsletter subscription endpoint in background
      const bodyParams = new URLSearchParams();
      bodyParams.append('form_type', 'customer');
      bodyParams.append('utf8', '✓');
      bodyParams.append('contact[email]', email);
      bodyParams.append('contact[tags]', 'newsletter');

      try {
        await fetch(`https://${SHOPIFY_CONFIG.domain}/contact#contact_form`, {
          method: 'POST',
          mode: 'no-cors',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: bodyParams.toString()
        });
      } catch (err) {
        console.warn('[Shopify Newsletter Submission]', err);
      }

      const parent = form.parentElement;
      parent.innerHTML = `
        <h3 class="font-headline-lg-mobile text-primary mb-2">Welcome Aboard!</h3>
        <p class="font-body-md text-on-surface-variant max-w-md mx-auto leading-relaxed mb-4">
          You are now subscribed. We are thrilled to share our sustainability stories and early access with you at:
        </p>
        <div class="px-4 py-2 bg-secondary-container/30 border border-primary/10 rounded-full inline-block font-label-md text-primary font-semibold text-sm">
          ${email}
        </div>
      `;
    });
  });
}

// ─── Fluid Page Transitions ──────────────────────────────────────────────────
function setupPageTransitions() {
  document.body.classList.add('fade-in');

  document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    const isInternal = href && 
                       !href.startsWith('http') && 
                       !href.startsWith('mailto:') && 
                       !href.startsWith('tel:') && 
                       !href.startsWith('#') &&
                       anchor.target !== '_blank';

    if (isInternal) {
      e.preventDefault();
      document.body.classList.remove('fade-in');
      setTimeout(() => {
        window.location.href = href;
      }, 220);
    }
  });
}

// ─── DOMContentLoaded: Main Entry Point ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  setupPageTransitions();
  Store.init();
  injectGlobalDrawers();
  bindHeaderAndFooter();
  Store.updateUI();
  bindContactForm();
  bindNewsletterForms();

  const currentPath = window.location.pathname.split('/').pop() || 'index.html';

  // Product detail pages (Non-blocking background hydration)
  if (currentPath.includes('green-tote')) {
    hydrateProductPage('green-tote');
  } else if (currentPath.includes('blue-tote')) {
    hydrateProductPage('blue-tote');
  } else if (currentPath.includes('red-tote')) {
    hydrateProductPage('red-tote');
  }

  // Collection page (Non-blocking background hydration)
  if (currentPath.includes('collection')) {
    hydrateCollectionPage();
  }

  // Home page (SWR optimistic rendering)
  if (currentPath === 'index.html' || currentPath === '') {
    // 1. Instantly hydrate from cache (0ms delay)
    hydrateHomePage();

    // 2. Refresh cache and update silently in the background
    fetchAllProducts().then(() => {
      hydrateHomePage();
    });
  }
});
