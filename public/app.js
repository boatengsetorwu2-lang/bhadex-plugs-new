
const products = [
  {
    name: "Netflix",
    category: "Entertainment",
    prices: [35, 90, 170],
    description: "Enjoy movies, TV shows and award-winning Netflix Originals.",
    benefits: [
      "Access to movies and TV series",
      "Netflix Original productions",
      "Downloads where supported",
      "Streaming quality based on your plan"
    ]
  },
  {
    name: "YouTube Premium",
    category: "Entertainment",
    prices: [20, 55, 100],
    description: "Enjoy YouTube with fewer interruptions and extra playback features.",
    benefits: [
      "Ad-free YouTube viewing",
      "Background play",
      "Offline downloads",
      "YouTube Music Premium benefits"
    ]
  },
  {
    name: "Spotify Premium",
    category: "Entertainment",
    prices: [18, 50, 95],
    description: "Enjoy your favourite music with Premium listening features.",
    benefits: [
      "Ad-free music listening",
      "Offline listening",
      "On-demand song selection",
      "Higher audio quality options"
    ]
  },
  {
    name: "Canva Pro",
    category: "Productivity",
    prices: [25, 70, 135],
    description: "Create professional designs with Canva's premium creative tools.",
    benefits: [
      "Premium templates",
      "Background remover",
      "Premium photos and graphics",
      "Design resizing tools",
      "AI design features"
    ]
  },
  {
    name: "ChatGPT Plus",
    category: "Productivity",
    prices: [45],
    description: "Get access to additional ChatGPT capabilities and higher usage limits.",
    benefits: [
      "Access to advanced AI capabilities",
      "Higher usage limits",
      "Image generation",
      "Document and file analysis",
      "Advanced research tools"
    ]
  },
  {
    name: "Microsoft 365",
    category: "Productivity",
    prices: [30, 85, 160],
    description: "Work smarter with Microsoft's productivity applications.",
    benefits: [
      "Word, Excel and PowerPoint features",
      "OneDrive cloud storage",
      "File syncing",
      "Collaboration tools"
    ]
  },
  {
    name: "Disney+",
    category: "Entertainment",
    prices: [25, 70, 135],
    description: "Stream entertainment from Disney and its popular brands.",
    benefits: [
      "Disney movies and series",
      "Marvel entertainment",
      "Star Wars content",
      "Pixar movies",
      "Downloads where supported"
    ]
  },
  {
    name: "Prime Video",
    category: "Entertainment",
    prices: [20, 55, 105],
    description: "Explore movies, television shows and Amazon Originals.",
    benefits: [
      "Movies and TV shows",
      "Amazon Original productions",
      "Supported high-quality streaming",
      "Downloads where supported"
    ]
  },
  {
    name: "Telegram Premium",
    category: "Social",
    prices: [20, 55, 105],
    description: "Unlock additional features for your Telegram experience.",
    benefits: [
      "Faster downloads",
      "Increased upload limits",
      "Premium stickers and reactions",
      "Premium profile badge",
      "Voice-to-text features",
      "Additional chat features"
    ]
  },
  {
    name: "Google One",
    category: "Cloud",
    prices: [15, 40, 75],
    description: "Get additional cloud storage for your Google account.",
    benefits: [
      "More Google storage",
      "Store photos and videos",
      "Additional Gmail storage",
      "Device backups",
      "Eligible family sharing"
    ]
  }
];

const packageNames = ["1 Month", "3 Months", "1 Year"];

const productGrid = document.getElementById("productGrid");
const searchInput = document.getElementById("search");

let activeCategory = "All";

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

function renderProducts() {
  if (!productGrid) return;

  const searchTerm = searchInput
    ? searchInput.value.toLowerCase().trim()
    : "";

  const filteredProducts = products.filter(product => {
    const matchesCategory =
      activeCategory === "All" ||
      product.category === activeCategory;

    const searchableText = [
      product.name,
      product.category,
      product.description,
      ...product.benefits
    ].join(" ").toLowerCase();

    const matchesSearch = searchableText.includes(searchTerm);

    return matchesCategory && matchesSearch;
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
    const packageOptions = product.prices.map((price, index) => `
      <option value="${index}">
        ${packageNames[index]} - GH₵${price}
      </option>
    `).join("");

    const benefits = product.benefits.map(benefit => `
      <li>${escapeHTML(benefit)}</li>
    `).join("");

    return `
      <div class="product-card">

        <div class="product-card-top">
          <span class="product-category">
            ${escapeHTML(product.category)}
          </span>
        </div>

        <h3 class="product-name">
          ${escapeHTML(product.name)}
        </h3>

        <p class="product-description">
          ${escapeHTML(product.description)}
        </p>

        <div class="product-benefits">
          <h4>What's included</h4>
          <ul>
            ${benefits}
          </ul>
        </div>

        <div class="product-purchase">
          <label for="package-${escapeHTML(product.name.replace(/\s+/g, "-"))}">
            Choose duration
          </label>

          <select
            id="package-${escapeHTML(product.name.replace(/\s+/g, "-"))}"
            class="package-select"
          >
            ${packageOptions}
          </select>

          <button
            class="buy-btn"
            type="button"
            data-product="${escapeHTML(product.name)}"
          >
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
      const productName = button.dataset.product;

      const product = products.find(item => {
        return item.name === productName;
      });

      if (!product) return;

      const selectId = `package-${product.name.replace(/\s+/g, "-")}`;
      const packageSelect = document.getElementById(selectId);

      if (!packageSelect) return;

      const packageIndex = Number(packageSelect.value);
      const price = product.prices[packageIndex];

      if (price === undefined) {
        alert("Please select a valid subscription duration.");
        return;
      }

      startCheckout(product.name, packageIndex);
    });
  });
}

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
      throw new Error(
        data.error || "Could not start payment. Please try again."
      );
    }

    window.location.href = data.authorization_url;

  } catch (error) {
    console.error("Checkout error:", error);
    alert(error.message || "Payment could not be started.");
  }
}

if (searchInput) {
  searchInput.addEventListener("input", renderProducts);
}

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

renderProducts();
