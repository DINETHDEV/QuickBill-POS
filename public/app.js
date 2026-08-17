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

    <div id="productModal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:9999;align-items:center;justify-content:center;padding:20px;">
        <div class="card" style="width:100%;max-width:500px;max-height:90vh;overflow-y:auto;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3 id="modalTitle">Add New Product</h3>
                <button onclick="closeProductModal()" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;"><i class="fas fa-times"></i></button>
            </div>
            <form id="productForm">
                <div class="form-group"><label>Product Name *</label><input type="text" id="p_name" required></div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
                    <div class="form-group"><label>Selling Price *</label><input type="number" id="p_price" min="0" step="0.01" required></div>
                    <div class="form-group"><label>Cost Price</label><input type="number" id="p_cost" min="0" step="0.01" placeholder="For profit tracking"></div>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:15px;">
                    <div class="form-group"><label>Stock Quantity *</label><input type="number" id="p_stock" min="0" required></div>
                    <div class="form-group"><label>Category</label><input type="text" id="p_category" placeholder="e.g. Groceries"></div>
                </div>
                <div class="form-group" style="display:flex;align-items:center;gap:10px;background:rgba(0,168,107,0.05);padding:12px;border-radius:8px;border:1px solid rgba(0,168,107,0.15);">
                    <input type="checkbox" id="p_featured" style="width:auto;cursor:pointer;">
                    <label for="p_featured" style="margin:0;cursor:pointer;font-size:14px;font-weight:600;">⭐ Featured Product (shown as HOT on shop)</label>
                </div>
                <div class="form-group"><label>Product Image</label><input type="file" id="p_image" accept="image/*"></div>
                <div id="editImgPreview" style="display:none;margin-bottom:16px;">
                    <label style="font-size:12px;">Current Image:</label>
                    <img id="editImgThumb" style="width:60px;height:60px;border-radius:8px;object-fit:cover;display:block;margin-top:6px;">
                </div>
                <div style="display:flex;gap:10px;margin-top:4px;">
                    <button type="submit" class="btn btn-primary" style="flex:1;justify-content:center;" id="saveProductBtn">SAVE PRODUCT</button>
                    <button type="button" class="btn btn-outline" style="flex:1;justify-content:center;" onclick="closeProductModal()">CANCEL</button>
                </div>
            </form>
        </div>
    </div>`;

    document.getElementById('productForm').addEventListener('submit', handleProductSave);
}

function productCardHTML(p) {
    const stockColor = p.stock === 0 ? '#ef4444' : p.stock < 10 ? '#f59e0b' : 'var(--accent)';
    const stockLabel = p.stock === 0 ? 'Out of Stock' : p.stock < 10 ? `Low: ${p.stock}` : `${p.stock} in stock`;
    return `
    <div class="card product-card">
        <div style="position:relative;">
            <img src="${getThumbnailUrl(p.image,300) || 'data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'180\'><rect fill=\'%231e293b\' width=\'300\' height=\'180\'/><text x=\'50%\' y=\'50%\' fill=\'%23475569\' text-anchor=\'middle\' dy=\'.3em\' font-size=\'40\'>📦</text></svg>'}" class="product-img">
            ${p.isFeatured ? '<span style="position:absolute;top:10px;right:10px;background:#f59e0b;color:white;font-size:10px;font-weight:700;padding:3px 8px;border-radius:20px;letter-spacing:0.05em;">HOT</span>' : ''}
        </div>
        <div class="product-info">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:8px;">
                <h4 style="font-size:15px;line-height:1.3;">${p.name}</h4>
                ${p.category ? `<span style="font-size:11px;background:var(--border);padding:2px 8px;border-radius:4px;white-space:nowrap;flex-shrink:0;">${p.category}</span>` : ''}
            </div>
            <div style="color:${stockColor};font-size:13px;margin:6px 0;">● ${stockLabel}</div>
            <div class="product-price">${formatCurrency(p.price)}</div>
            <div style="margin-top:14px;display:flex;gap:8px;">
                <button class="btn btn-outline" style="flex:1;padding:8px;font-size:13px;" onclick="editProduct('${p._id}')"><i class="fas fa-edit"></i> Edit</button>
                <button class="btn btn-outline" style="padding:8px 14px;border-color:#ef4444;color:#ef4444;" onclick="deleteProduct('${p._id}')"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    </div>`;
}

window.showProductModal = function() {
    document.getElementById('productModal').style.display = 'flex';
    document.getElementById('productForm').reset();
    document.getElementById('productForm').dataset.editId = '';
    document.getElementById('modalTitle').innerText = 'Add New Product';
    document.getElementById('editImgPreview').style.display = 'none';
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

    const formData = new FormData();
    formData.append('name', document.getElementById('p_name').value);
    formData.append('price', document.getElementById('p_price').value);
    formData.append('costPrice', document.getElementById('p_cost').value || '0');
    formData.append('stock', document.getElementById('p_stock').value);
    formData.append('category', document.getElementById('p_category').value);
    formData.append('isFeatured', document.getElementById('p_featured').checked);
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
                        <div class="card" style="padding:14px;cursor:pointer;transition:all 0.2s;" onclick="addToCart('${p._id}','${p.name.replace(/'/g,"\\'")}',${p.price})" onmouseenter="this.style.borderColor='var(--accent)'" onmouseleave="this.style.borderColor='var(--border)'">
                            ${p.image ? `<img src="${getThumbnailUrl(p.image,100)}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:10px;">` : ''}
                            <div style="font-weight:600;font-size:14px;line-height:1.3;">${p.name}</div>
                            <div style="color:var(--accent);font-weight:700;margin-top:4px;">${formatCurrency(p.price)}</div>
                            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${p.stock} in stock</div>
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
                    <hr style="border:none;border-top:1px solid var(--border);margin:18px 0;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                        <h3 style="margin:0;">Cart</h3>
                        <span style="font-size:13px;background:rgba(0,168,107,0.1);color:var(--accent);padding:3px 10px;border-radius:20px;" id="cartCount">0 items</span>
                    </div>
                    <div id="cartItems" style="max-height:320px;overflow-y:auto;margin-bottom:16px;">
                        <p style="color:var(--text-muted);text-align:center;padding:20px;font-size:14px;">Cart is empty</p>
                    </div>
                    <div class="form-group" style="margin-bottom:12px;">
                        <label style="font-size:13px;">Discount</label>
                        <input type="number" id="discountAmt" placeholder="0" min="0" style="font-size:14px;" oninput="updateCartUI()">
                    </div>
                    <hr style="border:none;border-top:1px solid var(--border);margin:0 0 14px;">
                    <div style="display:flex;justify-content:space-between;font-size:18px;font-weight:700;margin-bottom:18px;">
                        <span>Total</span>
                        <span id="cartTotal" style="color:var(--accent);">${formatCurrency(0)}</span>
                    </div>
                    <button class="btn btn-primary" style="width:100%;justify-content:center;padding:14px;font-size:15px;" onclick="checkout()">
                        <i class="fas fa-check"></i> COMPLETE SALE
                    </button>
                </div>
            </div>
        </div>
    </div>`;

    window._billProducts = products;
}

