
const products = [
  {
    name: "Netflix",
    logo: "https://cdn.simpleicons.org/netflix/E50914",
    category: "Entertainment",
    prices: [35, 90, 170],
    description: "Enjoy movies, TV shows and award-winning Netflix Originals.",
    benefits: ["Access to movies and TV series", "Netflix Original productions", "Downloads where supported", "Streaming quality based on your plan"]
  },
  {
    name: "YouTube Premium",
    logo: "https://cdn.simpleicons.org/youtube/FF0000",
    category: "Entertainment",
    prices: [20, 55, 100],
    description: "Enjoy YouTube with fewer interruptions and extra playback features.",
    benefits: ["Ad-free YouTube viewing", "Background play", "Offline downloads", "YouTube Music Premium benefits"]
  },
  {
    name: "Spotify Premium",
    logo: "https://cdn.simpleicons.org/spotify/1DB954",
    category: "Entertainment",
    prices: [18, 50, 95],
    description: "Enjoy your favourite music with Premium listening features.",
    benefits: ["Ad-free music listening", "Offline listening", "On-demand song selection", "Higher audio quality options"]
  },
  {
    name: "Canva Pro",
    logo: "https://www.google.com/s2/favicons?domain=canva.com&sz=128",
    category: "Productivity",
    prices: [25, 70, 135],
    description: "Create professional designs with Canva's premium creative tools.",
    benefits: ["Premium templates", "Background remover", "Premium photos and graphics", "Design resizing tools", "AI design features"]
  },
  {
    name: "ChatGPT Plus",
    logo: "https://www.google.com/s2/favicons?domain=openai.com&sz=128",
    category: "Productivity",
    prices: [45],
    description: "Get access to additional ChatGPT capabilities and higher usage limits.",
    benefits: ["Access to advanced AI capabilities", "Higher usage limits", "Image generation", "Document and file analysis", "Advanced research tools"]
  },
  {
    name: "Microsoft 365",
    logo: "https://www.google.com/s2/favicons?domain=microsoft.com&sz=128",
    category: "Productivity",
    prices: [30, 85, 160],
    description: "Work smarter with Microsoft's productivity applications.",
    benefits: ["Word, Excel and PowerPoint features", "OneDrive cloud storage", "File syncing", "Collaboration tools"]
  },
  {
    name: "Disney+",
    logo: "https://www.google.com/s2/favicons?domain=disneyplus.com&sz=128",
    category: "Entertainment",
    prices: [25, 70, 135],
    description: "Stream entertainment from Disney and its popular brands.",
    benefits: ["Disney movies and series", "Marvel entertainment", "Star Wars content", "Pixar movies", "Downloads where supported"]
  },
  {
    name: "Prime Video",
    logo: "https://www.google.com/s2/favicons?domain=primevideo.com&sz=128",
    category: "Entertainment",
    prices: [20, 55, 105],
    description: "Explore movies, television shows and Amazon Originals.",
    benefits: ["Movies and TV shows", "Amazon Original productions", "Supported high-quality streaming", "Downloads where supported"]
  },
  {
    name: "Telegram Premium",
    logo: "https://cdn.simpleicons.org/telegram/26A5E4",
    category: "Social",
    prices: [20, 55, 105],
    description: "Unlock additional features for your Telegram experience.",
    benefits: ["Faster downloads", "Increased upload limits", "Premium stickers and reactions", "Premium profile badge", "Voice-to-text features", "Additional chat features"]
  },
  {
    name: "Google One",
    logo: "https://cdn.simpleicons.org/googleone/4285F4",
    category: "Cloud",
    prices: [15, 40, 75],
    description: "Get additional cloud storage for your Google account.",
    benefits: ["More Google storage", "Store photos and videos", "Additional Gmail storage", "Device backups", "Eligible family sharing"]
  }
];

const packageNames = ["1 Month", "3 Months", "1 Year"];

const productGrid = document.getElementById("productGrid");
const searchInput = document.getElementById("search");

let activeCategory = "All";
let productAvailability = Object.create(null);

const RECENT_STORAGE_KEY = "bhadexRecentlyViewed";
const MAX_RECENT_PRODUCTS = 6;

