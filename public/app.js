
const products = [
  {
    name: "Netflix",
    displayName: "Netflix",
    category: "Entertainment",
    prices: [35, 90, 170],
    description: "Discover movies, television series and exclusive entertainment.",
    benefits: [
      "Watch thousands of movies and TV series.",
      "Enjoy Netflix Originals.",
      "Download selected titles for offline viewing.",
      "Enjoy supported streaming quality."
    ]
  },
  {
    name: "YouTube Premium",
    displayName: "YouTube Premium",
    category: "Entertainment",
    prices: [20, 55, 100],
    description: "Enjoy an improved YouTube experience with premium features.",
    benefits: [
      "Enjoy videos without advertisements.",
      "Play videos in the background.",
      "Download videos where supported.",
      "Enjoy YouTube Music Premium benefits."
    ]
  },
  {
    name: "Spotify Premium",
    displayName: "Spotify Premium",
    category: "Entertainment",
    prices: [18, 50, 95],
    description: "Enjoy your favourite music with premium listening features.",
    benefits: [
      "Listen to music without advertisements.",
      "Download music for offline listening.",
      "Enjoy on-demand song selection.",
      "Access higher audio quality options."
    ]
  },
  {
    name: "Canva",
    displayName: "Canva Pro",
    category: "Productivity",
    prices: [25, 70, 135],
    description: "Create professional designs using premium creative tools.",
    benefits: [
      "Access premium templates.",
      "Use background removal tools.",
      "Unlock premium photos and graphics.",
      "Resize designs with premium tools.",
      "Access available AI design tools."
    ]
  },
  {
    name: "ChatGPT",
    displayName: "ChatGPT Plus",
    category: "Productivity",
    prices: [45],
    description: "Explore advanced AI tools for learning, creativity and productivity.",
    benefits: [
      "Access advanced AI capabilities.",
      "Higher usage limits than the free plan.",
      "Generate images where available.",
      "Analyse supported documents and files.",
      "Access advanced research tools where available."
    ]
  },
  {
    name: "Microsoft 365",
    displayName: "Microsoft 365",
    category: "Productivity",
    prices: [30, 85, 160],
    description: "Work with familiar productivity applications and cloud tools.",
    benefits: [
      "Access eligible Word features.",
      "Use Excel and PowerPoint features.",
      "Store files with OneDrive storage.",
      "Sync files across supported devices.",
      "Collaborate on documents."
    ]
  },
  {
    name: "Disney+",
    displayName: "Disney+",
    category: "Entertainment",
    prices: [25, 70, 135],
    description: "Explore entertainment from Disney and its content brands.",
    benefits: [
      "Watch Disney movies and series.",
      "Explore Marvel content.",
      "Discover Star Wars titles.",
      "Enjoy Pixar animations.",
      "Download selected titles where supported."
    ]
  },
  {
    name: "Prime Video",
    displayName: "Prime Video",
    category: "Entertainment",
    prices: [20, 55, 105],
    description: "Discover movies, television shows and original productions.",
    benefits: [
      "Watch movies and TV shows.",
      "Explore Amazon Original productions.",
      "Enjoy supported high-quality content.",
      "Download selected titles where supported."
    ]
  },
  {
    name: "Telegram Premium",
    displayName: "Telegram Premium",
    category: "Social",
    prices: [20, 55, 105],
    description: "Unlock additional features for your Telegram experience.",
    benefits: [
      "Enjoy faster file downloads.",
      "Access increased upload limits.",
      "Use exclusive stickers and reactions.",
      "Display a premium profile badge.",
      "Use voice-to-text transcription.",
      "Access additional chat features."
    ]
  },
  {
    name: "Google One",
    displayName: "Google One",
    category: "Cloud",
    prices: [15, 40, 75],
    description: "Get additional cloud storage for your Google account.",
    benefits: [
      "Get additional Google storage.",
      "Store more photos and videos.",
      "Expand available Gmail storage.",
      "Back up important files.",
      "Share storage on eligible plans."
    ]
  }
];

const packageNames = [
  "1 Month",
  "3 Months",
  "1 Year"
];

let activeCategory = "All";

const grid = document.getElementById("productGrid");
const search = document.getElementById("search");

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function renderProducts() {
  if (!grid) return;

  const term = search
    ? search.value.toLowerCase().trim()
    : "";

  const filtered = products.filter(product => {
    const searchableText = [
      product.name,
      product.displayName,
      product.category,
      product.description,
      ...product.benefits
    ].join(" ").toLowerCase();

    return (
      (activeCategory === "All" ||
        product.category === activeCategory) &&
      searchableText.includes(term)
    );
  });

  if (!filtered.length) {
    grid.innerHTML = "<p>No products found. Try another search.</p>";
    return;
  }

  grid.innerHTML = filtered.map(product => {
    const options = product.prices.map((price, index) => `
      <option value="${index}">
        ${packageNames[index]} — GH₵${price.toFixed(2)}
      </option>
    `).join("");

    const benefits = product.benefits.map(benefit => `
      <li>${escapeHTML(benefit)}</li>
    `).join("");

    return `
      <article class="product-card">

        <div class="product-logo">
          ${escapeHTML(product.displayName.charAt(0))}
        </div>

        <p class="product-category">
          ${escapeHTML(product.category.toUpperCase())}
        </p>

        <h2>${escapeHTML(product.displayName)}</h2>

        <p class="product-description">
          ${escapeHTML(product.description)}
        </p>

        <div class="product-benefits">
          <h3>What's included</h3>
          <ul>
            ${benefits}
          </ul>
        </div>

        <label>Select duration</label>

        <select class="package-select">
          ${options}
        </select>

        <button
          class="btn primary buy-button"
          data-product="${escapeHTML(product.name)}"
        >
          Select Package ↗
        </button>

        <p class="product-note">
          Features depend on the official subscription plan,
          account eligibility and regional availability.
        </p>

      </article>
    `;
  }).join("");
}

// SEARCH
if (search) {
  search.addEventListener("input", renderProducts);
}

// CATEGORY FILTERS
document.querySelectorAll(".category").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".category").forEach(item => {
      item.classList.remove("active");
    });

    button.classList.add("active");
    activeCategory = button.dataset.category;

    renderProducts();
  });
}

// PAYSTACK CHECKOUT
if (grid) {
  grid.addEventListener("click", async event => {
    const button = event.target.closest(".buy-button");

    if (!button || button.disabled) return;

    const product = products.find(
      item => item.name === button.dataset.product
    );

    if (!product) return;

    const select = button.parentElement.querySelector(
      ".package-select"
    );

    const packageIndex = Number(select.value);

    if (
      !Number.isInteger(packageIndex) ||
      packageIndex < 0 ||
      packageIndex >= product.prices.length
    ) {
      alert("Please select a valid subscription duration.");
      return;
    }

    const email = prompt(
      "Enter your email address for Paystack checkout:"
    );

    if (!email) return;

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      alert("Please enter a valid email address.");
      return;
    }

    button.disabled = true;
    button.textContent = "Connecting to Paystack...";

    try {
      const response = await fetch("/api/payments/initialize", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: email.trim(),
          product: product.name,
          packageIndex
        })
      });

      const result = await response.json();

      if (!response.ok || !result.authorization_url) {
        throw new Error(
          result.error ||
          result.message ||
          "Could not start payment."
        );
      }

      window.location.href = result.authorization_url;

    } catch (error) {
      alert(
        error.message ||
        "Payment could not be started. Please try again."
      );

      button.disabled = false;
      button.textContent = "Select Package ↗";
    }
  });
}

renderProducts();
