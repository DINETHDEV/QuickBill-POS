// ─── QuickBill POS v2.0 — Multi-tenant SaaS ──────────────────────────────────

// ─── Auth Guard ───────────────────────────────────────────────────────────────
const qbToken = localStorage.getItem('qb_token');
if (!qbToken && !window.location.pathname.includes('login') && !window.location.pathname.includes('register')) {
    window.location.href = '/login.html';
}

// ─── Global State ─────────────────────────────────────────────────────────────
const API_URL = '/api';
let _settings = {};
let _subscription = JSON.parse(localStorage.getItem('qb_subscription') || '{}');
let _business = JSON.parse(localStorage.getItem('qb_business') || '{}');

const viewContainer = document.getElementById('view-container');
const navLinks = document.querySelectorAll('.nav-link');

// ─── Axios Auth Header ────────────────────────────────────────────────────────
axios.defaults.headers.common['Authorization'] = `Bearer ${qbToken}`;

// ─── Handle 401/402 globally ──────────────────────────────────────────────────
axios.interceptors.response.use(
    res => res,
    err => {
        if (err.response?.status === 401) {
            localStorage.removeItem('qb_token');
            localStorage.removeItem('qb_business');
            localStorage.removeItem('qb_subscription');
            window.location.href = '/login.html';
        } else if (err.response?.status === 402) {
            const code = err.response.data?.code;
            showSubscriptionBlock(code, err.response.data?.message, err.response.data?.daysRemaining);
        }
        return Promise.reject(err);
    }
);

// ─── Toast Notifications ──────────────────────────────────────────────────────
function showToast(message, type = 'success') {
    const existing = document.querySelector('.qb-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'qb-toast';
    const colors = { success: '#00a86b', error: '#ef4444', warning: '#f59e0b', info: '#3b82f6' };
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
    toast.style.cssText = `
        position: fixed; top: 24px; right: 24px; z-index: 999999;
        background: #1e293b; border: 1px solid ${colors[type]}40;
        border-left: 4px solid ${colors[type]}; color: white;
        padding: 14px 18px; border-radius: 10px;
        display: flex; align-items: center; gap: 10px;
        font-size: 14px; font-weight: 500; max-width: 360px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
        animation: toastIn 0.3s ease; font-family: 'Inter', sans-serif;
    `;
    toast.innerHTML = `<i class="fas ${icons[type]}" style="color:${colors[type]}"></i> ${message}`;
    document.body.appendChild(toast);

    if (!document.getElementById('toastStyles')) {
        const style = document.createElement('style');
        style.id = 'toastStyles';
        style.textContent = `@keyframes toastIn { from { opacity:0; transform: translateX(20px); } to { opacity:1; transform: translateX(0); } }`;
        document.head.appendChild(style);
    }
    setTimeout(() => toast.remove(), 3500);
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
function showConfirm(message, onConfirm, title = 'Confirm Action') {
    const existing = document.getElementById('confirmModal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'confirmModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.75);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
        <div class="card" style="max-width:400px;width:100%;text-align:center;">
            <i class="fas fa-exclamation-triangle" style="font-size:36px;color:#f59e0b;margin-bottom:16px;display:block;"></i>
            <h3 style="margin-bottom:10px;">${title}</h3>
            <p style="color:var(--text-muted);margin-bottom:24px;font-size:14px;">${message}</p>
            <div style="display:flex;gap:10px;">
                <button class="btn btn-outline" style="flex:1;justify-content:center;" onclick="document.getElementById('confirmModal').remove()">Cancel</button>
                <button class="btn btn-primary" style="flex:1;justify-content:center;background:#ef4444;border-color:#ef4444;" id="confirmOkBtn">Confirm</button>
            </div>
        </div>`;
    document.body.appendChild(modal);
    document.getElementById('confirmOkBtn').onclick = () => { modal.remove(); onConfirm(); };
}

// ─── Subscription Status Block ────────────────────────────────────────────────
function showSubscriptionBlock(code, message, daysRemaining) {
    const icons = {
        'SUBSCRIPTION_EXPIRED': 'fa-clock',
        'ACCOUNT_SUSPENDED': 'fa-ban',
        'NO_SUBSCRIPTION': 'fa-exclamation-circle',
        'ACCOUNT_CANCELLED': 'fa-times-circle'
    };
    const labels = {
        'SUBSCRIPTION_EXPIRED': 'Subscription Expired',
        'ACCOUNT_SUSPENDED': 'Account Suspended',
        'NO_SUBSCRIPTION': 'No Active Subscription',
        'ACCOUNT_CANCELLED': 'Account Cancelled'
    };
    viewContainer.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:center;min-height:70vh;">
            <div style="text-align:center;max-width:460px;padding:20px;">
                <div style="width:80px;height:80px;background:rgba(239,68,68,0.1);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;">
                    <i class="fas ${icons[code] || 'fa-lock'}" style="font-size:32px;color:#ef4444;"></i>
                </div>
                <h2 style="font-size:22px;margin-bottom:10px;">${labels[code] || 'Access Restricted'}</h2>
                <p style="color:var(--text-muted);margin-bottom:28px;line-height:1.6;">${message || 'Your account access has been restricted.'}</p>
                ${code === 'SUBSCRIPTION_EXPIRED' ? `
                <div style="background:rgba(0,168,107,0.08);border:1px solid rgba(0,168,107,0.2);border-radius:12px;padding:20px;margin-bottom:24px;">
                    <p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">To continue using QuickBill POS, please renew your subscription. Contact support:</p>
                    <a href="https://wa.me/${(_settings.supportWhatsapp||'').replace(/\D/g,'')}" target="_blank" class="btn btn-primary" style="justify-content:center;display:inline-flex;gap:8px;">
                        <i class="fab fa-whatsapp"></i> Contact Support
                    </a>
                </div>` : ''}
                <button class="btn btn-outline" onclick="logoutUser()" style="justify-content:center;">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </button>
            </div>
        </div>`;
}

// ─── Subscription Banner ──────────────────────────────────────────────────────
function renderSubBanner() {
    const banner = document.getElementById('subBanner');
    if (!banner) return;
    const sub = _subscription;
    if (!sub || !sub.status) { banner.style.display = 'none'; return; }

    if (sub.status === 'trial') {
        banner.style.display = 'flex';
        banner.innerHTML = `<i class="fas fa-gift"></i> <span><strong>Free Trial</strong> — ${sub.daysRemaining} day${sub.daysRemaining !== 1 ? 's' : ''} remaining</span>`;
        banner.style.background = 'rgba(245,158,11,0.15)';
        banner.style.borderColor = 'rgba(245,158,11,0.3)';
        banner.style.color = '#f59e0b';
    } else if (sub.status === 'expiring_soon') {
        banner.style.display = 'flex';
        banner.innerHTML = `<i class="fas fa-exclamation-triangle"></i> <span><strong>Expiring Soon</strong> — ${sub.daysRemaining} day${sub.daysRemaining !== 1 ? 's' : ''} left. Please renew.</span>`;
        banner.style.background = 'rgba(239,68,68,0.1)';
        banner.style.borderColor = 'rgba(239,68,68,0.25)';
        banner.style.color = '#ef4444';
    } else {
        banner.style.display = 'none';
    }
}

// ─── Logout ───────────────────────────────────────────────────────────────────
function logoutUser() {
    localStorage.removeItem('qb_token');
    localStorage.removeItem('qb_business');
    localStorage.removeItem('qb_subscription');
    window.location.href = '/login.html';
}
document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    showConfirm('Are you sure you want to logout?', logoutUser, 'Logout');
});

// ─── Cloudinary Thumbnail Helper ──────────────────────────────────────────────
function getThumbnailUrl(url, size = 300) {
    if (!url || !url.includes('cloudinary.com')) return url;
    return url.replace('/upload/', `/upload/c_limit,w_${size}/`);
}

// ─── Currency Formatter ───────────────────────────────────────────────────────
function formatCurrency(amount) {
    const currency = _settings.currency || _business.currency || 'Rs.';
    return `${currency} ${Number(amount || 0).toLocaleString()}`;
}

// ─── Navigation ───────────────────────────────────────────────────────────────
window.addEventListener('hashchange', () => handleNavigation(window.location.hash || '#dashboard'));

window.addEventListener('load', async () => {
    // Populate business name in sidebar
    const nameEl = document.getElementById('mainShopName');
    if (nameEl && _business.businessName) nameEl.textContent = _business.businessName;

    await syncBranding();
    renderSubBanner();
    handleNavigation(window.location.hash || '#dashboard');
});

async function syncBranding() {
    try {
        const res = await axios.get(`${API_URL}/settings`);
        _settings = res.data || {};

        const logoImg = document.getElementById('mainLogoImg');
        const logoIcon = document.getElementById('mainLogoIcon');

        const logoSrc = _settings.logo || _settings.shopLogo;
        if (logoSrc) {
            logoImg.src = logoSrc;
            logoImg.style.display = 'inline-block';
            logoIcon.style.display = 'none';
        } else {
            logoImg.style.display = 'none';
            logoIcon.style.display = 'inline-block';
        }
    } catch (e) {
        // Settings fail silently on load — subscription block handles 402
    }
}

function handleNavigation(hash) {
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === hash) link.classList.add('active');
    });
    switch (hash) {
        case '#dashboard': renderDashboard(); break;
        case '#products': renderProducts(); break;
        case '#billing': renderBilling(); break;
        case '#online-orders': renderOnlineOrders(); break;
        case '#reports': renderReports(); break;
        case '#settings': renderSettings(); break;
        default: renderDashboard();
    }
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────
function showLoading(title = 'Loading...') {
    viewContainer.innerHTML = `
        <div class="fade-in" style="padding:20px 0;">
            <h2 style="margin-bottom:24px;">${title}</h2>
            <div class="grid">
                ${[1,2,3].map(() => `<div class="card" style="height:100px;background:linear-gradient(90deg,var(--border) 25%,rgba(255,255,255,0.05) 50%,var(--border) 75%);background-size:200% 100%;animation:shimmer 1.2s infinite;"></div>`).join('')}
            </div>
        </div>
        <style>@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}</style>`;
}

// ─── 1. DASHBOARD ─────────────────────────────────────────────────────────────
async function renderDashboard() {
    showLoading('Dashboard');
    try {
        const [summaryRes, dailyRes] = await Promise.all([
            axios.get(`${API_URL}/reports/summary`),
            axios.get(`${API_URL}/reports/daily`)
        ]);
        const { totalSales, totalProfit, lowStockCount, totalItems, bestSelling } = summaryRes.data;
        const dailySales = dailyRes.data;
        const todayTotal = dailySales.reduce((s, x) => s + x.totalAmount, 0);

        viewContainer.innerHTML = `
        <div class="fade-in">
            <h2 style="margin-bottom:24px;">Dashboard</h2>
            <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));">
                <div class="card stat-card">
                    <h3>Today's Sales</h3>
                    <div class="value" style="font-size:26px;">${formatCurrency(todayTotal)}</div>
                    <div style="color:var(--text-muted);font-size:13px;margin-top:8px;">${dailySales.length} invoice${dailySales.length !== 1 ? 's' : ''} today</div>
                </div>
                <div class="card stat-card">
                    <h3>Total Revenue</h3>
                    <div class="value" style="font-size:26px;">${formatCurrency(totalSales)}</div>
                    <div style="color:var(--text-muted);font-size:13px;margin-top:8px;">All time</div>
                </div>
                <div class="card stat-card">
                    <h3>Low Stock</h3>
                    <div class="value" style="font-size:26px;color:${lowStockCount > 0 ? '#ef4444' : 'var(--accent)'};">${lowStockCount}</div>
                    <div style="color:var(--text-muted);font-size:13px;margin-top:8px;">Products to reorder</div>
                </div>
                <div class="card stat-card">
                    <h3>Total Products</h3>
                    <div class="value" style="font-size:26px;">${totalItems || 0}</div>
                    <div style="color:var(--text-muted);font-size:13px;margin-top:8px;">In inventory</div>
                </div>
            </div>

            <div style="display:flex;gap:15px;margin-top:32px;flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="window.location.hash='#billing'">
                    <i class="fas fa-receipt"></i> NEW SALE
                </button>
                <button class="btn btn-outline" onclick="window.location.hash='#products';setTimeout(showProductModal,100);">
                    <i class="fas fa-plus"></i> ADD PRODUCT
                </button>
                <a href="/shop/${_business.slug || ''}" target="_blank" class="btn btn-outline" style="text-decoration:none;">
                    <i class="fas fa-external-link-alt"></i> VIEW SHOP
                </a>
            </div>

            ${bestSelling && bestSelling.length > 0 ? `
            <div style="margin-top:40px;">
                <h3 style="margin-bottom:16px;">Featured Products</h3>
                <div class="grid">
                    ${bestSelling.map(p => `
                        <div class="card" style="display:flex;gap:14px;align-items:center;padding:16px;">
                            <img src="${getThumbnailUrl(p.image,80) || 'https://via.placeholder.com/60'}" style="width:56px;height:56px;border-radius:8px;object-fit:cover;flex-shrink:0;">
                            <div>
                                <div style="font-weight:600;font-size:14px;">${p.name}</div>
                                <div style="color:var(--accent);font-size:14px;margin-top:3px;">${formatCurrency(p.price)}</div>
                                <div style="color:${p.stock < 10 ? '#ef4444' : 'var(--text-muted)'};font-size:12px;margin-top:2px;">Stock: ${p.stock}</div>
                            </div>
                        </div>`).join('')}
                </div>
            </div>` : ''}
        </div>`;
    } catch (err) {
        if (err.response?.status !== 402) {
            viewContainer.innerHTML = `<div class="card"><i class="fas fa-exclamation-circle" style="color:#ef4444;"></i> Error loading dashboard: ${err.message} <button class="btn btn-outline" onclick="renderDashboard()" style="margin-left:12px;">Retry</button></div>`;
        }
    }
}