// PREMIUM DARK THEME STYLING
const premiumStyles = document.createElement("style");

premiumStyles.textContent = `
  .product-logo {
    width: 64px;
    height: 64px;
    margin: 18px 0 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,0.14);
    border-radius: 16px;
    background: #181818;
  }

  .product-logo img {
    display: block;
    width: 42px;
    height: 42px;
    object-fit: contain;
  }

  .product-logo .logo-fallback {
    display: none;
    width: 100%;
    height: 100%;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 20px;
    font-weight: 700;
  }

  .product-logo .logo-fallback.is-visible {
    display: flex;
  }

  .inventory-status {
    display: inline-flex;
    align-items: center;
    margin-top: 8px;
    padding: 5px 9px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 700;
  }
  .inventory-status.available { color: #8ee6a0; background: rgba(46,160,67,0.14); }
  .inventory-status.out-of-stock { color: #ff9a9a; background: rgba(229,9,20,0.16); }
  .buy-btn:disabled { opacity: 0.55; cursor: not-allowed; }

  .package-select {
    width: 100%;
    background: #151515 !important;
    color: #ffffff !important;
    border: 1px solid #e50914 !important;
    border-radius: 8px;
    padding: 13px;
    outline: none;
    cursor: pointer;
    color-scheme: dark;
  }

  .package-select option {
    background: #151515 !important;
    color: #ffffff !important;
  }

  .package-select:focus {
    border-color: #ff3038 !important;
    box-shadow: 0 0 10px rgba(229, 9, 20, 0.3);
  }

  .details-btn,
  .buy-btn {
    background: #1b1b1b !important;
    color: #ffffff !important;
    border: 1px solid #e50914 !important;
    border-radius: 8px;
    transition: all 0.25s ease;
    cursor: pointer;
  }

  .details-btn:hover,
  .buy-btn:hover {
    background: #e50914 !important;
    color: #ffffff !important;
    box-shadow: 0 0 14px rgba(229, 9, 20, 0.35);
    transform: translateY(-2px);
  }

  /* PRODUCT MODAL */
  .product-modal {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0,0,0,0.85);
    align-items: center;
    justify-content: center;
    padding: 20px;
    overflow-y: auto;
  }

  .product-modal.active {
    display: flex;
  }

  .product-modal-content {
    position: relative;
    width: 100%;
    max-width: 480px;
    max-height: 90vh;
    overflow-y: auto;
    padding: 30px;
    background: #111111;
    color: #ffffff;
    border: 1px solid rgba(229,9,20,0.45);
    border-radius: 18px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.6);
  }

  .modal-close {
    position: absolute;
    top: 12px;
    right: 16px;
    background: transparent;
    color: white;
    border: none;
    font-size: 30px;
    cursor: pointer;
  }

  .modal-product-logo {
    width: 70px;
    height: 70px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 15px;
    background: #1c1c1c;
    border-radius: 15px;
  }

  .modal-product-logo img {
    width: 45px;
    height: 45px;
    object-fit: contain;
  }

  .modal-benefits {
    line-height: 1.9;
    padding-left: 22px;
  }

  .modal-package-area {
    margin: 20px 0;
  }

  .modal-package-area label {
    display: block;
    margin-bottom: 10px;
  }

  #modalCheckout {
    width: 100%;
    padding: 13px;
  }

  body.modal-open {
    overflow: hidden;
  }

  /* PREMIUM CHECKOUT POPUP */
  .checkout-modal {
    display: none;
    position: fixed;
    inset: 0;
    z-index: 10001;
    background: rgba(0,0,0,0.88);
    backdrop-filter: blur(9px);
    align-items: center;
    justify-content: center;
    padding: 18px;
    overflow-y: auto;
  }

  .checkout-modal.active {
    display: flex;
  }

  .checkout-box {
    position: relative;
    width: 100%;
    max-width: 440px;
    padding: 34px 28px;
    background: linear-gradient(145deg, #191919, #090909);
    border: 1px solid rgba(229,9,20,0.5);
    border-radius: 20px;
    box-shadow: 0 25px 80px rgba(0,0,0,0.75);
    color: #fff;
    animation: checkoutAppear 0.25s ease;
  }

  @keyframes checkoutAppear {
    from {
      opacity: 0;
      transform: translateY(15px) scale(0.98);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .checkout-close {
    position: absolute;
    top: 14px;
    right: 17px;
    border: none;
    background: transparent;
    color: #aaa;
    font-size: 27px;
    cursor: pointer;
  }

  .checkout-close:hover {
    color: #fff;
  }

  .checkout-brand {
    text-align: center;
    margin-bottom: 25px;
  }

  .checkout-brand-mark {
    width: 55px;
    height: 55px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 13px;
    border-radius: 15px;
    background: #e50914;
    color: #fff;
    font-size: 25px;
    font-weight: 900;
    box-shadow: 0 0 25px rgba(229,9,20,0.3);
  }

  .checkout-brand h2 {
    margin: 0;
    font-size: 22px;
    letter-spacing: 1.5px;
  }

  .checkout-brand p {
    margin: 7px 0 0;
    color: #999;
    font-size: 11px;
    letter-spacing: 2px;
  }

  .checkout-heading {
    margin-bottom: 18px;
  }

  .checkout-heading h3 {
    margin: 0 0 7px;
    font-size: 21px;
  }

  .checkout-heading p {
    margin: 0;
    color: #aaa;
    font-size: 13px;
    line-height: 1.6;
  }

  .checkout-summary {
    padding: 17px;
    margin-bottom: 22px;
    background: #202020;
    border: 1px solid #333;
    border-radius: 12px;
  }

  .checkout-summary-label {
    color: #999;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .checkout-summary-product {
    margin: 7px 0;
    font-size: 17px;
    font-weight: 700;
  }

  .checkout-summary-duration {
    color: #aaa;
    font-size: 13px;
  }

  .checkout-summary-price {
    display: block;
    margin-top: 13px;
    padding-top: 13px;
    border-top: 1px solid #383838;
    color: #ff343c;
    font-size: 23px;
    font-weight: 800;
  }

  .checkout-field label {
    display: block;
    margin-bottom: 9px;
    color: #eee;
    font-size: 13px;
    font-weight: 600;
  }

  .checkout-field input {
    width: 100%;
    box-sizing: border-box;
    padding: 15px;
    background: #101010;
    border: 1px solid #444;
    border-radius: 9px;
    color: white;
    font-size: 14px;
    outline: none;
    transition: border 0.2s ease, box-shadow 0.2s ease;
  }

  .checkout-field input:focus {
    border-color: #e50914;
    box-shadow: 0 0 0 3px rgba(229,9,20,0.12);
  }

  .checkout-field input::placeholder {
    color: #777;
  }

  .checkout-error {
    display: none;
    margin: 12px 0 0;
    color: #ff555d;
    font-size: 12px;
    line-height: 1.5;
  }

  .checkout-error.visible {
    display: block;
  }

  .checkout-submit {
    width: 100%;
    margin-top: 20px;
    padding: 15px;
    border: 1px solid #e50914;
    border-radius: 9px;
    background: #e50914;
    color: #fff;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: 0.2s ease;
  }

  .checkout-submit:hover {
    background: #bd000a;
    box-shadow: 0 0 20px rgba(229,9,20,0.25);
  }

  .checkout-submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .checkout-secure-note {
    margin: 17px 0 0;
    color: #888;
    font-size: 11px;
    line-height: 1.6;
    text-align: center;
  }

  /* RECENTLY VIEWED */
  .recently-viewed-section {
    margin: 25px 0 30px;
    padding: 22px;
    background: #111;
    border: 1px solid #292929;
    border-radius: 14px;
  }

  .recently-viewed-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 18px;
  }

  .recently-viewed-header h2 {
    margin: 0;
    color: #fff;
    font-size: 20px;
  }

  .recently-viewed-header p {
    margin: 5px 0 0;
    color: #999;
    font-size: 12px;
  }

  .clear-recent-btn {
    padding: 9px 13px;
    background: #1b1b1b;
    color: #ff555d;
    border: 1px solid #66252a;
    border-radius: 7px;
    cursor: pointer;
    font-size: 12px;
  }

  .clear-recent-btn:hover {
    background: #e50914;
    color: #fff;
  }

  .recently-viewed-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
    gap: 12px;
  }

  .recent-product-card {
    padding: 14px;
    background: #191919;
    border: 1px solid #303030;
    border-radius: 10px;
    text-align: center;
  }

  .recent-product-card img {
    width: 38px;
    height: 38px;
    object-fit: contain;
    margin-bottom: 9px;
  }

  .recent-product-card h3 {
    margin: 0 0 10px;
    color: #fff;
    font-size: 13px;
  }

  .recent-product-card button {
    width: 100%;
    padding: 9px;
    background: #222;
    color: #fff;
    border: 1px solid #e50914;
    border-radius: 7px;
    cursor: pointer;
    font-size: 12px;
  }

  .recent-product-card button:hover {
    background: #e50914;
  }

  .recent-empty {
    color: #999;
    font-size: 13px;
    padding: 8px 0;
  }

  @media (max-width: 500px) {
    .product-modal-content {
      padding: 24px 18px;
    }

    .checkout-box {
      padding: 30px 20px;
    }

    .recently-viewed-section {
      padding: 15px;
    }

    .recently-viewed-header {
      align-items: flex-start;
    }

    .recently-viewed-header h2 {
      font-size: 17px;
    }

    .recently-viewed-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
`;