let _billProducts = [];
window.filterBillProducts = function() {
    const q = document.getElementById('billSearch')?.value?.toLowerCase() || '';
    const filtered = window._billProducts.filter(p => p.name.toLowerCase().includes(q));
    document.getElementById('billProductGrid').innerHTML = filtered.map(p => `
        <div class="card" style="padding:14px;cursor:pointer;" onclick="addToCart('${p._id}','${p.name.replace(/'/g,"\\'")}',${p.price})" onmouseenter="this.style.borderColor='var(--accent)'" onmouseleave="this.style.borderColor='var(--border)'">
            ${p.image ? `<img src="${getThumbnailUrl(p.image,100)}" style="width:100%;height:80px;object-fit:cover;border-radius:6px;margin-bottom:10px;">` : ''}
            <div style="font-weight:600;font-size:14px;">${p.name}</div>
            <div style="color:var(--accent);font-weight:700;margin-top:4px;">${formatCurrency(p.price)}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${p.stock} in stock</div>
        </div>`).join('') || `<div style="grid-column:1/-1;text-align:center;padding:30px;color:var(--text-muted);">No matching products.</div>`;
};

window.addToCart = function(id, name, price) {
    const existing = cart.find(x => x.productId === id);
    if (existing) { existing.quantity += 1; existing.total = existing.quantity * existing.price; }
    else { cart.push({ productId: id, name, price, quantity: 1, total: price }); }
    updateCartUI();
};