// ─── 2. PRODUCTS ──────────────────────────────────────────────────────────────
let allProducts = [];
async function renderProducts() {
    showLoading('Product Management');
    try {
        const res = await axios.get(`${API_URL}/products`);
        allProducts = res.data;
        buildProductView();
    } catch (err) {
        if (err.response?.status !== 402) {
            viewContainer.innerHTML = `<div class="card"><i class="fas fa-exclamation-circle" style="color:#ef4444;margin-right:8px;"></i>Error loading products. <button class="btn btn-outline" onclick="renderProducts()" style="margin-left:12px;">Retry</button></div>`;
        }
    }
}

function buildProductView() {
    const productsHTML = allProducts.length ? allProducts.map(p => productCardHTML(p)).join('') :
        `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted);">
            <i class="fas fa-boxes-stacked" style="font-size:48px;opacity:0.3;display:block;margin-bottom:16px;"></i>
            <h3>No products yet</h3>
            <p style="margin-top:8px;font-size:14px;">Click "Add Product" to get started.</p>
        </div>`;

    viewContainer.innerHTML = `
    <div class="fade-in">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
            <h2>Product Management</h2>
            <button class="btn btn-primary" onclick="showProductModal()"><i class="fas fa-plus"></i> ADD PRODUCT</button>
        </div>
        <div class="card" style="margin-bottom:24px;display:flex;gap:12px;padding:14px;flex-wrap:wrap;">
            <input type="text" id="productSearch" placeholder="Search products..." style="flex:2;min-width:180px;" oninput="filterProducts()">
            <select id="stockFilter" style="flex:1;min-width:130px;" onchange="filterProducts()">
                <option value="">All Stock</option>
                <option value="low">Low Stock (&lt;10)</option>
                <option value="in">In Stock</option>
                <option value="out">Out of Stock</option>
            </select>
            <select id="categoryFilter" style="flex:1;min-width:130px;" onchange="filterProducts()">
                <option value="">All Categories</option>
                ${[...new Set(allProducts.map(p => p.category).filter(Boolean))].map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
        </div>
        <div class="grid" id="productGrid">${productsHTML}</div>
    </div>

    <!-- Advanced Product Modal -->
    <div id="productModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:9999;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto;">
        <div class="card" style="width:100%;max-width:680px;margin:20px auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 id="modalTitle">Add New Product</h3>
                <button onclick="closeProductModal()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;"><i class="fas fa-times"></i></button>
            </div>
            <form id="productForm">
                <!-- Basic Info -->
                <div class="form-group"><label>Product Name *</label><input type="text" id="p_name" required></div>
                <!-- Product Type Selector -->
                <div class="form-group">
                    <label>Product Type</label>
                    <select id="p_type" onchange="onProductTypeChange()" style="background:var(--bg-card);color:var(--text);border:1px solid var(--border);border-radius:8px;padding:10px 14px;width:100%;font-size:14px;">
                        <option value="General">📦 General</option>
                        <option value="Grocery">🛒 Grocery / Supermarket</option>
                        <option value="Fashion">👗 Fashion / Clothing</option>
                        <option value="Electronics">📱 Electronics</option>
                        <option value="Beauty">💄 Beauty / Cosmetics</option>
                        <option value="Custom">⚙️ Custom</option>
                    </select>
                </div>
                <!-- Dynamic Type Fields -->
                <div id="p_type_fields" style="margin-bottom:12px;"></div>
                <!-- Price / Cost / Stock -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
                    <div class="form-group"><label>Selling Price *</label><input type="number" id="p_price" min="0" step="0.01" required></div>
                    <div class="form-group"><label>Cost Price</label><input type="number" id="p_cost" min="0" step="0.01" placeholder="For profit tracking"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
                    <div class="form-group"><label>Stock Quantity *</label><input type="number" id="p_stock" min="0" required></div>
                    <div class="form-group"><label>Category</label><input type="text" id="p_category" placeholder="e.g. Groceries"></div>
                </div>
                <!-- Featured Toggle -->
                <div class="form-group" style="display:flex;align-items:center;gap:10px;background:rgba(0,168,107,0.05);padding:12px;border-radius:8px;border:1px solid rgba(0,168,107,0.15);">
                    <input type="checkbox" id="p_featured" style="width:auto;cursor:pointer;">
                    <label for="p_featured" style="margin:0;cursor:pointer;font-size:14px;font-weight:600;">⭐ Featured Product (shown as HOT on shop)</label>
                </div>
                <!-- Image -->
                <div class="form-group"><label>Product Image</label><input type="file" id="p_image" accept="image/*"></div>
                <div id="editImgPreview" style="display:none;margin-bottom:16px;">
                    <label style="font-size:12px;">Current Image:</label>
                    <img id="editImgThumb" style="width:60px;height:60px;border-radius:8px;object-fit:cover;display:block;margin-top:6px;">
                </div>

                <!-- Variants Toggle -->
                <div style="border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:16px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                        <div>
                            <div style="font-weight:700;font-size:14px;">🎛️ Product Variants</div>
                            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">Enable if this product has multiple sizes, weights, or options</div>
                        </div>
                        <label class="switch"><input type="checkbox" id="p_hasVariants" onchange="onVariantsToggle()"><span class="slider round"></span></label>
                    </div>
                    <div id="variantBuilder" style="display:none;">
                        <div id="variantOptionsArea"></div>
                        <button type="button" class="btn btn-outline" style="width:100%;justify-content:center;margin-top:12px;" onclick="generateVariants()">
                            <i class="fas fa-magic"></i> Generate Variants
                        </button>
                        <div id="variantTable" style="margin-top:16px;"></div>
                    </div>
                </div>

                <div style="display:flex;gap:10px;margin-top:4px;">
                    <button type="submit" class="btn btn-primary" style="flex:1;justify-content:center;" id="saveProductBtn">SAVE PRODUCT</button>
                    <button type="button" class="btn btn-outline" style="flex:1;justify-content:center;" onclick="closeProductModal()">CANCEL</button>
                </div>
            </form>
        </div>
    </div>`;

    document.getElementById('productForm').addEventListener('submit', handleProductSave);
    onProductTypeChange(); // set initial state
}

function productCardHTML(p) {
    const stockColor = p.stock === 0 ? '#ef4444' : p.stock < 10 ? '#f59e0b' : 'var(--accent)';
    const stockLabel = p.stock === 0 ? 'Out of Stock' : p.stock < 10 ? `Low: ${p.stock}` : `${p.stock} in stock`;
    const typeIcons = { Grocery:'🛒', Fashion:'👗', Electronics:'📱', Beauty:'💄', General:'📦', Custom:'⚙️' };
    const typeIcon = typeIcons[p.productType] || '📦';
    const variantBadge = p.hasVariants && p.variants?.length ? `<span style="font-size:10px;background:rgba(0,168,107,0.15);color:var(--accent);padding:2px 7px;border-radius:4px;white-space:nowrap;">${p.variants.length} variants</span>` : '';
    return `
    <div class="card product-card">
        <div style="position:relative;">
            <img src="${getThumbnailUrl(p.image,300) || 'data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'180\'><rect fill=\'%231e293b\' width=\'300\' height=\'180\'/><text x=\'50%\' y=\'50%\' fill=\'%23475569\' text-anchor=\'middle\' dy=\'.3em\' font-size=\'40\'>📦</text></svg>'}" class="product-img">
            ${p.isFeatured ? '<span style="position:absolute;top:10px;right:10px;background:#f59e0b;color:white;font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;letter-spacing:0.05em;">HOT</span>' : ''}
        </div>
        <div class="product-info">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:8px;">
                <h4 style="font-size:15px;line-height:1.3;">${typeIcon} ${p.name}</h4>
                ${p.category ? `<span style="font-size:11px;background:var(--border);padding:2px 8px;border-radius:4px;white-space:nowrap;flex-shrink:0;">${p.category}</span>` : ''}
            </div>
            ${variantBadge ? `<div style="margin:4px 0;">${variantBadge}</div>` : ''}
            <div style="color:${stockColor};font-size:13px;margin:6px 0;">● ${stockLabel}</div>
            <div class="product-price">${formatCurrency(p.price)}</div>
            <div style="margin-top:14px;display:flex;gap:8px;">
                <button class="btn btn-outline" style="flex:1;padding:8px;font-size:13px;" onclick="editProduct('${p._id}')"><i class="fas fa-edit"></i> Edit</button>
                <button class="btn btn-outline" style="padding:8px 14px;border-color:#ef4444;color:#ef4444;" onclick="deleteProduct('${p._id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    </div>`;
}

// ─── Product Type Templates ───────────────────────────────────────────────────
const PRODUCT_TYPE_FIELDS = {
    Grocery: [
        { id: 'attr_weight_unit', label: 'Weight / Volume Options', placeholder: '250g, 500g, 1kg, 2kg, 5kg', hint: 'Comma-separated weight options' },
        { id: 'attr_packaging', label: 'Packaging Types', placeholder: 'Pack, Bottle, Box, Piece', hint: 'Comma-separated packaging types' },
    ],
    Fashion: [
        { id: 'attr_size', label: 'Sizes', placeholder: 'XS, S, M, L, XL, XXL', hint: 'Comma-separated sizes' },
        { id: 'attr_color', label: 'Colors', placeholder: 'Black, White, Red, Blue', hint: 'Comma-separated colors' },
        { id: 'attr_brand', label: 'Brand', placeholder: 'e.g. Nike, Zara' },
        { id: 'attr_material', label: 'Material', placeholder: 'e.g. Cotton, Polyester' },
        { id: 'attr_gender', label: 'Gender', placeholder: 'Unisex, Men, Women, Kids' },
    ],
    Electronics: [
        { id: 'attr_brand', label: 'Brand', placeholder: 'e.g. Samsung, Apple' },
        { id: 'attr_model', label: 'Model', placeholder: 'e.g. Galaxy S24' },
        { id: 'attr_storage', label: 'Storage Options', placeholder: '64GB, 128GB, 256GB', hint: 'Comma-separated storage options' },
        { id: 'attr_color', label: 'Colors', placeholder: 'Black, White, Gold', hint: 'Comma-separated colors' },
        { id: 'attr_warranty', label: 'Warranty', placeholder: 'e.g. 1 Year' },
    ],
    Beauty: [
        { id: 'attr_brand', label: 'Brand', placeholder: 'e.g. Loreal, MAC' },
        { id: 'attr_size', label: 'Size', placeholder: 'Small, Large, Travel Size' },
        { id: 'attr_volume', label: 'Volume Options', placeholder: '30ml, 50ml, 100ml', hint: 'Comma-separated volume options' },
        { id: 'attr_shade', label: 'Shades', placeholder: 'Nude, Red, Pink', hint: 'Comma-separated shades' },
        { id: 'attr_skin_type', label: 'Skin Type', placeholder: 'Oily, Dry, Normal, All' },
        { id: 'attr_hair_type', label: 'Hair Type', placeholder: 'Straight, Curly, Wavy, Coily, All' },
        { id: 'attr_custom', label: 'Custom Attributes', placeholder: 'e.g. SPF 50, Matte Finish' },
    ],
    General: [],
    Custom: [
        { id: 'attr_custom1', label: 'Custom Option 1', placeholder: 'Option values...' },
        { id: 'attr_custom2', label: 'Custom Option 2', placeholder: 'Option values...' },
    ]
};

const VARIANT_AXIS_FOR_TYPE = {
    Grocery: ['attr_weight_unit', 'attr_packaging'],
    Fashion: ['attr_size', 'attr_color'],
    Electronics: ['attr_storage', 'attr_color'],
    Beauty: ['attr_shade', 'attr_volume', 'attr_size'],
    General: [],
    Custom: ['attr_custom1', 'attr_custom2'],
};

