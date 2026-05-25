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
    return new