document.head.appendChild(premiumStyles);

// ESCAPE HTML
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };
    return entities[character];
  });
}

// RECENTLY VIEWED STORAGE
function getRecentlyViewed() {
  try {
    const saved = JSON.parse(
      localStorage.getItem(RECENT_STORAGE_KEY) || "[]"
    );

    if (!Array.isArray(saved)) return [];

    return saved
      .filter(name => products.some(product => product.name === name))
      .slice(0, MAX_RECENT_PRODUCTS);
  } catch (error) {
    console.error("Could not load recently viewed products:", error);
    return [];
  }
}

// SAVE A RECENTLY VIEWED PRODUCT
function addRecentlyViewed(product) {
  if (!product) return;

  try {
    let recent = getRecentlyViewed();

    recent = recent.filter(name => name !== product.name);
    recent.unshift(product.name);
    recent = recent.slice(0, MAX_RECENT_PRODUCTS);

    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(recent));

    renderRecentlyViewed();
  } catch (error) {
    console.error("Could not save recently viewed product:", error);
  }
}

// CREATE RECENTLY VIEWED SECTION
function createRecentlyViewedSection() {
  if (!productGrid) return;

  if (document.getElementById("recentlyViewedSection")) return;

  const section = document.createElement("section");

  section.id = "recentlyViewedSection";
  section.className = "recently-viewed-section";

  section.innerHTML = `
    <div class="recently-viewed-header">
      <div>
        <h2>Recently Viewed</h2>
        <p>Quickly return to subscriptions you viewed</p>
      </div>

      <button
        type="button"
        class="clear-recent-btn"
        id="clearRecentlyViewed"
      >
        Clear History
      </button>
    </div>

    <div
      class="recently-viewed-grid"
      id="recentlyViewedGrid"
    ></div>
  `;

  productGrid.parentNode.insertBefore(section, productGrid);

  document.getElementById("clearRecentlyViewed")
    .addEventListener("click", clearRecentlyViewed);
}