function updateCartUI() {
    const list = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');
    const countEl = document.getElementById('cartCount');
    if (!list) return;

    if (cart.length === 0) {
        list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;font-size:14px;">Cart is empty</p>';
        totalEl.textContent = formatCurrency(0);
        countEl.textContent = '0 items';
        return;
    }

    list.innerHTML = cart.map((item, idx) => `
        <div style="display:flex;justify-content:space-between;margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid var(--border);">
            <div style="flex:1;">
                <div style="font-weight:600;font-size:14px;">${item.name}</div>
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
    const discount = parseFloat(document.getElementById('discountAmt')?.value || 0);
    const total = Math.max(0, subtotal - discount);
    totalEl.textContent = formatCurrency(total);
    countEl.textContent = `${cart.reduce((s, x) => s + x.quantity, 0)} items`;
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

async function checkout() {
    if (cart.length === 0) { showToast('Cart is empty!', 'warning'); return; }
    const custName = document.getElementById('custName')?.value || 'Walking Customer';
    const custPhone = document.getElementById('custPhone')?.value || '';
    const discount = parseFloat(document.getElementById('discountAmt')?.value || 0);
    const paymentMethod = document.querySelector('input[name="posPayMethod"]:checked')?.value || 'Cash';
    const subtotal = cart.reduce((sum, x) => sum + x.total, 0);
    const totalAmount = Math.max(0, subtotal - discount);

    const btn = document.querySelector('.cart-card .btn-primary');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...'; }

    try {
        const res = await axios.post(`${API_URL}/sales`, {
            items: cart, customerName: custName, customerPhone: custPhone,
            discount, paymentMethod
        });
        const sale = res.data;
        const settingsRes = await axios.get(`${API_URL}/settings`);
        _settings = settingsRes.data;

        await generatePremiumJPG(sale, _settings);

        const shareModal = document.getElementById('shareModal');
        shareModal.style.display = 'flex';
        document.getElementById('modalWaNumber').value = custPhone;

        // Improved WhatsApp message for POS
        document.getElementById('btnShareWA').onclick = () => {
            const currency = _settings.currency || 'Rs.';
            const storeName = _settings.shopName || 'QuickBill POS';
            const itemsList = (sale.items || []).map(i =>
                `  • ${i.name} ×${i.quantity}  ${currency} ${(i.total||0).toLocaleString()}`
            ).join('\n');
            const discLine = discount > 0 ? `\n🏷️ Discount: -${currency} ${discount.toLocaleString()}` : '';
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
                ``,
                `💳 Payment: ${paymentMethod}`,
                `💰 *Total: ${currency} ${totalAmount.toLocaleString()}*`,
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
    document.getElementById('inv-cust-name').innerText = custName || 'Walking Customer';
    document.getElementById('inv-cust-contact').innerText = custPhone || 'N/A';

    const itemsBody = document.getElementById('inv-items');
    itemsBody.innerHTML = sale.items.map(i => `
        <tr style="border-bottom:1px solid #f1f5f9;">
            <td style="padding:12px 0;"><div style="font-weight:600;color:#334155;font-size:13px;">${i.name}</div></td>
            <td style="padding:12px 0;text-align:center;color:#64748b;">${i.quantity}</td>
            <td style="padding:12px 0;text-align:right;color:#64748b;">${currency} ${i.price.toLocaleString()}</td>
            <td style="padding:12px 0;text-align:right;font-weight:700;color:#0f172a;">${currency} ${i.total.toLocaleString()}</td>
        </tr>`).join('');

    document.getElementById('inv-subtotal').innerText = `${currency} ${sale.totalAmount.toLocaleString()}`;
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
        const itemsHtml = s.items.map(i => `
            <tr style="border-bottom:1px solid var(--border);">
                <td style="padding:10px 0;">${i.name}</td>
                <td style="padding:10px 0;text-align:center;">${i.quantity}</td>
                <td style="padding:10px 0;text-align:right;">${currency} ${i.price.toLocaleString()}</td>
                <td style="padding:10px 0;text-align:right;font-weight:700;color:var(--accent);">${currency} ${i.total.toLocaleString()}</td>
            </tr>`).join('');

        document.getElementById('sdm-body').innerHTML = `
            <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h3 style="color:var(--accent);margin:0;">#${s.invoiceNumber}</h3>
                    <span style="font-size:13px;color:var(--text-muted);">${new Date(s.date).toLocaleString()}</span>
                </div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;background:rgba(255,255,255,0.03);border-radius:10px;padding:14px;margin-bottom:18px;">
                    <div><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.05em;margin-bottom:4px;">Customer</div><div style="font-weight:700;">${s.customerName || 'Walking Customer'}</div></div>
                    <div><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.05em;margin-bottom:4px;">Contact</div><div style="font-weight:600;">${s.customerPhone || 'N/A'}</div></div>
                </div>
                <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                    <thead><tr style="border-bottom:2px solid var(--border);">
                        <th style="padding:8px 0;text-align:left;font-size:12px;color:var(--text-muted);">Item</th>
                        <th style="padding:8px 0;text-align:center;font-size:12px;color:var(--text-muted);">Qty</th>
                        <th style="padding:8px 0;text-align:right;font-size:12px;color:var(--text-muted);">Price</th>
                        <th style="padding:8px 0;text-align:right;font-size:12px;color:var(--text-muted);">Total</th>
                    </tr></thead>
                    <tbody>${itemsHtml}</tbody>
                </table>
                <div style="text-align:right;border-top:2px solid var(--border);padding-top:12px;">
                    <div style="font-size:13px;color:var(--text-muted);">Grand Total</div>
                    <div style="font-size:22px;font-weight:800;color:var(--accent);">${currency} ${s.totalAmount.toLocaleString()}</div>
                </div>
                <div style="display:flex;gap:10px;margin-top:16px;">
                    <button class="btn btn-outline" style="flex:1;justify-content:center;" onclick="downloadSaleInvoiceJPG('${s._id}');document.getElementById('saleDetailsModal').style.display='none';">
                        <i class="fas fa-download"></i> Download JPG
                    </button>
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
                    <h3 style="margin-bottom:20px;color:var(--accent);"><i class="fas fa-globe"></i> Online Shop</h3>
                    ${toggleHtml('s_enableOnlineShop','Enable Online Shop', s.enableOnlineShop !== false)}
                    ${toggleHtml('s_showProductImages','Show Product Images', s.showProductImages !== false)}
                    ${toggleHtml('s_showOutOfStock','Show Out-of-Stock Products', s.showOutOfStock === true)}
                    ${toggleHtml('s_showWhatsappOrderBtn','Show WhatsApp Order Button', s.showWhatsappOrderBtn !== false)}
                    <div class="form-group" style="margin-top:16px;"><label>Theme Color</label><input type="color" id="s_themeColor" value="${s.themeColor||'#00a86b'}" style="height:50px;padding:5px;cursor:pointer;"></div>
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
        document.getElementById('sdm-body').innerHTML = `
            <div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                    <h3 style="color:var(--accent);margin:0;">${order.onlineOrderId}</h3>
                    <span style="font-size:13px;color:var(--text-muted);">${new Date(order.date).toLocaleString()}</span>
                </div>
                <div style="background:rgba(255,255,255,0.03);border-radius:10px;padding:14px;margin-bottom:16px;">
                    <div style="margin-bottom:10px;"><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);margin-bottom:3px;">Customer</div><div style="font-weight:700;">${order.customerName}</div></div>
                    <div style="margin-bottom:10px;"><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);margin-bottom:3px;">Address</div><div>${order.deliveryAddress}</div></div>
                    <div style="display:flex;gap:20px;">
                        <div><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);margin-bottom:3px;">Payment</div><div style="font-weight:600;">${order.paymentMethod}</div></div>
                        <div><div style="font-size:11px;text-transform:uppercase;color:var(--text-muted);margin-bottom:3px;">Status</div><div style="font-weight:700;text-transform:capitalize;">${order.status}</div></div>
                    </div>
                </div>
                <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                    <tbody>${order.items.map(i=>`<tr style="border-bottom:1px solid var(--border);"><td style="padding:10px 0;">${i.name}</td><td style="text-align:center;">×${i.quantity}</td><td style="text-align:right;font-weight:700;color:var(--accent);">${currency} ${i.total.toLocaleString()}</td></tr>`).join('')}</tbody>
                </table>
                <div style="text-align:right;border-top:2px solid var(--border);padding-top:12px;margin-bottom:16px;">
                    <div style="font-size:22px;font-weight:800;color:var(--accent);">${currency} ${order.totalAmount.toLocaleString()}</div>
                </div>
                ${order.paymentSlip ? `<a href="${order.paymentSlip}" target="_blank"><img src="${getThumbnailUrl(order.paymentSlip,400)}" style="width:100%;border-radius:8px;border:1px solid var(--border);"></a>` : ''}
                <button class="btn btn-outline" style="width:100%;justify-content:center;margin-top:12px;" onclick="document.getElementById('saleDetailsModal').style.display='none';">Close</button>
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