window.onProductTypeChange = function() {
    const type = document.getElementById('p_type')?.value || 'General';
    const fields = PRODUCT_TYPE_FIELDS[type] || [];
    const container = document.getElementById('p_type_fields');
    if (!container) return;
    if (!fields.length) { container.innerHTML = ''; return; }
    container.innerHTML = `
        <div style="background:rgba(0,168,107,0.04);border:1px solid rgba(0,168,107,0.15);border-radius:10px;padding:16px;margin-bottom:4px;">
            <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--accent);margin-bottom:12px;">📋 ${type} Attributes</div>
            ${fields.map(f => `
                <div class="form-group" style="margin-bottom:10px;">
                    <label style="font-size:13px;">${f.label}</label>
                    <input type="text" id="${f.id}" placeholder="${f.placeholder}" style="font-size:13px;">
                    ${f.hint ? `<div style="font-size:11px;color:var(--text-muted);margin-top:4px;">${f.hint}</div>` : ''}
                </div>`).join('')}
        </div>`;

    // Also update variant options area if variants are enabled
    if (document.getElementById('p_hasVariants')?.checked) onVariantsToggle();
};

window.onVariantsToggle = function() {
    const enabled = document.getElementById('p_hasVariants')?.checked;
    const builder = document.getElementById('variantBuilder');
    if (!builder) return;
    builder.style.display = enabled ? 'block' : 'none';
    if (!enabled) return;

    const type = document.getElementById('p_type')?.value || 'General';
    const axes = VARIANT_AXIS_FOR_TYPE[type] || [];
    const fields = PRODUCT_TYPE_FIELDS[type] || [];
    const optionsArea = document.getElementById('variantOptionsArea');

    if (!axes.length) {
        optionsArea.innerHTML = `<div style="font-size:13px;color:var(--text-muted);padding:8px 0;">Enter option values above (in the attribute fields) to generate variants.</div>`;
        return;
    }

    const relevantFields = fields.filter(f => axes.includes(f.id));
    optionsArea.innerHTML = `
        <div style="font-size:12px;color:var(--text-muted);margin-bottom:10px;">Variants will be generated from the option fields below:</div>
        ${relevantFields.map(f => `<div style="font-size:13px;font-weight:600;margin-bottom:4px;color:var(--text);">${f.label}: <span style="color:var(--text-muted);font-weight:400;">${document.getElementById(f.id)?.value || '(none)'}</span></div>`).join('')}`;
};

// Global variant list for current product being edited
window._currentVariants = [];

window.generateVariants = function() {
    const type = document.getElementById('p_type')?.value || 'General';
    const axes = VARIANT_AXIS_FOR_TYPE[type] || [];
    const fields = PRODUCT_TYPE_FIELDS[type] || [];
    const basePrice = parseFloat(document.getElementById('p_price')?.value) || 0;

    // Collect values per axis
    const axisSets = axes.map(axisId => {
        const field = fields.find(f => f.id === axisId);
        const raw = document.getElementById(axisId)?.value || '';
        const rawVals = raw.split(',').map(s => s.trim()).filter(Boolean);
        const values = [];
        const seen = new Set();
        for (const v of rawVals) {
            const norm = v.toLowerCase();
            if (!seen.has(norm)) {
                seen.add(norm);
                values.push(v);
            }
        }
        return { axisId, label: field?.label || axisId, values };
    }).filter(a => a.values.length > 0);

    if (!axisSets.length) {
        showToast('Please fill in attribute options first, then click Generate.', 'warning');
        return;
    }

    // Cross product of axes
    const combos = axisSets.reduce((acc, axis) => {
        if (!acc.length) return axis.values.map(v => [{ label: axis.label, value: v }]);
        const next = [];
        for (const existing of acc) {
            for (const v of axis.values) {
                next.push([...existing, { label: axis.label, value: v }]);
            }
        }
        return next;
    }, []);

    // Build variant objects
    window._currentVariants = combos.map(combo => {
        const label = combo.map(c => c.value).join(' / ');
        const skuBase = document.getElementById('p_name')?.value?.substring(0, 4).toUpperCase() || 'PRD';
        const sku = skuBase + '-' + combo.map(c => c.value.substring(0, 3).toUpperCase().replace(/\s/g, '')).join('-');
        return {
            _id: '', label, sku, barcode: '', price: basePrice, stock: 10,
            attributes: Object.fromEntries(combo.map(c => [c.label, c.value]))
        };
    });

    renderVariantTable();
};

function renderVariantTable() {
    const table = document.getElementById('variantTable');
    if (!table) return;
    if (!window._currentVariants.length) { table.innerHTML = ''; return; }
    table.innerHTML = `
        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:10px;">Generated Variants</div>
        <div style="overflow-x:auto;">
        <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead>
                <tr style="border-bottom:1px solid var(--border);">
                    <th style="text-align:left;padding:6px 4px;color:var(--text-muted);">Variant</th>
                    <th style="text-align:left;padding:6px 4px;color:var(--text-muted);">SKU</th>
                    <th style="text-align:right;padding:6px 4px;color:var(--text-muted);">Price</th>
                    <th style="text-align:right;padding:6px 4px;color:var(--text-muted);">Stock</th>
                    <th style="padding:6px 4px;"></th>
                </tr>
            </thead>
            <tbody>
                ${window._currentVariants.map((v, i) => `
                    <tr style="border-bottom:1px solid rgba(255,255,255,0.04);">
                        <td style="padding:6px 4px;font-weight:600;">${v.label}</td>
                        <td style="padding:6px 4px;"><input type="text" value="${v.sku}" style="width:90px;font-size:11px;padding:4px 6px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:4px;color:var(--text);" onchange="window._currentVariants[${i}].sku=this.value"></td>
                        <td style="padding:6px 4px;text-align:right;"><input type="number" value="${v.price}" min="0" step="0.01" style="width:80px;font-size:11px;padding:4px 6px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:4px;color:var(--text);text-align:right;" onchange="window._currentVariants[${i}].price=parseFloat(this.value)||0"></td>
                        <td style="padding:6px 4px;text-align:right;"><input type="number" value="${v.stock}" min="0" style="width:60px;font-size:11px;padding:4px 6px;background:rgba(255,255,255,0.05);border:1px solid var(--border);border-radius:4px;color:var(--text);text-align:right;" onchange="window._currentVariants[${i}].stock=parseInt(this.value)||0"></td>
                        <td style="padding:6px 4px;"><button type="button" onclick="window._currentVariants.splice(${i},1);renderVariantTable();" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px;">✕</button></td>
                    </tr>`).join('')}
            </tbody>
        </table>
        </div>`;
}

window.showProductModal = function() {
    document.getElementById('productModal').style.display = 'flex';
    document.getElementById('productForm').reset();
    document.getElementById('productForm').dataset.editId = '';
    document.getElementById('modalTitle').innerText = 'Add New Product';
    document.getElementById('editImgPreview').style.display = 'none';
    window._currentVariants = [];
    if (document.getElementById('variantTable')) document.getElementById('variantTable').innerHTML = '';
    if (document.getElementById('variantBuilder')) document.getElementById('variantBuilder').style.display = 'none';
    onProductTypeChange();
};

window.closeProductModal = function() {
    document.getElementById('productModal').style.display = 'none';
};

function filterProducts() {
    const q = (document.getElementById('productSearch')?.value || '').toLowerCase();
    const stock = document.getElementById('stockFilter')?.value || '';
    const cat = document.getElementById('categoryFilter')?.value || '';

    const filtered = allProducts.filter(p => {
        const matchQ = !q || p.name.toLowerCase().includes(q) || (p.category||'').toLowerCase().includes(q);
        const matchS = !stock ||
            (stock === 'low' && p.stock > 0 && p.stock < 10) ||
            (stock === 'in' && p.stock >= 10) ||
            (stock === 'out' && p.stock === 0);
        const matchC = !cat || p.category === cat;
        return matchQ && matchS && matchC;
    });

    const grid = document.getElementById('productGrid');
    if (!grid) return;
    grid.innerHTML = filtered.length ? filtered.map(productCardHTML).join('') :
        '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">No matching products found.</div>';
}