// DISPLAY RECENTLY VIEWED PRODUCTS
function renderRecentlyViewed() {
  if (!productGrid) return;

  createRecentlyViewedSection();

  const recentGrid = document.getElementById("recentlyViewedGrid");

  if (!recentGrid) return;

  const recentNames = getRecentlyViewed();

  if (recentNames.length === 0) {
    recentGrid.innerHTML = `
      <p class="recent-empty">
        Products you view will appear here.
      </p>
    `;
    return;
  }

  const recentProducts = recentNames
    .map(name => products.find(product => product.name === name))
    .filter(Boolean);

  recentGrid.innerHTML = recentProducts.map(product => `
    <div class="recent-product-card">
      <img
        src="${escapeHTML(product.logo)}"
        alt="${escapeHTML(product.name)} logo"
      >

      <h3>${escapeHTML(product.name)}</h3>

      <button
        type="button"
        data-recent-product="${escapeHTML(product.name)}"
      >
        View Again
      </button>
    </div>
  `).join("");

  recentGrid.querySelectorAll("[data-recent-product]").forEach(button => {
    button.addEventListener("click", () => {
      const product = products.find(
        item => item.name === button.dataset.recentProduct
      );

      if (product) openProductModal(product);
    });
  });
}

// CLEAR RECENTLY VIEWED HISTORY
function clearRecentlyViewed() {
  try {
    localStorage.removeItem(RECENT_STORAGE_KEY);
    renderRecentlyViewed();
  } catch (error) {
    console.error("Could not clear recently viewed products:", error);
  }
}

