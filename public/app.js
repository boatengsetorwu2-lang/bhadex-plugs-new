
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

  /* DARK DROPDOWN */
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

  /* RED AND BLACK BUTTONS */
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

  @media (max-width: 500px) {
    .product-modal-content {
      padding: 24px 18px;
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

  const content = document.getElementById("modalProductContent");

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

    <h4>What's included</h4>
    <ul class="modal-benefits">${benefits}</ul>

    <div class="modal-package-area">
      <label for="modalPackage">Choose subscription duration</label>
      <select id="modalPackage" class="package-select">${packages}</select>
    </div>

    <button type="button" id="modalCheckout" class="buy-btn">
      Continue to Checkout
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

document.addEventListener("keydown", event => {
  if (event.key === "Escape") closeProductModal();
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

    return `
      <div class="product-card">
        <div class="product-card-top">
          <span class="product-category">${escapeHTML(product.category)}</span>
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

          <button class="buy-btn" type="button" data-product="${escapeHTML(product.name)}" data-select="${selectId}">
            Continue to Checkout
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
      if (!product) return;

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

// CHECKOUT
async function startCheckout(productName, packageIndex) {
  const email = prompt("Enter your email address:");
  if (!email) return;

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email.trim())) {
    alert("Please enter a valid email address.");
    return;
  }

  try {
    const response = await fetch("/api/payments/initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        product: productName,
        packageIndex,
        email: email.trim()
      })
    });

    const data = await response.json();

    if (!response.ok || !data.authorization_url) {
      throw new Error(data.error || "Could not start payment. Please try again.");
    }

    window.location.href = data.authorization_url;

  } catch (error) {
    console.error("Checkout error:", error);
    alert(error.message || "Payment could not be started.");
  }
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

// INITIALIZE
renderProducts();