async function handleProductSave(e) {
    e.preventDefault();
    const btn = document.getElementById('saveProductBtn');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    const type = document.getElementById('p_type')?.value || 'General';
    const fields = PRODUCT_TYPE_FIELDS[type] || [];
    const attrs = {};
    fields.forEach(f => {
        const val = document.getElementById(f.id)?.value || '';
        if (val) attrs[f.id.replace('attr_', '')] = val;
    });

    const hasVar = document.getElementById('p_hasVariants')?.checked || false;

    const formData = new FormData();
    formData.append('name', document.getElementById('p_name').value);
    formData.append('price', document.getElementById('p_price').value);
    formData.append('costPrice', document.getElementById('p_cost').value || '0');
    formData.append('stock', document.getElementById('p_stock').value);
    formData.append('category', document.getElementById('p_category').value);
    formData.append('isFeatured', document.getElementById('p_featured').checked);
    formData.append('productType', type);
    formData.append('attributes', JSON.stringify(attrs));
    formData.append('hasVariants', hasVar);
    if (hasVar && window._currentVariants.length) {
        formData.append('variants', JSON.stringify(window._currentVariants));
    }
    const fileInput = document.getElementById('p_image');
    if (fileInput.files[0]) formData.append('image', fileInput.files[0]);

    const editId = document.getElementById('productForm').dataset.editId;
    try {
        if (editId) {
            await axios.put(`${API_URL}/products/${editId}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            showToast('Product updated successfully!');
        } else {
            await axios.post(`${API_URL}/products`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            showToast('Product added successfully!');
        }
        closeProductModal();
        renderProducts();
    } catch (err) {
        showToast(err.response?.data?.message || 'Error saving product', 'error');
        btn.innerHTML = 'SAVE PRODUCT';
        btn.disabled = false;
    }
}

window.editProduct = function(id) {
    const p = allProducts.find(x => x._id === id || String(x.id) === String(id));
    if (!p) return;
    showProductModal();
    document.getElementById('modalTitle').innerText = 'Edit Product';
    document.getElementById('productForm').dataset.editId = id;
    document.getElementById('p_name').value = p.name;
    document.getElementById('p_price').value = p.price;
    document.getElementById('p_cost').value = p.costPrice || '';
    document.getElementById('p_stock').value = p.stock;
    document.getElementById('p_category').value = p.category || '';
    document.getElementById('p_featured').checked = Boolean(p.isFeatured);

    // Set product type and render attributes
    const typeEl = document.getElementById('p_type');
    if (typeEl) typeEl.value = p.productType || 'General';
    onProductTypeChange();

    // Fill attribute values
    const attrs = p.attributes || {};
    const fields = PRODUCT_TYPE_FIELDS[p.productType || 'General'] || [];
    fields.forEach(f => {
        const key = f.id.replace('attr_', '');
        const el = document.getElementById(f.id);
        if (el && attrs[key]) el.value = attrs[key];
    });

    // Load variants
    if (p.hasVariants && p.variants?.length) {
        const varToggle = document.getElementById('p_hasVariants');
        if (varToggle) varToggle.checked = true;
        window._currentVariants = p.variants.map(v => ({
            _id: v._id || '',
            label: Object.values(v.attributes || {}).join(' / '),
            sku: v.sku || '',
            barcode: v.barcode || '',
            price: v.price || p.price,
            stock: v.stock || 0,
            attributes: v.attributes || {}
        }));
        const builder = document.getElementById('variantBuilder');
        if (builder) builder.style.display = 'block';
        renderVariantTable();
    }

    if (p.image) {
        document.getElementById('editImgPreview').style.display = 'block';
        document.getElementById('editImgThumb').src = getThumbnailUrl(p.image, 80);
    }
};

window.deleteProduct = function(id) {
    showConfirm('This product will be permanently deleted.', async () => {
        try {
            await axios.delete(`${API_URL}/products/${id}`);
            showToast('Product deleted.', 'warning');
            renderProducts();
        } catch (err) {
            showToast(err.response?.data?.message || 'Delete failed', 'error');
        }
    }, 'Delete Product');
};

// ─── 3. BILLING ───────────────────────────────────────────────────────────────
let cart = [];
async function renderBilling() {
    showLoading('Billing System');
    try {
        const res = await axios.get(`${API_URL}/products`);
        const products = res.data.filter(p => p.stock > 0);
        cart = [];
        buildBillingView(products);
    } catch (err) {
        if (err.response?.status !== 402) {
            viewContainer.innerHTML = `<div class="card"><i class="fas fa-exclamation-circle" style="color:#ef4444;margin-right:8px;"></i>Error loading billing. <button class="btn btn-outline" onclick="renderBilling()" style="margin-left:12px;">Retry</button></div>`;
        }
    }
}

function buildBillingView(products) {
    viewContainer.innerHTML = `
    <div class="fade-in">
        <h2 style="margin-bottom:24px;">Billing System</h2>
        <div class="billing-layout">
            <div class="products-section">
                <div class="card" style="margin-bottom:16px;padding:12px;">
                    <input type="text" id="billSearch" placeholder="Search products..." style="width:100%;" oninput="filterBillProducts()">
                </div>
                <div class="grid" id="billProductGrid">
                    ${products.length ? products.map(p => `
                        <div class="card" style="padding:14px;cursor:pointer;transition:all 0.2s;" onclick="addToCart('${p._id}')" onmouseenter="this.style.borderColor='var(--accent)'" onmouseleave="this.style.borderColor='var(--border)'">
                            ${p.image ? `<img src="${getThumbnailUrl(p.image,100)}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:10px;">` : ''}
                            <div style="font-weight:600;font-size:14px;line-height:1.3;">${p.name}</div>
                            <div style="color:var(--accent);font-weight:700;margin-top:4px;">${formatCurrency(p.price)}</div>
                            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${p.stock} in stock</div>
                            ${p.hasVariants && p.variants?.length ? `<div style="font-size:10px;background:rgba(0,168,107,0.15);color:var(--accent);padding:2px 7px;border-radius:4px;margin-top:6px;display:inline-block;">${p.variants.length} variants</div>` : ''}
                        </div>`).join('') :
                        `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted);">No products in stock. <a href="#products" onclick="window.location.hash='#products'">Add products →</a></div>`}
                </div>
            </div>

            <div class="cart-section">
                <div class="card cart-card">
                    <h3 style="margin-bottom:16px;">Sale Details</h3>
                    <div class="form-group" style="margin-bottom:10px;">
                        <input type="text" id="custName" placeholder="Customer Name (optional)">
                    </div>
                    <div class="form-group" style="margin-bottom:0;">
                        <input type="text" id="custPhone" placeholder="Phone / Address (optional)">
                    </div>

                    <!-- PAYMENT STATUS SELECTOR -->
                    <div style="margin:16px 0 14px;">
                        <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-muted);margin-bottom:10px;">Payment Status</div>
                        <div style="display:flex;gap:10px;">
                            <div id="ps-paid" class="ps-option" onclick="setPaymentStatus('PAID')" style="flex:1;cursor:pointer;text-align:center;padding:12px 8px;border-radius:10px;border:2px solid #a7f3d0;background:#ecfdf5;transition:all 0.2s;">
                                <div style="font-size:18px;margin-bottom:4px;">✅</div>
                                <div style="font-weight:700;font-size:13px;color:#059669;">PAID</div>
                                <div style="font-size:10px;color:#64748b;margin-top:2px;">Payment Done</div>
                            </div>
                            <div id="ps-cod" class="ps-option" onclick="setPaymentStatus('COD')" style="flex:1;cursor:pointer;text-align:center;padding:12px 8px;border-radius:10px;border:2px solid var(--border);background:var(--bg-card);transition:all 0.2s;">
                                <div style="font-size:18px;margin-bottom:4px;">🚚</div>
                                <div style="font-weight:700;font-size:13px;color:var(--text);">COD</div>
                                <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">Cash Delivery</div>
                            </div>
                        </div>
                    </div>

                    <hr style="border:none;border-top:1px solid var(--border);margin:0 0 14px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                        <h3 style="margin:0;">Cart</h3>
                        <span style="font-size:13px;background:rgba(0,168,107,0.1);color:var(--accent);padding:3px 10px;border-radius:20px;" id="cartCount">0 items</span>
                    </div>
                    <div id="cartItems" style="max-height:280px;overflow-y:auto;margin-bottom:16px;">
                        <p style="color:var(--text-muted);text-align:center;padding:20px;font-size:14px;">Cart is empty</p>
                    </div>

                    <!-- Discount -->
                    <div class="form-group" style="margin-bottom:10px;">
                        <label style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);">Discount</label>
                        <input type="number" id="discountAmt" placeholder="0.00" min="0" step="0.01" style="font-size:14px;" oninput="updateCartUI()">
                    </div>

                    <!-- Delivery Cost -->
                    <div class="form-group" style="margin-bottom:16px;">
                        <label style="font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-muted);">
                            <i class="fas fa-truck" style="margin-right:5px;color:#3b82f6;"></i>Delivery Cost
                        </label>
                        <input type="number" id="deliveryCost" placeholder="0.00" min="0" step="0.01" value="0" style="font-size:14px;" oninput="updateCartUI()">
                    </div>

                    <hr style="border:none;border-top:1px solid var(--border);margin:0 0 14px;">

                    <!-- Totals Breakdown -->
                    <div style="margin-bottom:16px;font-size:14px;">
                        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                            <span style="color:var(--text-muted);">Subtotal</span>
                            <span id="cartSubtotal">${formatCurrency(0)}</span>
                        </div>
                        <div id="discountRow" style="display:none;justify-content:space-between;margin-bottom:6px;">
                            <span style="color:#ef4444;">Discount</span>
                            <span id="cartDiscountVal" style="color:#ef4444;"></span>
                        </div>
                        <div id="deliveryRow" style="display:none;justify-content:space-between;margin-bottom:6px;">
                            <span style="color:#3b82f6;"><i class="fas fa-truck" style="font-size:11px;margin-right:4px;"></i>Delivery</span>
                            <span id="cartDeliveryVal" style="color:#3b82f6;"></span>
                        </div>
                        <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:700;padding-top:8px;border-top:1px solid var(--border);margin-top:4px;">
                            <span>Grand Total</span>
                            <span id="cartTotal" style="color:var(--accent);">${formatCurrency(0)}</span>
                        </div>
                        <div id="amountDueRow" style="display:none;justify-content:space-between;font-size:13px;font-weight:700;padding-top:8px;margin-top:4px;border-top:1px dashed var(--border);">
                            <span style="color:#f59e0b;"><i class="fas fa-clock" style="font-size:11px;margin-right:4px;"></i>Amount Due (COD)</span>
                            <span id="cartAmountDue" style="color:#f59e0b;"></span>
                        </div>
                    </div>

                    <button class="btn btn-primary" style="width:100%;justify-content:center;padding:14px;font-size:15px;" onclick="checkout()">
                        <i class="fas fa-check"></i> COMPLETE SALE
                    </button>
                </div>
            </div>
        </div>
    </div>`;

    window._billProducts = products;
    // Initialize payment status selector (PAID is the default)
    currentPaymentStatus = 'PAID';
    setPaymentStatus('PAID');
    updateCartUI();
}

let _billProducts = [];
window.filterBillProducts = function() {
    const q = document.getElementById('billSearch')?.value?.toLowerCase() || '';
    const filtered = window._billProducts.filter(p => p.name.toLowerCase().includes(q));
    document.getElementById('billProductGrid').innerHTML = filtered.map(p => `
        <div class="card" style="padding:14px;cursor:pointer;" onclick="addToCart('${p._id}')" onmouseenter="this.style.borderColor='var(--accent)'" onmouseleave="this.style.borderColor='var(--border)'">
            ${p.image ? `<img src="${getThumbnailUrl(p.image,100)}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:10px;">` : ''}
            <div style="font-weight:600;font-size:14px;">${p.name}</div>
            <div style="color:var(--accent);font-weight:700;margin-top:4px;">${formatCurrency(p.price)}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${p.stock} in stock</div>
            ${p.hasVariants && p.variants?.length ? `<div style="font-size:10px;background:rgba(0,168,107,0.15);color:var(--accent);padding:2px 7px;border-radius:4px;margin-top:6px;display:inline-block;">${p.variants.length} variants</div>` : ''}
        </div>`).join('') || `<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-muted);">No matching products.</div>`;
};

// ─── Variant Picker Modal ─────────────────────────────────────────────────────
window.addToCart = function(id) {
    const product = window._billProducts.find(p => p._id === id || String(p.id) === String(id));
    if (!product) return;

    // If product has variants, open picker modal
    if (product.hasVariants && product.variants && product.variants.length > 0) {
        openVariantPicker(product);
        return;
    }

    // Simple product — add directly
    const existing = cart.find(x => x.productId === id && !x.variantId);
    if (existing) { existing.quantity += 1; existing.total = existing.quantity * existing.price; }
    else { cart.push({ productId: id, name: product.name, price: product.price, quantity: 1, total: product.price, variantId: '', variantLabel: '' }); }
    updateCartUI();
};