// CREATE PRODUCT DETAILS MODAL
function createProductModal() {
  if (document.getElementById("productModal")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div id="productModal" class="product-modal" role="dialog" aria-modal="true" aria-labelledby="modalProductName">
      <div class="product-modal-content">
        <button type="button" class="modal-close" id="closeProductModal" aria-label="Close product details">&times;</button>
        <div id="modalProductContent"></div>
      </div>
    </div>
  `);

  document.getElementById("closeProductModal")
    .addEventListener("click", closeProductModal);

  document.getElementById("productModal")
    .addEventListener("click", event => {
      if (event.target.id === "productModal") closeProductModal();
    });
}

// OPEN PRODUCT DETAILS
function openProductModal(product) {
  createProductModal();

  // Record this product in Recently Viewed
  addRecentlyViewed(product);

  const content = document.getElementById("modalProductContent");
  const isAvailable = productAvailability[product.name] !== false;

  const benefits = product.benefits.map(benefit =>
    `<li>${escapeHTML(benefit)}</li>`
  ).join("");

  const packages = product.prices.map((price, index) =>
    `<option value="${index}">${packageNames[index]} - GH₵${price}</option>`
  ).join("");

  content.innerHTML = `
    <div class="modal-product-logo">
      <img src="${escapeHTML(product.logo)}" alt="${escapeHTML(product.name)} logo">
    </div>

    <span class="product-category">${escapeHTML(product.category)}</span>
    <h2 id="modalProductName">${escapeHTML(product.name)}</h2>
    <p class="modal-description">${escapeHTML(product.description)}</p>
    <p class="inventory-status ${isAvailable ? "available" : "out-of-stock"}">${isAvailable ? "Available" : "Out of Stock"}</p>

    <h4>What's included</h4>
    <ul class="modal-benefits">${benefits}</ul>

    <div class="modal-package-area">
      <label for="modalPackage">Choose subscription duration</label>
      <select id="modalPackage" class="package-select">${packages}</select>
    </div>

    <button type="button" id="modalCheckout" class="buy-btn" ${isAvailable ? "" : "disabled"}>
      ${isAvailable ? "Continue to Checkout" : "Out of Stock"}
    </button>

    <p class="product-note">
      Features depend on the official plan and account eligibility.
    </p>
  `;

  document.getElementById("modalCheckout")
    .addEventListener("click", () => {
      const packageIndex = Number(document.getElementById("modalPackage").value);
      closeProductModal();
      startCheckout(product.name, packageIndex);
    });

  document.getElementById("productModal").classList.add("active");
  document.body.classList.add("modal-open");
}

// CLOSE PRODUCT DETAILS
function closeProductModal() {
  const modal = document.getElementById("productModal");

  if (modal) {
    modal.classList.remove("active");
    document.body.classList.remove("modal-open");
  }
}

// CREATE PREMIUM CHECKOUT MODAL
function createCheckoutModal() {
  if (document.getElementById("checkoutModal")) return;

  document.body.insertAdjacentHTML("beforeend", `
    <div
      id="checkoutModal"
      class="checkout-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="checkoutTitle"
    >
      <div class="checkout-box">

        <button
          type="button"
          class="checkout-close"
          id="closeCheckoutModal"
          aria-label="Close checkout"
        >&times;</button>

        <div class="checkout-brand">
          <div class="checkout-brand-mark">B</div>
          <h2>BHADEX PLUGS</h2>
          <p>DIGITAL ACCESS, ELEVATED</p>
        </div>

        <div class="checkout-heading">
          <h3 id="checkoutTitle">Complete Your Order</h3>
          <p>Enter your email address to continue to secure checkout.</p>
        </div>

        <div class="checkout-summary">
          <span class="checkout-summary-label">Your selection</span>
          <div class="checkout-summary-product" id="checkoutProductName"></div>
          <div class="checkout-summary-duration" id="checkoutDuration"></div>
          <span class="checkout-summary-price" id="checkoutPrice"></span>
        </div>

        <form id="checkoutForm">
          <div class="checkout-field">
            <label for="checkoutEmail">Email Address</label>
            <input type="email" id="checkoutEmail" placeholder="Enter your email address" autocomplete="email" required>
          </div>

          <div class="checkout-field">
            <label for="checkoutLoyaltyPoints">Redeem loyalty points (optional)</label>
            <input type="number" id="checkoutLoyaltyPoints" min="0" step="100" value="0" placeholder="Multiples of 100" disabled>
            <small id="checkoutLoyaltyInfo" style="display:block;color:#aaa;margin-top:7px;line-height:1.5;">Log in to your BHADEX PLUGS account to use points. 100 points = GH₵1. Test-mode only.</small>
            <small id="checkoutLoyaltyPreview" style="display:block;color:#8ee6a0;margin-top:6px;"></small>
          </div>

          <p id="checkoutError" class="checkout-error" role="alert"></p>

          <button type="submit" class="checkout-submit" id="checkoutSubmit">
            Continue to Payment
          </button>
        </form>

        <p class="checkout-secure-note">
          Your email will be used for your order confirmation and tracking.
          Payment processing is handled by Paystack.
        </p>

      </div>
    </div>
  `);

  document.getElementById("closeCheckoutModal")
    .addEventListener("click", closeCheckoutModal);

  document.getElementById("checkoutModal")
    .addEventListener("click", event => {
      if (event.target.id === "checkoutModal") {
        closeCheckoutModal();
      }
    });

  document.getElementById("checkoutForm")
    .addEventListener("submit", submitCheckout);

  document.getElementById("checkoutLoyaltyPoints")
    .addEventListener("input", updateLoyaltyPreview);
}

async function loadCheckoutLoyalty() {
  const input = document.getElementById("checkoutLoyaltyPoints");
  const info = document.getElementById("checkoutLoyaltyInfo");
  if (!input || !info) return;
  try {
    const response = await fetch("/api/features/customer/rewards");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Log in to redeem points.");
    input.disabled = false;
    input.max = String(Math.floor(Number(data.points || 0) / 100) * 100);
    info.textContent = "Available: " + Number(data.points || 0).toLocaleString() + " points. 100 points = GH₵1. Points are deducted only after a successful test payment.";
    updateLoyaltyPreview();
  } catch {
    input.disabled = true;
    info.textContent = "Log in to your verified customer account and use your account email to redeem points. Test mode only.";
  }
}

function updateLoyaltyPreview() {
  const input = document.getElementById("checkoutLoyaltyPoints");
  const preview = document.getElementById("checkoutLoyaltyPreview");
  if (!input || !preview || !checkoutProduct || checkoutPackageIndex === null) return;
  const points = Number(input.value || 0);
  const price = checkoutProduct.prices[checkoutPackageIndex];
  if (!Number.isInteger(points) || points < 0 || points % 100 !== 0) { preview.textContent = "Use point amounts in multiples of 100."; return; }
  const discount = points / 100;
  if (discount > price - 1) { preview.textContent = "Keep at least GH₵1.00 payable."; return; }
  preview.textContent = points ? "Estimated points discount: GH₵" + discount.toFixed(2) + " | Estimated total: GH₵" + (price-discount).toFixed(2) : "No points discount applied.";
}
// CHECKOUT STATE
let checkoutProduct = null;
let checkoutPackageIndex = null;
let checkoutInProgress = false;

// OPEN PREMIUM CHECKOUT
function startCheckout(productName, packageIndex) {
  const product = products.find(item => item.name === productName);

  if (!product || product.prices[packageIndex] === undefined) {
    alert("Please select a valid subscription.");
    return;
  }

  if (productAvailability[product.name] === false) {
    alert("This subscription is currently out of stock. Please check back later.");
    return;
  }

  createCheckoutModal();

  checkoutProduct = product;
  checkoutPackageIndex = packageIndex;
  checkoutInProgress = false;

  document.getElementById("checkoutProductName").textContent = product.name;
  document.getElementById("checkoutDuration").textContent = packageNames[packageIndex];
  document.getElementById("checkoutPrice").textContent =
    `GH₵${product.prices[packageIndex]}`;

  document.getElementById("checkoutEmail").value = "";
  document.getElementById("checkoutLoyaltyPoints").value = "0";
  document.getElementById("checkoutLoyaltyPoints").disabled = true;
  document.getElementById("checkoutLoyaltyInfo").textContent = "Checking your account points...";
  document.getElementById("checkoutLoyaltyPreview").textContent = "";
  loadCheckoutLoyalty();
  document.getElementById("checkoutError").textContent = "";
  document.getElementById("checkoutError").classList.remove("visible");

  const submitButton = document.getElementById("checkoutSubmit");
  submitButton.disabled = false;
  submitButton.textContent = "Continue to Payment";

  document.getElementById("checkoutModal").classList.add("active");
  document.body.classList.add("modal-open");

  setTimeout(() => {
    document.getElementById("checkoutEmail").focus();
  }, 100);
}

// CLOSE PREMIUM CHECKOUT
function closeCheckoutModal() {
  if (checkoutInProgress) return;

  const modal = document.getElementById("checkoutModal");

  if (modal) {
    modal.classList.remove("active");
    document.body.classList.remove("modal-open");
  }
}

// SHOW CHECKOUT ERROR
function showCheckoutError(message) {
  const error = document.getElementById("checkoutError");
  error.textContent = message;
  error.classList.add("visible");
}

// SUBMIT CHECKOUT
async function submitCheckout(event) {
  event.preventDefault();

  if (checkoutInProgress || !checkoutProduct) return;

  const emailInput = document.getElementById("checkoutEmail");
  const email = emailInput.value.trim();

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    showCheckoutError("Please enter a valid email address.");
    emailInput.focus();
    return;
  }

  const loyaltyInput = document.getElementById("checkoutLoyaltyPoints");
  const loyaltyPoints = Number(loyaltyInput?.value || 0);
  if (!Number.isInteger(loyaltyPoints) || loyaltyPoints < 0 ||
      (loyaltyPoints > 0 && (loyaltyPoints < 100 || loyaltyPoints % 100 !== 0))) {
    showCheckoutError("Enter points in multiples of 100.");
    return;
  }

  const submitButton = document.getElementById("checkoutSubmit");

  checkoutInProgress = true;
  submitButton.disabled = true;
  submitButton.textContent = "Preparing secure checkout...";

  document.getElementById("checkoutError").classList.remove("visible");

  try {
    const response = await fetch("/api/payments/initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        product: checkoutProduct.name,
        packageIndex: checkoutPackageIndex,
        email: email,
        loyaltyPoints: loyaltyPoints
      })
    });

    const data = await response.json();

    if (!response.ok || !data.authorization_url) {
      throw new Error(
        data.error || "Could not start payment. Please try again."
      );
    }

    window.location.href = data.authorization_url;

  } catch (error) {
    console.error("Checkout error:", error);

    checkoutInProgress = false;
    submitButton.disabled = false;
    submitButton.textContent = "Continue to Payment";

    showCheckoutError(
      error.message || "Payment could not be started. Please try again."
    );
  }
}

// KEYBOARD SUPPORT
document.addEventListener("keydown", event => {
  if (event.key === "Escape") {
    closeProductModal();
    closeCheckoutModal();
  }
});

// RENDER PRODUCTS
function renderProducts() {
  if (!productGrid) return;

  const searchTerm = searchInput
    ? searchInput.value.toLowerCase().trim()
    : "";

  const filteredProducts = products.filter(product => {
    const matchesCategory =
      activeCategory === "All" || product.category === activeCategory;

    const searchableText = [
      product.name,
      product.category,
      product.description,
      ...product.benefits
    ].join(" ").toLowerCase();

    return matchesCategory && searchableText.includes(searchTerm);
  });

  if (filteredProducts.length === 0) {
    productGrid.innerHTML = `
      <div class="empty-state">
        <h3>No subscriptions found</h3>
        <p>Try another search or category.</p>
      </div>
    `;
    return;
  }

  productGrid.innerHTML = filteredProducts.map(product => {
    const packageOptions = product.prices.map((price, index) =>
      `<option value="${index}">${packageNames[index]} - GH₵${price}</option>`
    ).join("");

    const benefits = product.benefits.map(benefit =>
      `<li>${escapeHTML(benefit)}</li>`
    ).join("");

    const selectId = `package-${products.indexOf(product)}`;
    const isAvailable = productAvailability[product.name] !== false;

    return `
      <div class="product-card">
        <div class="product-card-top">
          <span class="product-category">${escapeHTML(product.category)}</span>
          <span class="inventory-status ${isAvailable ? "available" : "out-of-stock"}">${isAvailable ? "Available" : "Out of Stock"}</span>
        </div>

        <div class="product-logo">
          <img
            src="${escapeHTML(product.logo)}"
            alt="${escapeHTML(product.name)} logo"
            loading="lazy"
            onerror="this.style.display='none'; this.nextElementSibling.classList.add('is-visible');"
          >
          <span class="logo-fallback">${escapeHTML(product.name.substring(0, 2).toUpperCase())}</span>
        </div>

        <h3 class="product-name">${escapeHTML(product.name)}</h3>
        <p class="product-description">${escapeHTML(product.description)}</p>

        <button class="details-btn" type="button" data-details="${escapeHTML(product.name)}">
          View Product Details
        </button>

        <div class="product-benefits">
          <h4>What's included</h4>
          <ul>${benefits}</ul>
        </div>

        <div class="product-purchase">
          <label for="${selectId}">Choose duration</label>
          <select id="${selectId}" class="package-select">${packageOptions}</select>

          <button class="buy-btn" type="button" data-product="${escapeHTML(product.name)}" data-select="${selectId}" ${isAvailable ? "" : "disabled"}>
            ${isAvailable ? "Continue to Checkout" : "Out of Stock"}
          </button>
        </div>

        <p class="product-note">
          Features depend on the official plan and account eligibility.
        </p>
      </div>
    `;
  }).join("");

  productGrid.querySelectorAll(".buy-btn").forEach(button => {
    button.addEventListener("click", () => {
      const product = products.find(item => item.name === button.dataset.product);
      if (!product || productAvailability[product.name] === false) return;

      const packageSelect = document.getElementById(button.dataset.select);
      const packageIndex = Number(packageSelect.value);

      if (product.prices[packageIndex] === undefined) {
        alert("Please select a valid subscription duration.");
        return;
      }

      startCheckout(product.name, packageIndex);
    });
  });

  productGrid.querySelectorAll(".details-btn").forEach(button => {
    button.addEventListener("click", () => {
      const product = products.find(item => item.name === button.dataset.details);
      if (product) openProductModal(product);
    });
  });
}

// SEARCH
if (searchInput) {
  searchInput.addEventListener("input", renderProducts);
}

// CATEGORY FILTER
document.querySelectorAll(".category").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".category").forEach(item => {
      item.classList.remove("active");
    });

    button.classList.add("active");
    activeCategory = button.dataset.category;

    renderProducts();
  });
});

// LOAD PRODUCT AVAILABILITY
async function loadProductAvailability() {
  try {
    const response = await fetch("/api/products/availability", { cache: "no-store" });
    if (!response.ok) throw new Error("Availability request failed.");
    const data = await response.json();
    productAvailability = data.availability || Object.create(null);
    renderProducts();
  } catch (error) {
    console.warn("Product availability could not be loaded:", error.message);
  }
}

// INITIALIZE
renderProducts();
renderRecentlyViewed();
loadProductAvailability();
