
const products = [
  {name:"Netflix",category:"Entertainment",prices:[35,90,170,320,450]},
  {name:"YouTube Premium",category:"Entertainment",prices:[20,55,100,190,260]},
  {name:"Spotify Premium",category:"Entertainment",prices:[18,50,95,180,250]},
  {name:"Canva",category:"Productivity",prices:[25,70,135,250,350]},
  {name:"ChatGPT",category:"Productivity",prices:[45,125,240,460,620]},
  {name:"Microsoft 365",category:"Productivity",prices:[30,85,160,300,420]},
  {name:"Disney+",category:"Entertainment",prices:[25,70,135,250,350]},
  {name:"Prime Video",category:"Entertainment",prices:[20,55,105,200,280]},
  {name:"Telegram Premium",category:"Social",prices:[20,55,105,200,280]},
  {name:"Google One",category:"Cloud",prices:[15,40,75,140,200]}
];

const packageNames = ["Basic","Standard","Premium","Advanced","Ultimate"];

let activeCategory = "All";

const grid = document.getElementById("productGrid");
const search = document.getElementById("search");

function renderProducts() {
  if (!grid) return;

  const term = search ? search.value.toLowerCase().trim() : "";

  const filtered = products.filter(product => {
    return (
      (activeCategory === "All" || product.category === activeCategory) &&
      product.name.toLowerCase().includes(term)
    );
  });

  if (!filtered.length) {
    grid.innerHTML = "<p>No products found.</p>";
    return;
  }

  grid.innerHTML = filtered.map(product => `
    <article class="product-card">
      <div class="product-logo">${product.name.charAt(0)}</div>
      <p class="product-category">${product.category.toUpperCase()}</p>
      <h2>${product.name}</h2>
      <p>Choose the package that suits your needs.</p>
      <label>Select package</label>
      <select class="package-select">
        ${product.prices.map((price, i) => `
          <option value="${i}">
            ${packageNames[i]} — GH₵${price.toFixed(2)}
          </option>
        `).join("")}
      </select>
      <button class="btn primary buy-button" data-product="${product.name}">
        Buy Now ↗
      </button>
    </article>
  `).join("");
}

if (search) {
  search.addEventListener("input", renderProducts);
}

document.querySelectorAll(".category").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".category").forEach(item =>
      item.classList.remove("active")
    );

    button.classList.add("active");
    activeCategory = button.dataset.category;
    renderProducts();
  });
});

if (grid) {
  grid.addEventListener("click", async event => {
    const button = event.target.closest(".buy-button");
    if (!button || button.disabled) return;

    const product = products.find(
      item => item.name === button.dataset.product
    );

    if (!product) return;

    const select = button.parentElement.querySelector(".package-select");
    const packageIndex = Number(select.value);

    const email = prompt("Enter your email address for Paystack checkout:");

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
        throw new Error(result.error || result.message || "Could not start payment.");
      }

      window.location.href = result.authorization_url;

    } catch (error) {
      alert(error.message || "Payment could not be started. Please try again.");
      button.disabled = false;
      button.textContent = "Buy Now ↗";
    }
  });
}

renderProducts();