function openVariantPicker(product) {
    const existingModal = document.getElementById('variantPickerModal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'variantPickerModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
        <div class="card" style="width:100%;max-width:440px;max-height:90vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="font-size:16px;">${product.name}</h3>
                <button onclick="document.getElementById('variantPickerModal').remove()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;"><i class="fas fa-times"></i></button>
            </div>
            <div style="font-size:13px;color:var(--text-muted);margin-bottom:14px;">Select a variant:</div>
            <div style="display:flex;flex-direction:column;gap:8px;" id="variantOptionsList">
                ${product.variants.filter(v => v.stock > 0).map(v => `
                    <button type="button" class="btn btn-outline" style="justify-content:space-between;padding:12px 14px;text-align:left;"
                        onclick="addVariantToCart('${product._id}','${product.name.replace(/'/g, "\\'")}',${ v.price || product.price },'${v._id}','${(v.label || Object.values(v.attributes||{}).join(' / ')).replace(/'/g, "\\'")}',${ v.stock }); document.getElementById('variantPickerModal').remove();">
                        <span style="font-weight:600;">${v.label || Object.values(v.attributes||{}).join(' / ')}</span>
                        <span style="color:var(--accent);font-weight:700;">${formatCurrency(v.price || product.price)} <span style="font-size:11px;color:var(--text-muted);font-weight:400;">(${v.stock} left)</span></span>
                    </button>`).join('')}
                ${product.variants.every(v => v.stock <= 0) ? `<div style="text-align:center;padding:20px;color:var(--text-muted);">All variants are out of stock</div>` : ''}
            </div>
        </div>`;
    document.body.appendChild(modal);
}

window.addVariantToCart = function(productId, name, price, variantId, variantLabel, stock) {
    const key = `${productId}_${variantId}`;
    const existing = cart.find(x => x.productId === productId && x.variantId === variantId);
    if (existing) {
        if (existing.quantity >= stock) { showToast('Insufficient stock for this variant', 'warning'); return; }
        existing.quantity += 1; existing.total = existing.quantity * existing.price;
    } else {
        cart.push({ productId, variantId, variantLabel, name, price, quantity: 1, total: price });
    }
    updateCartUI();
};

function updateCartUI() {
    const list = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');
    const countEl = document.getElementById('cartCount');
    if (!list) return;

    if (cart.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;font-size:14px;">Cart is empty</p>';
        if (totalEl) totalEl.textContent = formatCurrency(0);
        if (countEl) countEl.textContent = '0 items';
        const subtotalEl2 = document.getElementById('cartSubtotal');
        if (subtotalEl2) subtotalEl2.textContent = formatCurrency(0);
        const dr = document.getElementById('discountRow');
        if (dr) dr.style.display = 'none';
        const dlr = document.getElementById('deliveryRow');
        if (dlr) dlr.style.display = 'none';
        const adr = document.getElementById('amountDueRow');
        if (adr) adr.style.display = 'none';
        return;
    }

    list.innerHTML = cart.map((item, idx) => `
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border);">
            <div style="flex:1;">
                <div style="font-weight:600;font-size:14px;">${item.name}</div>
                ${item.variantLabel ? `<div style="font-size:11px;color:var(--accent);margin-top:2px;">↳ ${item.variantLabel}</div>` : ''}
                <div style="font-size:13px;color:var(--text-muted);margin-top:4px;display:flex;align-items:center;gap:8px;">
                    ${formatCurrency(item.price)} × 
                    <input type="number" value="${item.quantity}" min="1" onchange="updateQuantity(${idx},this.value)"
                        style="width:55px;height:28px;padding:4px;text-align:center;border:1px solid var(--border);border-radius:6px;background:rgba(255,255,255,0.05);color:white;">
                </div>
            </div>
            <div style="text-align:right;">
                <div style="font-weight:700;color:var(--accent);">${formatCurrency(item.total)}</div>
                <button onclick="removeFromCart(${idx})" style="background:none;border:none;color:#ef4444;cursor:pointer;font-size:12px;margin-top:4px;"><i class="fas fa-trash"></i></button>
            </div>
        </div>`).join('');

    const subtotal = cart.reduce((sum, x) => sum + x.total, 0);
    const discount = Math.max(0, parseFloat(document.getElementById('discountAmt')?.value) || 0);
    const deliveryCost = Math.max(0, parseFloat(document.getElementById('deliveryCost')?.value) || 0);
    const grandTotal = Math.max(0, subtotal - discount + deliveryCost);

    // Update subtotal line
    const subtotalEl = document.getElementById('cartSubtotal');
    if (subtotalEl) subtotalEl.textContent = formatCurrency(subtotal);

    // Discount row — show only when non-zero
    const discountRow = document.getElementById('discountRow');
    const discountValEl = document.getElementById('cartDiscountVal');
    if (discountRow) discountRow.style.display = discount > 0 ? 'flex' : 'none';
    if (discountValEl) discountValEl.textContent = `- ${formatCurrency(discount)}`;

    // Delivery row — show only when non-zero
    const deliveryRow = document.getElementById('deliveryRow');
    const deliveryValEl = document.getElementById('cartDeliveryVal');
    if (deliveryRow) deliveryRow.style.display = deliveryCost > 0 ? 'flex' : 'none';
    if (deliveryValEl) deliveryValEl.textContent = `+ ${formatCurrency(deliveryCost)}`;

    // Grand total
    totalEl.textContent = formatCurrency(grandTotal);
    countEl.textContent = `${cart.reduce((s, x) => s + x.quantity, 0)} items`;

    // Amount Due row — show only for COD
    const amountDueRow = document.getElementById('amountDueRow');
    const amountDueEl = document.getElementById('cartAmountDue');
    if (amountDueRow) {
        const isCOD = currentPaymentStatus === 'COD';
        amountDueRow.style.display = isCOD ? 'flex' : 'none';
        if (amountDueEl) amountDueEl.textContent = formatCurrency(isCOD ? grandTotal : 0);
    }
}

window.updateQuantity = function(idx, val) {
    const q = parseInt(val);
    if (isNaN(q) || q < 1) { showToast('Quantity must be at least 1', 'warning'); updateCartUI(); return; }
    cart[idx].quantity = q;
    cart[idx].total = cart[idx].quantity * cart[idx].price;
    updateCartUI();
};

window.removeFromCart = function(idx) {
    cart.splice(idx, 1);
    updateCartUI();
};

// ─── Billing: Payment Status Selector ────────────────────────────────────────
// PAID is the default. COD orders are UNPAID until the merchant marks them paid.
let currentPaymentStatus = 'PAID';

window.setPaymentStatus = function(status) {
    currentPaymentStatus = status;
    const paid = document.getElementById('ps-paid');
    const cod = document.getElementById('ps-cod');
    if (status === 'PAID') {
        if (paid) { paid.style.borderColor = '#a7f3d0'; paid.style.background = '#ecfdf5'; }
        if (cod) { cod.style.borderColor = 'var(--border)'; cod.style.background = 'var(--bg-card)'; }
    } else {
        if (paid) { paid.style.borderColor = 'var(--border)'; paid.style.background = 'var(--bg-card)'; }
        if (cod) { cod.style.borderColor = '#f59e0b'; cod.style.background = '#fffbeb'; }
    }
    // Refresh amount due row to reflect PAID vs COD
    updateCartUI();
};

window.togglePaymentStatus = function(status) {
    setPaymentStatus(status);
};

async function checkout() {
    if (cart.length === 0) { showToast('Cart is empty!', 'warning'); return; }
    const custName = document.getElementById('custName')?.value || 'Walking Customer';
    const custPhone = document.getElementById('custPhone')?.value || '';
    const discount = Math.max(0, parseFloat(document.getElementById('discountAmt')?.value) || 0);
    const deliveryCost = Math.max(0, parseFloat(document.getElementById('deliveryCost')?.value) || 0);
    const paymentMethod = 'Cash';
    const subtotal = cart.reduce((sum, x) => sum + x.total, 0);
    const grandTotal = Math.max(0, subtotal - discount + deliveryCost);
    const paymentStatus = currentPaymentStatus;

    const btn = document.querySelector('.cart-card .btn-primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; }

    try {
        const res = await axios.post(`${API_URL}/sales`, {
            items: cart, customerName: custName, customerPhone: custPhone,
            discount, paymentMethod, paymentStatus,
            delivery_cost: deliveryCost, deliveryFee: deliveryCost
        });
        const sale = res.data;
        const settingsRes = await axios.get(`${API_URL}/settings`);
        _settings = settingsRes.data;

        await generatePremiumJPG(sale, _settings, custName, custPhone);

        const shareModal = document.getElementById('shareModal');
        shareModal.style.display = 'flex';
        document.getElementById('modalWaNumber').value = custPhone;

        // WhatsApp message
        document.getElementById('btnShareWA').onclick = () => {
            const currency = _settings.currency || 'Rs.';
            const storeName = _settings.shopName || 'QuickBill POS';
            const itemsList = (sale.items || []).map(i =>
                `  • ${i.name} ×${i.quantity}  ${currency} ${(i.total||0).toLocaleString()}`
            ).join('\n');
            const discLine = discount > 0 ? `\n🏷️ Discount: -${currency} ${discount.toLocaleString()}` : '';
            const delivLine = deliveryCost > 0 ? `\n🚚 Delivery: +${currency} ${deliveryCost.toLocaleString()}` : '';
            const msg = [
                `🛍️ *${storeName}*`,
                `🧾 *Invoice ${sale.invoiceNumber}*`,
                ``,
                `👤 Customer: ${custName}`,
                custPhone ? `📞 Phone: ${custPhone}` : '',
                ``,
                `📦 *Items:*`,
                itemsList,
                discLine,
                delivLine,
                ``,
                `💳 Payment: ${paymentStatus === 'COD' ? 'Cash on Delivery (COD)' : 'PAID'}`,
                `💰 *Grand Total: ${currency} ${grandTotal.toLocaleString()}*`,
                paymentStatus === 'COD' ? `⏳ *Amount Due: ${currency} ${grandTotal.toLocaleString()}*` : `✅ *Amount Due: ${currency} 0*`,
                ``,
                `Thank you for your purchase! 🙏`
            ].filter(l => l !== '').join('\n');

            let phone = (document.getElementById('modalWaNumber').value || _settings.whatsappNumber || '').replace(/\D/g, '');
            if (phone.startsWith('0')) phone = '94' + phone.substring(1);
            else if (phone.length === 9) phone = '94' + phone;
            window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
        };

        document.getElementById('btnDownloadJPG').onclick = () => {
            const link = document.createElement('a');
            link.download = `Invoice_${sale.invoiceNumber}.jpg`;
            link.href = window.lastInvoiceDataUrl;
            link.click();
        };

        cart = [];
        updateCartUI();
    } catch (err) {
        if (err.response?.status !== 402) showToast(err.response?.data?.message || 'Checkout failed. Please try again.', 'error');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> COMPLETE SALE'; }
    }
}

// ─── Invoice JPG Generation ───────────────────────────────────────────────────
async function generatePremiumJPG(sale, settings, custName, custPhone) {
    const template = document.getElementById('invoice-template');
    const currency = settings.currency || 'Rs.';

    const logoEl = document.getElementById('inv-logo');
    const logoSrc = settings.logo || settings.shopLogo;
    if (settings.showLogoOnInvoice && logoSrc) {
        logoEl.src = logoSrc;
        logoEl.style.display = 'block';
    } else { logoEl.style.display = 'none'; }

    document.getElementById('inv-shop-name').innerText = settings.shopName || '';
    const addrEl = document.getElementById('inv-shop-address');
    if (settings.showAddressOnInvoice && settings.shopAddress) {
        addrEl.innerText = settings.shopAddress; addrEl.style.display = 'block';
    } else { addrEl.style.display = 'none'; }

    const contactEl = document.getElementById('inv-shop-contact');
    if (settings.showPhoneOnInvoice && settings.shopPhone) {
        contactEl.innerText = 'PH: ' + settings.shopPhone; contactEl.style.display = 'block';
    } else { contactEl.style.display = 'none'; }

    document.getElementById('inv-number').innerText = `#${sale.invoiceNumber}`;
    document.getElementById('inv-date').innerText = new Date(sale.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    document.getElementById('inv-cust-name').innerText = custName || sale.customerName || 'Walking Customer';
    document.getElementById('inv-cust-contact').innerText = custPhone || sale.customerPhone || 'N/A';

    // ─── Payment status badge ──────────────────────────────────────────────────
    const isPaid = String(sale.paymentStatus).toUpperCase() === 'PAID';
    const badge = document.getElementById('inv-payment-badge');
    const dot = document.getElementById('inv-payment-dot');
    const text = document.getElementById('inv-payment-text');
    const dueRow = document.getElementById('inv-amount-due-row');
    const dueEl = document.getElementById('inv-amount-due');

    if (isPaid) {
        badge.style.background = '#ecfdf5';
        badge.style.color = '#059669';
        badge.style.border = '1px solid #a7f3d0';
        dot.style.color = '#059669';
        dot.className = 'fas fa-check-circle';
        text.textContent = 'PAID';
        if (dueRow) dueRow.style.display = 'none';
    } else {
        badge.style.background = '#fffbeb';
        badge.style.color = '#b45309';
        badge.style.border = '1px solid #fde68a';
        dot.style.color = '#f59e0b';
        dot.className = 'fas fa-circle-dot';
        text.textContent = 'COD';
        if (dueRow) {
            dueRow.style.display = 'flex';
            if (dueEl) dueEl.textContent = `${currency} ${sale.totalAmount.toLocaleString()}`;
        }
    }

    // ─── Items ─────────────────────────────────────────────────────────────────
    const itemsBody = document.getElementById('inv-items');
    itemsBody.innerHTML = sale.items.map(i => `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:12px 0;">
                <div style="font-weight:600;color:#334155;font-size:13px;">${i.name}</div>
                ${i.variantLabel ? `<div style="font-size:11px;color:#64748b;margin-top:2px;max-width:250px;white-space:normal;word-break:break-word;line-height:1.4;">↳ ${i.variantLabel}</div>` : ''}
            </td>
            <td style="padding:12px 0;text-align:center;color:#64748b;">${i.quantity}</td>
            <td style="padding:12px 0;text-align:right;color:#64748b;">${currency} ${i.price.toLocaleString()}</td>
            <td style="padding:12px 0;text-align:right;font-weight:700;color:#0f172a;">${currency} ${i.total.toLocaleString()}</td>
        </tr>`).join('');

    // ─── Totals: subtotal, discount, delivery, grand total ─────────────────────
    // Calculate subtotal from items
    const itemsSubtotal = sale.items.reduce((s, i) => s + (i.total || 0), 0);
    const saleDiscount = parseFloat(sale.discount) || 0;
    const saleDelivery = parseFloat(sale.delivery_cost ?? sale.deliveryFee) || 0;

    document.getElementById('inv-subtotal').innerText = `${currency} ${itemsSubtotal.toLocaleString()}`;

    // Discount row
    const invDiscountRow = document.getElementById('inv-discount-row');
    const invDiscountEl = document.getElementById('inv-discount');
    if (invDiscountRow) {
        if (saleDiscount > 0) {
            invDiscountRow.style.display = 'flex';
            if (invDiscountEl) invDiscountEl.textContent = `- ${currency} ${saleDiscount.toLocaleString()}`;
        } else {
            invDiscountRow.style.display = 'none';
        }
    }

    // Delivery row
    const invDeliveryRow = document.getElementById('inv-delivery-row');
    const invDeliveryEl = document.getElementById('inv-delivery');
    if (invDeliveryRow) {
        if (saleDelivery > 0) {
            invDeliveryRow.style.display = 'flex';
            if (invDeliveryEl) invDeliveryEl.textContent = `${currency} ${saleDelivery.toLocaleString()}`;
        } else {
            invDeliveryRow.style.display = 'none';
        }
    }

    document.getElementById('inv-total').innerText = `${currency} ${sale.totalAmount.toLocaleString()}`;
    document.getElementById('inv-footer-msg').innerText = settings.invoiceFooter || 'Thank you for shopping with us!';

    const canvas = await html2canvas(template, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
    window.lastInvoiceDataUrl = canvas.toDataURL('image/jpeg', 0.95);
}

window.downloadSaleInvoiceJPG = async function(saleId) {
    try {
        const [saleRes, settingsRes] = await Promise.all([
            axios.get(`${API_URL}/sales/${saleId}`),
            axios.get(`${API_URL}/settings`)
        ]);
        await generatePremiumJPG(saleRes.data, settingsRes.data, saleRes.data.customerName, saleRes.data.customerPhone);
        const link = document.createElement('a');
        link.download = `Invoice_${saleRes.data.invoiceNumber}.jpg`;
        link.href = window.lastInvoiceDataUrl;
        link.click();
    } catch (err) {
        showToast('Invoice download failed: ' + err.message, 'error');
    }
};

// ─── 4. REPORTS ───────────────────────────────────────────────────────────────
async function renderReports() {
    showLoading('Reports');
    try {
        const today = new Date().toISOString().split('T')[0];
        const [summaryRes, allSalesRes] = await Promise.all([
            axios.get(`${API_URL}/reports/summary`),
            axios.get(`${API_URL}/reports/all?from=${today}&to=${today}`)
        ]);
        const summary = summaryRes.data;
        const sales = allSalesRes.data;
        buildReportsView(summary, sales, today, today);
    } catch (err) {
        if (err.response?.status !== 402) {
            viewContainer.innerHTML = `<div class="card"><i class="fas fa-exclamation-circle" style="color:#ef4444;margin-right:8px;"></i>Error loading reports. <button class="btn btn-outline" onclick="renderReports()" style="margin-left:12px;">Retry</button></div>`;
        }
    }
}

function buildReportsView(summary, sales, fromDate, toDate) {
    const totalForPeriod = sales.reduce((s, x) => s + x.totalAmount, 0);
    viewContainer.innerHTML = `
    <div class="fade-in">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
            <h2>Sales Reports</h2>
            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                <button class="btn btn-outline" onclick="exportCSV()"><i class="fas fa-file-csv"></i> Export CSV</button>
            </div>
        </div>

        <div class="card" style="margin-bottom:24px;display:flex;gap:16px;align-items:flex-end;flex-wrap:wrap;padding:16px;">
            <div class="form-group" style="margin:0;flex:1;min-width:140px;">
                <label>From Date</label>
                <input type="date" id="reportFrom" value="${fromDate}">
            </div>
            <div class="form-group" style="margin:0;flex:1;min-width:140px;">
                <label>To Date</label>
                <input type="date" id="reportTo" value="${toDate}">
            </div>
            <button class="btn btn-primary" onclick="loadReportRange()"><i class="fas fa-search"></i> Filter</button>
            <button class="btn btn-outline" onclick="loadReportRange('all')"><i class="fas fa-history"></i> All Time</button>
        </div>

        <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(200px,1fr));margin-bottom:24px;">
            <div class="card stat-card">
                <h3>Period Revenue</h3>
                <div class="value" style="font-size:24px;">${formatCurrency(totalForPeriod)}</div>
                <div style="color:var(--text-muted);font-size:13px;margin-top:8px;">${sales.length} invoice${sales.length !== 1?'s':''}</div>
            </div>
            <div class="card stat-card">
                <h3>All-Time Revenue</h3>
                <div class="value" style="font-size:24px;">${formatCurrency(summary.totalSales)}</div>
            </div>
            <div class="card stat-card">
                <h3>Total Profit</h3>
                <div class="value" style="font-size:24px;color:#3b82f6;">${formatCurrency(summary.totalProfit)}</div>
                <div style="color:var(--text-muted);font-size:12px;margin-top:8px;">Based on cost prices</div>
            </div>
            <div class="card stat-card">
                <h3>Low Stock Items</h3>
                <div class="value" style="font-size:24px;color:${summary.lowStockCount > 0 ? '#ef4444' : 'var(--accent)'};">${summary.lowStockCount}</div>
            </div>
        </div>

        <div class="card" style="padding:0;overflow:hidden;">
            <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
                <h3 style="margin:0;">Sales History</h3>
                <input type="text" id="salesSearch" placeholder="Search invoice or customer..." style="width:260px;" oninput="filterSalesTable()">
            </div>
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;" id="salesTable">
                    <thead>
                        <tr style="background:rgba(255,255,255,0.02);border-bottom:1px solid var(--border);">
                            <th style="padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:var(--text-muted);font-weight:600;">Invoice</th>
                            <th style="padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:var(--text-muted);font-weight:600;">Customer</th>
                            <th style="padding:12px 16px;text-align:right;font-size:12px;text-transform:uppercase;color:var(--text-muted);font-weight:600;">Amount</th>
                            <th style="padding:12px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:var(--text-muted);font-weight:600;">Date</th>
                            <th style="padding:12px 16px;text-align:center;font-size:12px;text-transform:uppercase;color:var(--text-muted);font-weight:600;">Actions</th>
                        </tr>
                    </thead>
                    <tbody id="salesTableBody">
                        ${renderSalesRows(sales)}
                    </tbody>
                </table>
            </div>
            ${sales.length === 0 ? '<div style="text-align:center;padding:40px;color:var(--text-muted);"><i class="fas fa-receipt" style="font-size:36px;opacity:0.3;display:block;margin-bottom:12px;"></i>No sales in this period.</div>' : ''}
        </div>
    </div>`;

    window._reportSales = sales;
}

function renderSalesRows(sales) {
    return sales.map(s => `
        <tr style="border-bottom:1px solid var(--border);">
            <td style="padding:12px 16px;">
                <span onclick="showSaleDetails('${s._id}')" style="color:var(--accent);cursor:pointer;font-weight:700;">${s.invoiceNumber}</span>
            </td>
            <td style="padding:12px 16px;font-size:14px;">${s.customerName || 'Walking Customer'}</td>
            <td style="padding:12px 16px;text-align:right;font-weight:600;">${formatCurrency(s.totalAmount)}</td>
            <td style="padding:12px 16px;font-size:13px;color:var(--text-muted);">${new Date(s.date).toLocaleString()}</td>
            <td style="padding:12px 16px;text-align:center;">
                <button class="btn btn-outline" style="padding:5px 10px;font-size:12px;" onclick="downloadSaleInvoiceJPG('${s._id}')">
                    <i class="fas fa-download"></i> JPG
                </button>
            </td>
        </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted);">No sales found.</td></tr>';
}

window.filterSalesTable = function() {
    const q = document.getElementById('salesSearch')?.value?.toLowerCase() || '';
    const filtered = (window._reportSales || []).filter(s =>
        (s.invoiceNumber||'').toLowerCase().includes(q) || (s.customerName||'').toLowerCase().includes(q)
    );
    document.getElementById('salesTableBody').innerHTML = renderSalesRows(filtered);
};

// ─── Payment Status Badge Helper ─────────────────────────────────────────────
function paymentBadgeHTML(status) {
    const isPaid = String(status).toUpperCase() === 'PAID';
    if (isPaid) {
        return `<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;background:#ecfdf5;color:#059669;font-weight:700;font-size:12px;border:1px solid #a7f3d0;"><i class="fas fa-circle" style="font-size:7px;"></i> PAID</span>`;
    }
    return `<span style="display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:999px;background:#fffbeb;color:#b45309;font-weight:700;font-size:12px;border:1px solid #fde68a;"><i class="fas fa-circle" style="font-size:7px;"></i> UNPAID (COD)</span>`;
}

// Mark a COD sale as paid — confirmation dialog → server update → success toast
window.markSalePaid = function(saleId, invoiceNumber, customerName, totalAmount) {
    const currency = _settings.currency || 'Rs.';
    const message = `
            <div style="margin-bottom:14px;">Mark this COD order as paid?</div>
            <div style="background:rgba(255,255,255,0.04);border-radius:8px;padding:12px;text-align:left;">
                <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                    <span style="color:var(--text-muted);font-size:13px;">Order Number</span>
                    <span style="font-weight:700;">#${invoiceNumber}</span>
                </div>
                <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                    <span style="color:var(--text-muted);font-size:13px;">Customer</span>
                    <span style="font-weight:700;">${customerName}</span>
                </div>
                <div style="display:flex;justify-content:space-between;">
                    <span style="color:var(--text-muted);font-size:13px;">Total Amount</span>
                    <span style="font-weight:700;color:#f59e0b;">${currency} ${Number(totalAmount).toLocaleString()}</span>
                </div>
            </div>`;
    showConfirm(message, async () => {
        try {
            await axios.patch(`${API_URL}/sales/${saleId}/mark-paid`);
            showToast('Payment marked as paid');
            // Re-open the modal to reflect the new status
            showSaleDetails(saleId);
        } catch (err) {
            showToast(err.response?.data?.message || 'Failed to mark as paid', 'error');
        }
    }, 'Mark as Paid');
};

window.loadReportRange = async function(mode) {
    const from = mode === 'all' ? '' : (document.getElementById('reportFrom')?.value || '');
    const to = mode === 'all' ? '' : (document.getElementById('reportTo')?.value || '');
    const params = mode === 'all' ? '' : `?from=${from}&to=${to}`;
    try {
        const [summaryRes, salesRes] = await Promise.all([
            axios.get(`${API_URL}/reports/summary`),
            axios.get(`${API_URL}/reports/all${params}`)
        ]);
        buildReportsView(summaryRes.data, salesRes.data, from, to);
    } catch (err) {
        showToast('Failed to load report data', 'error');
    }
};

window.exportCSV = function() {
    const sales = window._reportSales || [];
    if (!sales.length) { showToast('No data to export', 'warning'); return; }
    const currency = _settings.currency || 'Rs.';
    const rows = [['Invoice', 'Customer', 'Phone', 'Items', 'Amount', 'Date']];
    sales.forEach(s => rows.push([s.invoiceNumber, s.customerName || 'Walking Customer', s.customerPhone || '', (s.items||[]).length, `${currency} ${s.totalAmount}`, new Date(s.date).toLocaleString()]));
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = `QuickBill_Sales_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showToast('CSV exported!');
};

window.showSaleDetails = async function(saleId) {
    const modal = document.getElementById('saleDetailsModal');
    document.getElementById('sdm-body').innerHTML = '<p style="text-align:center;padding:30px;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i> Loading...</p>';
    modal.style.display = 'flex';

    try {
        const res = await axios.get(`${API_URL}/sales/${saleId}`);
        const s = res.data;
        const currency = _settings.currency || 'Rs.';
        const isPaid = String(s.paymentStatus).toUpperCase() === 'PAID';
        const saleDiscount = parseFloat(s.discount) || 0;
        const saleDelivery = parseFloat(s.delivery_cost ?? s.deliveryFee) || 0;
        const itemsSubtotal = s.items.reduce((sum, i) => sum + (i.total || 0), 0);

        const itemsHtml = s.items.map(i => `
            <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:10px 0;">${i.name}${i.variantLabel ? `<div style="font-size:11px;color:var(--accent);">↳ ${i.variantLabel}</div>` : ''}</td>
                <td style="padding:10px 0;text-align:center;">${i.quantity}</td>
                <td style="padding:10px 0;text-align:right;">${currency} ${i.price.toLocaleString()}</td>
                <td style="padding:10px 0;text-align:right;font-weight:700;color:var(--accent);">${currency} ${i.total.toLocaleString()}</td>
            </tr>`).join('');

        const totalsHtml = `
            <div style="border-top:1px solid var(--border);padding-top:10px;margin-top:4px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:13px;">
                    <span style="color:var(--text-muted);">Subtotal</span>
                    <span>${currency} ${itemsSubtotal.toLocaleString()}</span>
                </div>
                ${saleDiscount > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:13px;">
                    <span style="color:#ef4444;">Discount</span>
                    <span style="color:#ef4444;">- ${currency} ${saleDiscount.toLocaleString()}</span>
                </div>` : ''}
                ${saleDelivery > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:13px;">
                    <span style="color:#3b82f6;"><i class="fas fa-truck" style="font-size:10px;margin-right:3px;"></i>Delivery</span>
                    <span style="color:#3b82f6;">+ ${currency} ${saleDelivery.toLocaleString()}</span>
                </div>` : ''}
                <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid var(--border);font-size:16px;font-weight:800;">
                    <span>Grand Total</span>
                    <span style="color:var(--accent);">${currency} ${s.totalAmount.toLocaleString()}</span>
                </div>
                ${!isPaid ? `<div style="display:flex;justify-content:space-between;padding-top:6px;border-top:1px dashed var(--border);margin-top:6px;font-size:14px;font-weight:700;">
                    <span style="color:#f59e0b;"><i class="fas fa-clock" style="font-size:10px;margin-right:3px;"></i>Amount Due (COD)</span>
                    <span style="color:#f59e0b;">${currency} ${s.totalAmount.toLocaleString()}</span>
                </div>` : `<div style="display:flex;justify-content:space-between;padding-top:6px;border-top:1px dashed var(--border);margin-top:6px;font-size:13px;">
                    <span style="color:#059669;"><i class="fas fa-check-circle" style="font-size:10px;margin-right:3px;"></i>Amount Due</span>
                    <span style="color:#059669;">Rs. 0.00</span>
                </div>`}
            </div>`;

        document.getElementById('sdm-body').innerHTML = `
            <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h3 style="color:var(--accent);margin:0;">#${s.invoiceNumber}</h3>
                    <span style="font-size:13px;color:var(--text-muted);">${new Date(s.date).toLocaleString()}</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;background:rgba(255,255,255,0.03);border-radius:10px;padding:14px;margin-bottom:18px;">
                    <div><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.05em;margin-bottom:4px;">Customer</div><div style="font-weight:700;">${s.customerName || 'Walking Customer'}</div></div>
                    <div><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.05em;margin-bottom:4px;">Contact</div><div style="font-weight:600;">${s.customerPhone || 'N/A'}</div></div>
                    <div><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.05em;margin-bottom:4px;">Order Status</div><div style="font-weight:600;text-transform:capitalize;">${(s.orderStatus || 'DELIVERED').toLowerCase()}</div></div>
                    <div>
                        <div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.05em;margin-bottom:4px;">Payment Status</div>
                        ${paymentBadgeHTML(s.paymentStatus)}
                    </div>
                </div>

                <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
                    <thead><tr style="border-bottom:2px solid var(--border);">
                        <th style="padding:8px 0;text-align:left;font-size:12px;color:var(--text-muted);">Item</th>
                        <th style="padding:8px 0;text-align:center;font-size:12px;color:var(--text-muted);">Qty</th>
                        <th style="padding:8px 0;text-align:right;font-size:12px;color:var(--text-muted);">Price</th>
                        <th style="padding:8px 0;text-align:right;font-size:12px;color:var(--text-muted);">Total</th>
                    </tr></thead>
                    <tbody>${itemsHtml}</tbody>
                </table>

                <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:14px;margin-bottom:16px;">
                    ${totalsHtml}
                </div>

                <div style="display:flex;gap:10px;flex-wrap:wrap;">
                    <button class="btn btn-outline" style="flex:1;justify-content:center;" onclick="downloadSaleInvoiceJPG('${s._id}');document.getElementById('saleDetailsModal').style.display='none';">
                        <i class="fas fa-download"></i> Download JPG
                    </button>
                    ${!isPaid ? `
                    <button class="btn btn-primary" style="flex:1;justify-content:center;background:#059669;border-color:#059669;" onclick="markSalePaid('${s._id}','${s.invoiceNumber}','${(s.customerName||'Walking Customer').replace(/'/g,"\\'")}',${s.totalAmount})">
                        <i class="fas fa-check-circle"></i> Mark as Paid
                    </button>` : ''}
                    <button class="btn btn-outline" style="flex:1;justify-content:center;border:none;color:var(--text-muted);" onclick="document.getElementById('saleDetailsModal').style.display='none';">Close</button>
                </div>
            </div>`;
    } catch (err) {
        document.getElementById('sdm-body').innerHTML = `<p style="color:#ef4444;text-align:center;">Failed to load: ${err.message}</p>`;
    }
};

// ─── 5. SETTINGS ──────────────────────────────────────────────────────────────
async function renderSettings() {
    showLoading('Settings');
    try {
        const res = await axios.get(`${API_URL}/settings`);
        const s = res.data;
        const toggleHtml = (id, label, checked) => `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding:10px;background:rgba(255,255,255,0.02);border-radius:8px;">
                <label for="${id}" style="margin:0;cursor:pointer;font-weight:500;">${label}</label>
                <label class="switch"><input type="checkbox" id="${id}" ${checked?'checked':''}><span class="slider round"></span></label>
            </div>`;

        viewContainer.innerHTML = `
        <div class="fade-in">
            <h2 style="margin-bottom:24px;">Settings</h2>
            <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:start;">

                <div class="card">
                    <h3 style="margin-bottom:20px;color:var(--accent);"><i class="fas fa-store"></i> Shop Information</h3>
                    <div class="form-group"><label>Shop Name</label><input type="text" id="s_shopName" value="${s.shopName||''}"></div>
                    <div class="form-group" style="display:flex;gap:10px;align-items:flex-end;">
                        <div style="flex:1;"><label>Shop Logo</label><input type="file" id="s_shopLogoFile" accept="image/*" style="padding:9px 12px;"></div>
                        ${s.logo||s.shopLogo ? `<img src="${s.logo||s.shopLogo}" style="height:44px;width:44px;object-fit:cover;border-radius:8px;border:1px solid var(--border);">` : ''}
                    </div>
                    <input type="hidden" id="s_shopLogo" value="${s.logo||s.shopLogo||''}">
                    <div class="form-group"><label>Shop Phone</label><input type="text" id="s_shopPhone" value="${s.shopPhone||''}"></div>
                    <div class="form-group"><label>WhatsApp Number</label><input type="text" id="s_whatsappNumber" value="${s.whatsappNumber||''}"></div>
                    <div class="form-group"><label>Shop Address</label><textarea id="s_shopAddress" rows="2">${s.shopAddress||''}</textarea></div>
                    <div class="form-group"><label>Email Address</label><input type="email" id="s_shopEmail" value="${s.shopEmail||''}"></div>
                    <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="saveSettings()"><i class="fas fa-save"></i> Save Settings</button>
                </div>

                <div class="card">
                    <h3 style="margin-bottom:20px;color:var(--accent);"><i class="fas fa-globe"></i> Online Shop & Style</h3>
                    ${toggleHtml('s_enableOnlineShop','Enable Online Shop', s.enableOnlineShop !== false)}
                    ${toggleHtml('s_showProductImages','Show Product Images', s.showProductImages !== false)}
                    ${toggleHtml('s_showOutOfStock','Show Out-of-Stock Products', s.showOutOfStock === true)}
                    ${toggleHtml('s_showWhatsappOrderBtn','Show WhatsApp Order Button', s.showWhatsappOrderBtn !== false)}
                    
                    <hr style="border:none;border-top:1px solid var(--border);margin:16px 0;">
                    
                    <div class="form-group">
                        <label>Shop Theme Style</label>
                        <select id="s_shopStyle">
                            <option value="General" ${s.shopStyle==='General'?'selected':''}>📦 General Store</option>
                            <option value="Grocery" ${s.shopStyle==='Grocery'?'selected':''}>🛒 Grocery Market</option>
                            <option value="Fashion" ${s.shopStyle==='Fashion'?'selected':''}>👗 Fashion Boutique</option>
                            <option value="Electronics" ${s.shopStyle==='Electronics'?'selected':''}>📱 Tech & Electronics</option>
                            <option value="Beauty" ${s.shopStyle==='Beauty'?'selected':''}>💄 Beauty & Cosmetics</option>
                        </select>
                    </div>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:16px;">
                        <div><label style="font-size:12px;margin-bottom:6px;display:block;">Primary Color</label><input type="color" id="s_themeColor" value="${s.themeColor||'#00a86b'}" style="height:44px;width:100%;border-radius:8px;padding:4px;cursor:pointer;background:rgba(255,255,255,0.05);border:1px solid var(--border);"></div>
                        <div><label style="font-size:12px;margin-bottom:6px;display:block;">Secondary Color</label><input type="color" id="s_secondaryColor" value="${s.secondaryColor||'#0f172a'}" style="height:44px;width:100%;border-radius:8px;padding:4px;cursor:pointer;background:rgba(255,255,255,0.05);border:1px solid var(--border);"></div>
                    </div>

                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;margin-bottom:16px;">
                        <div class="form-group">
                            <label>Button Style</label>
                            <select id="s_buttonStyle">
                                <option value="Rounded" ${s.buttonStyle==='Rounded'?'selected':''}>Rounded</option>
                                <option value="Pill" ${s.buttonStyle==='Pill'?'selected':''}>Pill (Capsule)</option>
                                <option value="Sharp" ${s.buttonStyle==='Sharp'?'selected':''}>Sharp (Square)</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Product Card Style</label>
                            <select id="s_productCardStyle">
                                <option value="Elevated" ${s.productCardStyle==='Elevated'?'selected':''}>Elevated (Shadow)</option>
                                <option value="Flat" ${s.productCardStyle==='Flat'?'selected':''}>Flat</option>
                                <option value="Bordered" ${s.productCardStyle==='Bordered'?'selected':''}>Bordered</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group">
                        <label>Font Theme</label>
                        <select id="s_fontTheme">
                            <option value="Inter" ${s.fontTheme==='Inter'?'selected':''}>Inter (Clean, Default)</option>
                            <option value="Roboto" ${s.fontTheme==='Roboto'?'selected':''}>Roboto (Modern)</option>
                            <option value="Poppins" ${s.fontTheme==='Poppins'?'selected':''}>Poppins (Geometric, Fashion)</option>
                            <option value="Outfit" ${s.fontTheme==='Outfit'?'selected':''}>Outfit (Tech, Bold)</option>
                        </select>
                    </div>

                    <hr style="border:none;border-top:1px solid var(--border);margin:16px 0;">

                    <div class="form-group"><label>Banner Message</label><input type="text" id="s_bannerMessage" value="${s.bannerMessage||''}"></div>
                    <div class="form-group"><label>About Text</label><textarea id="s_aboutText" rows="3">${s.aboutText||''}</textarea></div>
                    <div class="form-group"><label>Facebook URL</label><input type="url" id="s_facebookUrl" value="${s.facebookUrl||''}"></div>
                    <div class="form-group"><label>Instagram URL</label><input type="url" id="s_instagramUrl" value="${s.instagramUrl||''}"></div>
                    <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="saveSettings()"><i class="fas fa-save"></i> Save Settings</button>
                </div>

                <div class="card">
                    <h3 style="margin-bottom:20px;color:var(--accent);"><i class="fas fa-file-invoice"></i> Invoice Settings</h3>
                    <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
                        <div class="form-group"><label>Invoice Prefix</label><input type="text" id="s_invoicePrefix" value="${s.invoicePrefix||'QB-'}"></div>
                        <div class="form-group"><label>Currency Symbol</label>
                            <select id="s_currency">
                                <option value="Rs." ${s.currency==='Rs.'?'selected':''}>Rs. (LKR)</option>
                                <option value="$" ${s.currency==='$'?'selected':''}>$ (USD)</option>
                                <option value="€" ${s.currency==='€'?'selected':''}>€ (EUR)</option>
                                <option value="£" ${s.currency==='£'?'selected':''}>£ (GBP)</option>
                                <option value="₹" ${s.currency==='₹'?'selected':''}>₹ (INR)</option>
                            </select>
                        </div>
                    </div>
                    ${toggleHtml('s_showLogoOnInvoice','Show Logo on Invoice', s.showLogoOnInvoice !== false)}
                    ${toggleHtml('s_showAddressOnInvoice','Show Address on Invoice', s.showAddressOnInvoice !== false)}
                    ${toggleHtml('s_showPhoneOnInvoice','Show Phone on Invoice', s.showPhoneOnInvoice !== false)}
                    <button class="btn btn-primary" style="width:100%;justify-content:center;margin-top:10px;" onclick="saveSettings()"><i class="fas fa-save"></i> Save Settings</button>
                </div>

                <div class="card">
                    <h3 style="margin-bottom:20px;color:var(--accent);"><i class="fas fa-university"></i> Bank Details</h3>
                    <div class="form-group"><label>Bank Name</label><input type="text" id="s_bankName" value="${s.bankName||''}"></div>
                    <div class="form-group"><label>Account Name</label><input type="text" id="s_accountName" value="${s.accountName||''}"></div>
                    <div class="form-group"><label>Account Number</label><input type="text" id="s_accountNumber" value="${s.accountNumber||''}"></div>
                    <div class="form-group"><label>Branch</label><input type="text" id="s_bankBranch" value="${s.bankBranch||''}"></div>
                    <div class="form-group"><label>Additional Note</label><textarea id="s_bankNote" rows="2">${s.bankNote||''}</textarea></div>
                    <button class="btn btn-primary" style="width:100%;justify-content:center;" onclick="saveSettings()"><i class="fas fa-save"></i> Save Settings</button>
                </div>

                <div class="card">
                    <h3 style="margin-bottom:20px;color:var(--accent);"><i class="fas fa-server"></i> System</h3>
                    <div style="display:flex;flex-direction:column;gap:10px;">
                        <div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:12px;">
                            <div style="font-size:13px;color:var(--text-muted);margin-bottom:4px;">Shop URL</div>
                            <a href="/shop/${_business.slug||''}" target="_blank" style="color:var(--accent);font-size:14px;word-break:break-all;">/shop/${_business.slug||''}</a>
                        </div>
                        <button class="btn btn-outline" style="justify-content:center;" onclick="downloadDatabaseBackup()"><i class="fas fa-download"></i> Backup Data</button>
                        <label class="btn btn-outline" style="justify-content:center;cursor:pointer;">
                            <i class="fas fa-upload"></i> Restore Data
                            <input type="file" style="display:none;" accept=".json" onchange="restoreDatabase(this)">
                        </label>
                        <button class="btn btn-outline" style="justify-content:center;color:var(--accent);border-color:var(--accent);" onclick="seedSriLankaProducts()"><i class="fas fa-flag"></i> 🇱🇰 Load Demo Products</button>
                        <button class="btn btn-outline" style="justify-content:center;color:#ef4444;border-color:#ef4444;" onclick="resetPosSystem()"><i class="fas fa-power-off"></i> Reset POS System</button>
                    </div>
                </div>
            </div>
        </div>`;
    } catch (err) {
        if (err.response?.status !== 402) viewContainer.innerHTML = `<div class="card">Error loading settings: ${err.message}</div>`;
    }
}

window.saveSettings = async function() {
    const btn = event.currentTarget;
    const orig = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    btn.disabled = true;

    try {
        let logoUrl = document.getElementById('s_shopLogo')?.value || '';
        const fileInput = document.getElementById('s_shopLogoFile');
        if (fileInput?.files[0]) {
            const fd = new FormData();
            fd.append('image', fileInput.files[0]);
            const uploadRes = await axios.post(`${API_URL}/upload-asset`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            logoUrl = uploadRes.data.url;
        }

        const data = {
            shopName: document.getElementById('s_shopName')?.value || '',
            shopLogo: logoUrl, logo: logoUrl,
            shopPhone: document.getElementById('s_shopPhone')?.value || '',
            whatsappNumber: document.getElementById('s_whatsappNumber')?.value || '',
            shopAddress: document.getElementById('s_shopAddress')?.value || '',
            shopEmail: document.getElementById('s_shopEmail')?.value || '',
            enableOnlineShop: document.getElementById('s_enableOnlineShop')?.checked ?? true,
            showProductImages: document.getElementById('s_showProductImages')?.checked ?? true,
            showOutOfStock: document.getElementById('s_showOutOfStock')?.checked ?? false,
            showWhatsappOrderBtn: document.getElementById('s_showWhatsappOrderBtn')?.checked ?? true,
            themeColor: document.getElementById('s_themeColor')?.value || '#00a86b',
            secondaryColor: document.getElementById('s_secondaryColor')?.value || '#0f172a',
            shopStyle: document.getElementById('s_shopStyle')?.value || 'General',
            buttonStyle: document.getElementById('s_buttonStyle')?.value || 'Rounded',
            productCardStyle: document.getElementById('s_productCardStyle')?.value || 'Elevated',
            fontTheme: document.getElementById('s_fontTheme')?.value || 'Inter',
            bannerMessage: document.getElementById('s_bannerMessage')?.value || '',
            aboutText: document.getElementById('s_aboutText')?.value || '',
            facebookUrl: document.getElementById('s_facebookUrl')?.value || '',
            instagramUrl: document.getElementById('s_instagramUrl')?.value || '',
            invoicePrefix: document.getElementById('s_invoicePrefix')?.value?.trim() || 'QB-',
            currency: document.getElementById('s_currency')?.value || 'Rs.',
            showLogoOnInvoice: document.getElementById('s_showLogoOnInvoice')?.checked ?? true,
            showAddressOnInvoice: document.getElementById('s_showAddressOnInvoice')?.checked ?? true,
            showPhoneOnInvoice: document.getElementById('s_showPhoneOnInvoice')?.checked ?? true,
            bankName: document.getElementById('s_bankName')?.value || '',
            accountName: document.getElementById('s_accountName')?.value || '',
            accountNumber: document.getElementById('s_accountNumber')?.value || '',
            bankBranch: document.getElementById('s_bankBranch')?.value || '',
            bankNote: document.getElementById('s_bankNote')?.value || '',
        };

        await axios.post(`${API_URL}/settings`, data);
        _settings = { ..._settings, ...data };
        await syncBranding();
        showToast('Settings saved successfully!');
    } catch (err) {
        showToast(err.response?.data?.message || 'Failed to save settings', 'error');
    } finally {
        btn.innerHTML = orig;
        btn.disabled = false;
    }
};

// ─── 6. ONLINE ORDERS ────────────────────────────────────────────────────────
async function renderOnlineOrders() {
    showLoading('Online Orders');
    try {
        const res = await axios.get(`${API_URL}/online-orders`);
        const orders = res.data;
        const getStatusColor = s => s==='delivered'?'#22c55e':s==='confirmed'?'#3b82f6':'#f59e0b';

        viewContainer.innerHTML = `
        <div class="fade-in">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:24px;flex-wrap:wrap;gap:12px;">
                <h2>Online Orders</h2>
                <button class="btn btn-outline" onclick="renderOnlineOrders()"><i class="fas fa-sync"></i> Refresh</button>
            </div>
            <div class="card" style="padding:0;overflow:hidden;">
                <div style="overflow-x:auto;">
                    <table style="width:100%;border-collapse:collapse;">
                        <thead>
                            <tr style="background:rgba(255,255,255,0.02);border-bottom:1px solid var(--border);">
                                <th style="padding:14px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:var(--text-muted);">Order ID</th>
                                <th style="padding:14px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:var(--text-muted);">Customer</th>
                                <th style="padding:14px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:var(--text-muted);">Payment</th>
                                <th style="padding:14px 16px;text-align:right;font-size:12px;text-transform:uppercase;color:var(--text-muted);">Total</th>
                                <th style="padding:14px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:var(--text-muted);">Status</th>
                                <th style="padding:14px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:var(--text-muted);">Slip</th>
                                <th style="padding:14px 16px;text-align:left;font-size:12px;text-transform:uppercase;color:var(--text-muted);">Date</th>
                                <th style="padding:14px 16px;text-align:center;font-size:12px;text-transform:uppercase;color:var(--text-muted);">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${orders.length ? orders.map(o => `
                                <tr style="border-bottom:1px solid var(--border);">
                                    <td style="padding:14px 16px;font-weight:700;color:var(--accent);font-size:13px;">${o.onlineOrderId}</td>
                                    <td style="padding:14px 16px;">
                                        <div style="font-weight:600;font-size:14px;">${o.customerName}</div>
                                        <div style="font-size:12px;color:var(--text-muted);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${o.deliveryAddress}">${o.deliveryAddress}</div>
                                    </td>
                                    <td style="padding:14px 16px;font-size:13px;">${o.paymentMethod}</td>
                                    <td style="padding:14px 16px;text-align:right;font-weight:700;">${formatCurrency(o.totalAmount)}</td>
                                    <td style="padding:14px 16px;">
                                        <select onchange="updateOrderStatus('${o._id}',this.value)"
                                            style="padding:5px 10px;border-radius:6px;border:1px solid ${getStatusColor(o.status)};color:${getStatusColor(o.status)};background:transparent;font-weight:600;cursor:pointer;font-size:13px;">
                                            <option value="pending" ${o.status==='pending'?'selected':''}>Pending</option>
                                            <option value="confirmed" ${o.status==='confirmed'?'selected':''}>Confirmed</option>
                                            <option value="delivered" ${o.status==='delivered'?'selected':''}>Delivered</option>
                                        </select>
                                    </td>
                                    <td style="padding:14px 16px;">
                                        ${o.paymentSlip ? `<a href="${o.paymentSlip}" target="_blank"><img src="${getThumbnailUrl(o.paymentSlip,50)}" style="width:38px;height:38px;border-radius:4px;object-fit:cover;border:1px solid var(--border);"></a>` : '<span style="color:var(--text-muted);font-size:12px;">—</span>'}
                                    </td>
                                    <td style="padding:14px 16px;font-size:12px;color:var(--text-muted);">${new Date(o.date).toLocaleDateString()}</td>
                                    <td style="padding:14px 16px;text-align:center;">
                                        <button class="btn btn-outline" style="padding:5px 10px;font-size:12px;" onclick="showOnlineOrderDetails('${o._id}')">Details</button>
                                    </td>
                                </tr>`).join('') :
                                `<tr><td colspan="8" style="text-align:center;padding:48px;color:var(--text-muted);">
                                    <i class="fas fa-globe" style="font-size:36px;opacity:0.3;display:block;margin-bottom:12px;"></i>
                                    No online orders yet. Share your shop link to receive orders.
                                </td></tr>`}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
    } catch (err) {
        if (err.response?.status !== 402) viewContainer.innerHTML = `<div class="card">Error loading online orders: ${err.message}</div>`;
    }
}

window.updateOrderStatus = async function(id, status) {
    try {
        await axios.patch(`${API_URL}/online-orders/${id}/status`, { status });
        showToast(`Order marked as ${status}`);
    } catch (err) {
        showToast('Failed to update status', 'error');
        renderOnlineOrders();
    }
};

window.showOnlineOrderDetails = async function(orderId) {
    const modal = document.getElementById('saleDetailsModal');
    document.getElementById('sdm-body').innerHTML = '<p style="text-align:center;padding:30px;color:var(--text-muted);"><i class="fas fa-spinner fa-spin"></i></p>';
    modal.style.display = 'flex';
    try {
        const res = await axios.get(`${API_URL}/online-orders`);
        const order = res.data.find(x => x._id === orderId || String(x.id) === String(orderId));
        if (!order) throw new Error('Order not found');
        const currency = _settings.currency || 'Rs.';
        const orderDelivery = parseFloat(order.delivery_cost ?? order.deliveryFee) || 0;
        const itemsSubtotal = order.items.reduce((s, i) => s + (i.total || 0), 0);
        const isPaid = String(order.paymentStatus).toUpperCase() === 'PAID';

        document.getElementById('sdm-body').innerHTML = `
            <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h3 style="color:var(--accent);margin:0;">${order.orderNumber || order.onlineOrderId}</h3>
                    <span style="font-size:13px;color:var(--text-muted);">${new Date(order.date).toLocaleString()}</span>
                </div>
                <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:14px;margin-bottom:16px;">
                    <div style="margin-bottom:10px;"><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);margin-bottom:3px;">Customer</div><div style="font-weight:700;">${order.customerName}</div></div>
                    <div style="margin-bottom:10px;"><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);margin-bottom:3px;">Address</div><div>${order.deliveryAddress}</div></div>
                    <div style="display:flex;gap:20px;flex-wrap:wrap;">
                        <div><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);margin-bottom:3px;">Payment</div><div style="font-weight:600;">${order.paymentMethod}</div></div>
                        <div><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);margin-bottom:3px;">Status</div><div style="font-weight:700;text-transform:capitalize;">${order.orderStatus || order.status}</div></div>
                        <div><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);margin-bottom:3px;">Payment Status</div>${paymentBadgeHTML(order.paymentStatus)}</div>
                    </div>
                </div>
                <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
                    <tbody>${order.items.map(i=>`<tr style="border-bottom:1px solid var(--border);"><td style="padding:10px 0;">${i.name}</td><td style="text-align:center;">×${i.quantity}</td><td style="text-align:right;font-weight:700;color:var(--accent);">${currency} ${i.total.toLocaleString()}</td></tr>`).join('')}</tbody>
                </table>
                <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:14px;margin-bottom:16px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:13px;">
                        <span style="color:var(--text-muted);">Subtotal</span><span>${currency} ${itemsSubtotal.toLocaleString()}</span>
                    </div>
                    ${orderDelivery > 0 ? `<div style="display:flex;justify-content:space-between;margin-bottom:5px;font-size:13px;">
                        <span style="color:#3b82f6;"><i class="fas fa-truck" style="font-size:10px;margin-right:3px;"></i>Delivery</span>
                        <span style="color:#3b82f6;">+ ${currency} ${orderDelivery.toLocaleString()}</span>
                    </div>` : ''}
                    <div style="display:flex;justify-content:space-between;padding-top:8px;border-top:1px solid var(--border);font-size:18px;font-weight:800;">
                        <span>Grand Total</span><span style="color:var(--accent);">${currency} ${order.totalAmount.toLocaleString()}</span>
                    </div>
                    ${!isPaid ? `<div style="display:flex;justify-content:space-between;padding-top:6px;border-top:1px dashed var(--border);margin-top:6px;font-size:13px;font-weight:700;">
                        <span style="color:#f59e0b;">Amount Due (COD)</span>
                        <span style="color:#f59e0b;">${currency} ${order.totalAmount.toLocaleString()}</span>
                    </div>` : ''}
                </div>
                ${order.paymentSlip ? `<a href="${order.paymentSlip}" target="_blank"><img src="${getThumbnailUrl(order.paymentSlip,400)}" style="width:100%;border-radius:8px;border:1px solid var(--border);margin-bottom:12px;display:block;"></a>` : ''}
                <button class="btn btn-outline" style="width:100%;justify-content:center;margin-top:4px;" onclick="document.getElementById('saleDetailsModal').style.display='none';">Close</button>
            </div>`;
    } catch (err) {
        document.getElementById('sdm-body').innerHTML = `<p style="color:#ef4444;text-align:center;">${err.message}</p>`;
    }
};

// ─── System Functions ─────────────────────────────────────────────────────────
window.downloadDatabaseBackup = async function() {
    try {
        const res = await axios.get(`${API_URL}/system/backup`);
        const a = document.createElement('a');
        a.href = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(res.data, null, 2));
        a.download = `QuickBill_Backup_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        showToast('Backup downloaded!');
    } catch (err) { showToast('Backup failed: ' + err.message, 'error'); }
};

window.restoreDatabase = function(input) {
    if (!input.files?.[0]) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            showConfirm('This will overwrite your existing data. Are you sure?', async () => {
                try {
                    await axios.post(`${API_URL}/system/restore`, data);
                    showToast('Database restored!');
                    renderProducts();
                } catch (err) { showToast('Restore failed: ' + err.message, 'error'); }
            }, 'Restore Database');
        } catch { showToast('Invalid backup file', 'error'); }
    };
    reader.readAsText(input.files[0]);
    input.value = '';
};

window.seedSriLankaProducts = async function() {
    showConfirm('This will replace all existing products with Sri Lankan sample products. Continue?', async () => {
        try {
            const res = await axios.post(`${API_URL}/system/seed-srilanka`);
            showToast(`${res.data.count} demo products loaded! 🇱🇰`);
            renderProducts();
        } catch (err) { showToast('Failed: ' + err.message, 'error'); }
    }, 'Load Demo Products');
};

window.resetPosSystem = function() {
    showConfirm('⚠️ This will delete ALL products and sales data permanently!', async () => {
        try {
            await axios.delete(`${API_URL}/system/reset`);
            showToast('System reset complete.', 'warning');
            renderDashboard();
        } catch (err) { showToast('Reset failed: ' + err.message, 'error'); }
    }, 'Reset POS System');
};
