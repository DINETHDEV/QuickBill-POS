// --- App Logic for QuickBill POS ---

// Check Login Status
if (localStorage.getItem('isLoggedIn') !== 'true' && !window.location.href.includes('login.html')) {
    window.location.href = '/login.html';
}

const API_URL = '/api';
const viewContainer = document.getElementById('view-container');
const navLinks = document.querySelectorAll('.nav-link');

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('isLoggedIn');
    window.location.href = '/login.html';
});

// Navigation Handling
window.addEventListener('hashchange', () => {
    const hash = window.location.hash || '#dashboard';
    handleNavigation(hash);
});

// Initial Load
window.addEventListener('load', async () => {
    const hash = window.location.hash || '#dashboard';
    await syncBranding();
    handleNavigation(hash);
});

async function syncBranding() {
    try {
        const res = await axios.get(`${API_URL}/settings`);
        const settings = res.data || {};
        
        const logoImg = document.getElementById('mainLogoImg');
        const logoIcon = document.getElementById('mainLogoIcon');
        const shopName = document.getElementById('mainShopName');

        if (settings.shopLogo) {
            logoImg.src = settings.shopLogo;
            logoImg.style.display = 'inline-block';
            logoIcon.style.display = 'none';
        } else {
            logoImg.style.display = 'none';
            logoIcon.style.display = 'inline-block';
        }

        // Branding Lock: Always keep the header name as "QuickBill POS"
        // if (settings.shopName) {
        //     shopName.innerText = settings.shopName;
        // }
    } catch (e) {
        console.error("Branding sync failed", e);
    }
}

function handleNavigation(hash) {
    navLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === hash) link.classList.add('active');
    });

    switch(hash) {
        case '#dashboard': renderDashboard(); break;
        case '#products': renderProducts(); break;
        case '#billing': renderBilling(); break;
        case '#online-orders': renderOnlineOrders(); break;
        case '#reports': renderReports(); break;
        case '#settings': renderSettings(); break;
        default: renderDashboard(); break;
    }
}

// Cloudinary Thumbnail Helper
function getThumbnailUrl(url, size = 300) {
    if (!url || !url.includes('cloudinary.com')) return url;
    // Replace the /upload/ part with /upload/w_{size},c_limit/ or similar for auto thumbnail
    // Make sure we handle versions correctly. Best to just insert after /upload/
    return url.replace('/upload/', `/upload/c_limit,w_${size}/`);
}

// --- Views & Logic ---

// 1. Dashboard View
async function renderDashboard() {
    viewContainer.innerHTML = '<div class="fade-in"><h2>Dashboard</h2><p>Loading analytics...</p></div>';
    
    try {
        const res = await axios.get(`${API_URL}/reports/summary`);
        const { totalSales, totalProfit, lowStockCount, totalItems, bestSelling } = res.data;

        viewContainer.innerHTML = `
        <div class="fade-in">
            <h2 style="margin-bottom: 24px;">QuickBill Analytics</h2>
            
            <div class="grid">
                <div class="card stat-card">
                    <h3>Total Sales</h3>
                    <div class="value">Rs. ${totalSales.toLocaleString()}</div>
                </div>
                <div class="card stat-card">
                    <h3>Low Stock</h3>
                    <div class="value" style="color: #ef4444;">${lowStockCount}</div>
                    <div style="color: var(--text-muted); margin-top: 10px; font-size: 14px;">Products to reorder</div>
                </div>
                <div class="card stat-card">
                    <h3>Total Items</h3>
                    <div class="value">${totalItems || 0}</div>
                    <div style="color: var(--text-muted); margin-top: 10px; font-size: 14px;">In inventory</div>
                </div>
            </div>

            <div style="margin-top: 40px;">
                <h3 style="margin-bottom: 20px;">Quick Actions</h3>
                <div style="display: flex; gap: 15px;">
                    <button class="btn btn-primary" onclick="window.location.hash='#products'; setTimeout(showProductModal, 100);">
                        <i class="fas fa-plus"></i> ADD NEW PRODUCT
                    </button>
                    <button class="btn btn-outline" onclick="window.location.hash='#billing'">
                        <i class="fas fa-receipt"></i> NEW BILLING
                    </button>
                </div>
            </div>

            <div style="margin-top: 40px;">
                <h3 style="margin-bottom: 20px;">Best Selling Products</h3>
                <div class="grid">
                    ${bestSelling.map(p => `
                        <div class="card" style="display: flex; gap: 15px; align-items: center;">
                            <img src="${getThumbnailUrl(p.image, 100) || 'https://via.placeholder.com/60'}" style="width: 60px; height: 60px; border-radius: 8px; object-fit: cover;">
                            <div>
                                <div style="font-weight: 600;">${p.name}</div>
                                <div style="color: var(--accent); font-size: 14px;">Rs. ${p.price}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>`;
    } catch (err) {
        viewContainer.innerHTML = `<div class="card">Error loading dashboard: ${err.message}</div>`;
    }
}

// 2. Product Management
let allProducts = [];
async function renderProducts() {
    viewContainer.innerHTML = '<div class="fade-in"><h2>Inventory</h2><p>Loading products...</p></div>';
    
    try {
        const res = await axios.get(`${API_URL}/products`);
        allProducts = res.data;
        
        const productsHTML = allProducts.map(p => `
            <div class="card product-card">
                <img src="${getThumbnailUrl(p.image, 300) || 'https://via.placeholder.com/300'}" class="product-img">
                <div class="product-info">
                    <div style="display: flex; justify-content: space-between; align-items: start;">
                        <h4 style="font-size: 18px;">${p.name}</h4>
                        ${p.size ? `<span style="font-size: 12px; background: var(--border); padding: 2px 8px; border-radius: 4px;">${p.size}</span>` : ''}
                    </div>
                    ${p.color ? `<div style="color: var(--text-muted); font-size: 14px; margin: 5px 0;">Color: ${p.color}</div>` : ''}
                    <div style="color: ${p.stock < 10 ? '#ef4444' : 'var(--accent)'}; font-size: 14px;">Stock: ${p.stock}</div>
                    <div class="product-price">Rs. ${p.price.toLocaleString()}</div>
                    <div style="margin-top: 15px; display: flex; gap: 10px;">
                        <button class="btn btn-outline" style="flex: 1; padding: 8px;" onclick="editProduct('${p._id}')"><i class="fas fa-edit"></i> Edit</button>
                        <button class="btn btn-outline" style="flex: 1; padding: 8px; border-color: #ef4444; color: #ef4444;" onclick="deleteProduct('${p._id}')"><i class="fas fa-trash"></i></button>
                    </div>
                </div>
            </div>
        `).join('');

        viewContainer.innerHTML = `
        <div class="fade-in">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h2>Product Management</h2>
                <button class="btn btn-primary" onclick="showProductModal()"><i class="fas fa-plus"></i> ADD PRODUCT</button>
            </div>

            <div class="card" style="margin-bottom: 30px; display: flex; gap: 15px; padding: 15px;">
                <input type="text" id="productSearch" placeholder="Search products..." style="flex: 2;">
                <select id="stockFilter" style="flex: 1;">
                    <option value="">All Stock</option>
                    <option value="low">Low Stock</option>
                    <option value="in">In Stock</option>
                </select>
            </div>

            <div class="grid" id="productGrid">
                ${productsHTML || '<div style="grid-column: 1/-1; text-align: center; padding: 50px;">No products found. Add your first product!</div>'}
            </div>
        </div>
        
        <!-- Modal (Added to Body for stacking) -->
        <div id="productModal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 9999; align-items: center; justify-content: center;">
            <div class="card" style="width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto;">
                <h3 id="modalTitle" style="margin-bottom: 20px;">Add New Product</h3>
                <form id="productForm">
                    <div class="form-group">
                        <label>Product Name</label>
                        <input type="text" id="p_name" required>
                    </div>
                    <div class="form-group">
                        <label>Price (Rs.)</label>
                        <input type="number" id="p_price" required>
                    </div>
                    <div class="form-group">
                        <label>Stock Quantity</label>
                        <input type="number" id="p_stock" required>
                    </div>

                    <div class="form-group" style="display: flex; align-items: center; gap: 10px; background: rgba(34, 197, 94, 0.05); padding: 10px; border-radius: 8px; margin-bottom: 20px;">
                        <input type="checkbox" id="p_featured" style="width: auto; cursor: pointer;">
                        <label for="p_featured" style="margin: 0; cursor: pointer; font-size: 14px; font-weight: 600;">🌟 Featured Product (Show as "HOT" on Shop)</label>
                    </div>
                    <div class="form-group">
                        <label>Image Upload</label>
                        <input type="file" id="p_image" accept="image/*">
                    </div>
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        <button type="submit" class="btn btn-primary" style="flex: 1; justify-content: center;">SAVE PRODUCT</button>
                        <button type="button" class="btn btn-outline" style="flex: 1; justify-content: center;" onclick="closeProductModal()">CANCEL</button>
                    </div>
                </form>
            </div>
        </div>`;

        // Search Implementation
        document.getElementById('productSearch').addEventListener('input', filterProducts);
        document.getElementById('stockFilter').addEventListener('change', filterProducts);

        // Form Submit
        document.getElementById('productForm').addEventListener('submit', handleProductSave);

    } catch (err) {
        viewContainer.innerHTML = `<div class="card">Error loading products: ${err.message}</div>`;
    }
}

function showProductModal() {
    document.getElementById('productModal').style.display = 'flex';
    document.getElementById('productForm').reset();
    document.getElementById('modalTitle').innerText = 'Add New Product';
    document.getElementById('productForm').dataset.editId = '';
}

function closeProductModal() {
    document.getElementById('productModal').style.display = 'none';
}

function filterProducts() {
    const q = document.getElementById('productSearch').value.toLowerCase();
    const stock = document.getElementById('stockFilter').value;

    const filtered = allProducts.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(q);
        const matchesStock = !stock || (stock === 'low' ? p.stock < 10 : p.stock >= 10);
        return matchesSearch && matchesStock;
    });

    const grid = document.getElementById('productGrid');
    grid.innerHTML = filtered.map(p => `
        <div class="card product-card">
            <img src="${getThumbnailUrl(p.image, 300) || 'https://via.placeholder.com/300'}" class="product-img">
            <div class="product-info">
                <div style="display: flex; justify-content: space-between; align-items: start;">
                    <h4 style="font-size: 18px;">${p.name}</h4>
                    ${p.size ? `<span style="font-size: 12px; background: var(--border); padding: 2px 8px; border-radius: 4px;">${p.size}</span>` : ''}
                </div>
                ${p.color ? `<div style="color: var(--text-muted); font-size: 14px; margin: 5px 0;">Color: ${p.color}</div>` : ''}
                <div style="color: ${p.stock < 10 ? '#ef4444' : 'var(--accent)'}; font-size: 14px;">Stock: ${p.stock}</div>
                <div class="product-price">Rs. ${p.price.toLocaleString()}</div>
                <div style="margin-top: 15px; display: flex; gap: 10px;">
                    <button class="btn btn-outline" style="flex: 1; padding: 8px;" onclick="editProduct('${p._id}')"><i class="fas fa-edit"></i> Edit</button>
                    <button class="btn btn-outline" style="flex: 1; padding: 8px; border-color: #ef4444; color: #ef4444;" onclick="deleteProduct('${p._id}')"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        </div>
    `).join('') || '<div style="grid-column: 1/-1; text-align: center; padding: 50px;">No matching products.</div>';
}

async function handleProductSave(e) {
    e.preventDefault();
    const formData = new FormData();
    formData.append('name', document.getElementById('p_name').value);
    formData.append('price', document.getElementById('p_price').value);
    formData.append('stock', document.getElementById('p_stock').value);
    formData.append('size', '');
    formData.append('color', '');
    formData.append('isFeatured', document.getElementById('p_featured').checked);
    
    const fileInput = document.getElementById('p_image');
    if (fileInput.files[0]) formData.append('image', fileInput.files[0]);

    const editId = document.getElementById('productForm').dataset.editId;
    
    try {
        if (editId) {
            await axios.put(`${API_URL}/products/${editId}`, formData);
        } else {
            await axios.post(`${API_URL}/products`, formData);
        }
        closeProductModal();
        renderProducts();
    } catch (err) {
        alert('Error saving product: ' + err.message);
    }
}

async function editProduct(id) {
    const p = allProducts.find(x => x._id === id);
    if (!p) return;
    
    showProductModal();
    document.getElementById('modalTitle').innerText = 'Edit Product';
    document.getElementById('productForm').dataset.editId = id;
    
    document.getElementById('p_name').value = p.name;
    document.getElementById('p_price').value = p.price;
    document.getElementById('p_stock').value = p.stock;
    document.getElementById('p_featured').checked = p.isFeatured || false;
}

async function deleteProduct(id) {
    if (confirm('Are you sure you want to delete this product?')) {
        await axios.delete(`${API_URL}/products/${id}`);
        renderProducts();
    }
}

// 3. Billing System
let cart = [];
async function renderBilling() {
    viewContainer.innerHTML = '<div class="fade-in"><h2>Billing</h2><p>Preparing system...</p></div>';
    
    try {
        const res = await axios.get(`${API_URL}/products`);
        const products = res.data;

        viewContainer.innerHTML = `
        <div class="fade-in">
            <h2>Billing System</h2>
            <div class="billing-layout" style="margin-top: 24px;">
                <div class="products-section">
                    <div class="card" style="margin-bottom: 20px;">
                        <input type="text" id="billSearch" placeholder="Search products for billing..." style="width: 100%;">
                    </div>
                    <div class="grid" id="billProductGrid">
                        ${products.map(p => `
                            <div class="card" style="padding: 15px; cursor: pointer;" onclick="addToCart('${p._id}', '${p.name}', ${p.price})">
                                <div style="font-weight: 600;">${p.name}</div>
                                <div style="color: var(--accent);">Rs. ${p.price.toLocaleString()}</div>
                                <div style="font-size: 12px; color: var(--text-muted);">${p.stock} in stock</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="cart-section">
                    <div class="card cart-card">
                        <h3 style="margin-bottom: 20px;">Billing Details</h3>
                        <div class="form-group" style="margin-bottom: 10px;">
                            <input type="text" id="custName" placeholder="Customer Name">
                        </div>
                        <div class="form-group">
                            <input type="text" id="custPhone" placeholder="Customer Phone / Address">
                        </div>

                        <hr style="border: none; border-top: 1px solid var(--border); margin: 20px 0;">

                        <h3 style="margin-bottom: 20px; display: flex; justify-content: space-between;">
                            <span>Cart Summary</span>
                            <span style="font-size: 14px; background: rgba(34, 197, 94, 0.1); color: var(--accent); padding: 4px 10px; border-radius: 20px;" id="cartCount">0 Items</span>
                        </h3>
                        
                        <div id="cartItems" style="max-height: 400px; overflow-y: auto; margin-bottom: 20px;">
                            <p style="color: var(--text-muted); text-align: center; padding: 20px;">Cart is empty</p>
                        </div>

                        <hr style="border: none; border-top: 1px solid var(--border); margin: 20px 0;">

                        <div style="display: flex; justify-content: space-between; font-size: 20px; font-weight: 700; margin-bottom: 20px;">
                            <span>Total</span>
                            <span id="cartTotal">Rs. 0</span>
                        </div>

                        <button class="btn btn-primary" style="width: 100%; justify-content: center; padding: 15px;" onclick="checkout()">
                            <i class="fas fa-check"></i> COMPLETE & PRINT
                        </button>
                    </div>
                </div>
            </div>
        </div>`;

        document.getElementById('billSearch').addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            const filtered = products.filter(p => p.name.toLowerCase().includes(q));
            document.getElementById('billProductGrid').innerHTML = filtered.map(p => `
                <div class="card" style="padding: 15px; cursor: pointer;" onclick="addToCart('${p._id}', '${p.name}', ${p.price})">
                    <div style="font-weight: 600;">${p.name}</div>
                    <div style="color: var(--accent);">Rs. ${p.price.toLocaleString()}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">${p.stock} in stock</div>
                </div>
            `).join('');
        });

    } catch (err) {
        viewContainer.innerHTML = `<div class="card">Error loading billing: ${err.message}</div>`;
    }
}

window.addToCart = function(id, name, price) {
    const existing = cart.find(x => x.productId === id);
    if (existing) {
        existing.quantity += 1;
        existing.total = existing.quantity * existing.price;
    } else {
        cart.push({ productId: id, name, price, quantity: 1, total: price });
    }
    updateCartUI();
};

function updateCartUI() {
    const list = document.getElementById('cartItems');
    const totalEl = document.getElementById('cartTotal');
    const countEl = document.getElementById('cartCount');

    if (cart.length === 0) {
        list.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Cart is empty</p>';
        totalEl.innerText = 'Rs. 0';
        countEl.innerText = '0 Items';
        return;
    }

    list.innerHTML = cart.map((item, idx) => `
        <div style="display: flex; justify-content: space-between; margin-bottom: 15px; border-bottom: 1px solid var(--border); padding-bottom: 10px;">
            <div style="flex: 1;">
                <div style="font-weight: 600;">${item.name}</div>
                <div style="font-size: 13px; color: var(--text-muted); display: flex; align-items: center; gap: 8px; margin-top: 5px;">
                    Rs. ${item.price} x 
                    <input type="number" value="${item.quantity}" min="1" 
                        onchange="updateQuantity(${idx}, this.value)" class="cart-qty-input"
                        style="width: 60px; height: 30px; border-radius: 6px; border: 1px solid var(--border); padding: 5px; text-align: center; color: var(--text); background: rgba(255,255,255,0.05);">
                </div>
            </div>
            <div style="text-align: right;">
                <div style="font-weight: 700; color: var(--accent);">Rs. ${item.total.toLocaleString()}</div>
                <button style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 12px; margin-top: 5px;" onclick="removeFromCart(${idx})">
                    <i class="fas fa-trash"></i> Remove
                </button>
            </div>
        </div>
    `).join('');

    const total = cart.reduce((sum, x) => sum + x.total, 0);
    totalEl.innerText = `Rs. ${total.toLocaleString()}`;
    countEl.innerText = `${cart.length} Items`;
}

window.updateQuantity = function(idx, newQty) {
    const q = parseInt(newQty);
    if (isNaN(q) || q < 1) {
        alert('Quantity must be at least 1');
        updateCartUI();
        return;
    }
    cart[idx].quantity = q;
    cart[idx].total = cart[idx].quantity * cart[idx].price;
    updateCartUI();
};

window.removeFromCart = function(idx) {
    cart.splice(idx, 1);
    updateCartUI();
};

async function checkout() {
    if (cart.length === 0) return alert('Cart is empty!');

    const custName = document.getElementById('custName').value || 'Walking Customer';
    const custPhone = document.getElementById('custPhone').value || '';
    const totalAmount = cart.reduce((sum, x) => sum + x.total, 0);
    
    try {
        console.log('Sending Sale Data:', { items: cart, totalAmount, customerName: custName, customerPhone: custPhone });
        const res = await axios.post(`${API_URL}/sales`, { items: cart, totalAmount, customerName: custName, customerPhone: custPhone });
        const sale = res.data;
        const settingsRes = await axios.get(`${API_URL}/settings`);
        const s = settingsRes.data;

        // Populate and capture JPG
        await generatePremiumJPG(sale, s, custName, custPhone);

        // Show Share Modal
        const shareModal = document.getElementById('shareModal');
        shareModal.style.display = 'flex';
        
        // Auto-fill the WhatsApp number field in the modal
        document.getElementById('modalWaNumber').value = custPhone;

        document.getElementById('btnShareWA').onclick = () => {
            const itemsList = (sale.items || []).map(i => `• ${i.name} x${i.quantity} = ${s.currency} ${i.total.toLocaleString()}`).join('\n');
            const msg = `🛍️ *${s.shopName || 'QuickBill POS'}*\n🧾 *බිල්පත / Invoice #${sale.invoiceNumber}*\n\n*පාරිභෝගිකයා / Customer:* ${custName}\n\n*මිලදී ගත් භාණ්ඩ / Items:*\n${itemsList}\n\n------------------------------\n💰 *මුළු එකතුව / Grand Total:* *${s.currency} ${totalAmount.toLocaleString()}*\n------------------------------\n\nස්තූතියි! නැවත පැමිණෙන්න! 🙏\nThank you for shopping with us!`;
            
            let wNumber = document.getElementById('modalWaNumber').value.trim();
            let phone = wNumber.replace(/\D/g, ''); // Clean phone number
            if (phone.startsWith('0')) {
                phone = '94' + phone.substring(1);
            } else if (phone.length === 9) {
                phone = '94' + phone;
            }
            
            let fallbackPhone = s.whatsappNumber ? s.whatsappNumber.replace(/\D/g, '') : '';
            if (fallbackPhone.startsWith('0')) {
                fallbackPhone = '94' + fallbackPhone.substring(1);
            } else if (fallbackPhone.length === 9) {
                fallbackPhone = '94' + fallbackPhone;
            }

            const targetPhone = phone || fallbackPhone;
            window.open(`https://wa.me/${targetPhone}?text=${encodeURIComponent(msg)}`, '_blank');
        };

        document.getElementById('btnDownloadJPG').onclick = () => {
            const link = document.createElement('a');
            link.download = `Invoice_${sale.invoiceNumber}.jpg`;
            link.href = window.lastInvoiceDataUrl;
            link.click();
        };

        cart = [];
        renderBilling();
    } catch (err) {
        alert('Checkout error: ' + err.message);
        console.error(err);
    }
}

async function generatePremiumJPG(sale, settings, custName, custPhone) {
    const template = document.getElementById('invoice-template');
    
    // Header Logic
    const logoEl = document.getElementById('inv-logo');
    if (settings.showLogoOnInvoice && settings.shopLogo) {
        logoEl.src = settings.shopLogo;
        logoEl.style.display = 'block';
    } else {
        logoEl.style.display = 'none';
    }

    document.getElementById('inv-shop-name').innerText = settings.shopName || "";
    
    const addrEl = document.getElementById('inv-shop-address');
    if (settings.showAddressOnInvoice && settings.shopAddress) {
        addrEl.innerText = settings.shopAddress;
        addrEl.style.display = 'block';
    } else {
        addrEl.style.display = 'none';
    }

    const contactEl = document.getElementById('inv-shop-contact');
    if (settings.showPhoneOnInvoice && settings.shopPhone) {
        contactEl.innerText = 'PH: ' + settings.shopPhone;
        contactEl.style.display = 'block';
    } else {
        contactEl.style.display = 'none';
    }

    // Invoice Meta
    document.getElementById('inv-number').innerText = `#${sale.invoiceNumber}`;
    document.getElementById('inv-date').innerText = new Date(sale.date).toLocaleDateString('en-US', { 
        year: 'numeric', month: 'short', day: 'numeric' 
    });

    // Customer
    document.getElementById('inv-cust-name').innerText = custName || "Walking Customer";
    document.getElementById('inv-cust-contact').innerText = custPhone || "N/A";

    // Items
    const currency = settings.currency || 'Rs.';
    const itemsBody = document.getElementById('inv-items');
    itemsBody.innerHTML = sale.items.map(i => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
            <td style="padding: 15px 0;">
                <div style="font-weight: 700; color: #334155; font-size: 14px;">${i.name}</div>
            </td>
            <td style="padding: 15px 0; text-align: center; color: #64748b;">${i.quantity}</td>
            <td style="padding: 15px 0; text-align: right; color: #64748b;">${i.price.toLocaleString()}</td>
            <td style="padding: 15px 0; text-align: right; font-weight: 700; color: #0f172a;">${i.total.toLocaleString()}</td>
        </tr>
    `).join('');

    // Totals
    document.getElementById('inv-subtotal').innerText = `${currency} ${sale.totalAmount.toLocaleString()}`;
    document.getElementById('inv-total').innerText = `${currency} ${sale.totalAmount.toLocaleString()}`;
    
    // Footer
    document.getElementById('inv-footer-msg').innerText = settings.invoiceFooter || "Thank you for shopping with us!";

    // Capture to Canvas
    const canvas = await html2canvas(template, {
        scale: 2, 
        useCORS: true,
        backgroundColor: '#ffffff'
    });
    
    window.lastInvoiceDataUrl = canvas.toDataURL('image/jpeg', 0.9);
}

// --- End of Invoice Logic ---

// Download Invoice JPG for any past sale from history
window.downloadSaleInvoiceJPG = async function(saleId) {
    try {
        const [saleRes, settingsRes] = await Promise.all([
            axios.get(`${API_URL}/sales/${saleId}`),
            axios.get(`${API_URL}/settings`)
        ]);
        const sale = saleRes.data;
        const settings = settingsRes.data;

        await generatePremiumJPG(sale, settings, sale.customerName || 'Walking Customer', sale.customerPhone || '');

        const link = document.createElement('a');
        link.download = `Invoice_${sale.invoiceNumber}.jpg`;
        link.href = window.lastInvoiceDataUrl;
        link.click();
    } catch (err) {
        alert('Invoice download failed: ' + err.message);
        console.error(err);
    }
};

// 4. Reports View
async function renderReports() {
    viewContainer.innerHTML = '<div class="fade-in"><h2>Reports</h2><p>Generating reports...</p></div>';
    
    try {
        const resSummary = await axios.get(`${API_URL}/reports/summary`);
        const resDaily = await axios.get(`${API_URL}/reports/daily`);
        const summary = resSummary.data;
        const dailySales = resDaily.data;

        viewContainer.innerHTML = `
        <div class="fade-in">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h2>Sales Reports</h2>
                <div style="display: flex; gap: 10px;">
                    <button class="btn btn-outline" onclick="downloadCSV()"><i class="fas fa-file-csv"></i> EXPORT CSV</button>
                    <button class="btn btn-outline" onclick="downloadPDFReport()"><i class="fas fa-file-pdf"></i> EXPORT PDF</button>
                </div>
            </div>

            <div class="grid" style="grid-template-columns: 1fr;">
                <div class="card">
                    <h3 style="margin-bottom: 15px;">Daily Performance</h3>
                    <div style="font-size: 24px; font-weight: 700; color: var(--accent);">Rs. ${dailySales.reduce((sum, s) => sum + s.totalAmount, 0).toLocaleString()}</div>
                    <p style="color: var(--text-muted);">Total sales today</p>
                </div>
            </div>

            <div class="card" style="margin-top: 30px;">
                <div class="history-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
                    <h3 style="margin: 0;">Recent Sales History</h3>
                    <div class="search-wrapper" style="width: 300px; position: relative;">
                        <i class="fas fa-search" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-muted); font-size: 14px;"></i>
                        <input type="text" id="salesSearch" placeholder="Search customer or #..." style="width: 100%; padding-left: 35px; height: 40px; font-size: 14px;">
                    </div>
                </div>
                
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left;" id="salesHistoryTable">
                        <thead>
                            <tr style="border-bottom: 1px solid var(--border);">
                                <th style="padding: 12px;">Invoice</th>
                                <th style="padding: 12px;">Items</th>
                                <th style="padding: 12px;">Amount</th>
                                <th style="padding: 12px;">Date</th>
                                <th style="padding: 12px;">Download</th>
                            </tr>
                        </thead>
                        <tbody id="salesHistoryBody">
                            ${dailySales.map(s => `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 12px;">
                                        <span onclick="showSaleDetails('${s._id}')" style="color: var(--accent); cursor: pointer; font-weight: 700; text-decoration: underline dotted;">${s.invoiceNumber}</span>
                                    </td>
                                    <td style="padding: 12px;">${s.items.length} items</td>
                                    <td style="padding: 12px;">Rs. ${s.totalAmount}</td>
                                    <td style="padding: 12px;">${new Date(s.date).toLocaleTimeString()}</td>
                                    <td style="padding: 12px;">
                                        <button class="btn btn-outline" style="padding: 6px 12px; font-size: 12px;" onclick="downloadSaleInvoiceJPG('${s._id}')">
                                            <i class="fas fa-download"></i> JPG
                                        </button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="5" style="text-align: center; padding: 20px;">No sales recorded today</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;

        // Real-time Search Logic
        document.getElementById('salesSearch').addEventListener('input', (e) => {
            const q = e.target.value.toLowerCase();
            const filtered = dailySales.filter(s => 
                (s.customerName || '').toLowerCase().includes(q) || 
                (s.invoiceNumber || '').toLowerCase().includes(q)
            );
            
            const tbody = document.getElementById('salesHistoryBody');
            tbody.innerHTML = filtered.map(s => `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding: 12px;">
                        <span onclick="showSaleDetails('${s._id}')" style="color: var(--accent); cursor: pointer; font-weight: 700; text-decoration: underline dotted;">${s.invoiceNumber}</span>
                    </td>
                    <td style="padding: 12px;">${s.items.length} items</td>
                    <td style="padding: 12px;">Rs. ${s.totalAmount}</td>
                    <td style="padding: 12px;">${new Date(s.date).toLocaleTimeString()}</td>
                    <td style="padding: 12px;">
                        <button class="btn btn-outline" style="padding: 6px 12px; font-size: 12px;" onclick="downloadSaleInvoiceJPG('${s._id}')">
                            <i class="fas fa-download"></i> JPG
                        </button>
                    </td>
                </tr>
            `).join('') || `<tr><td colspan="5" style="text-align: center; padding: 20px;">No matching sales found for "${e.target.value}"</td></tr>`;
        });

    } catch (err) {
        viewContainer.innerHTML = `<div class="card">Error loading reports: ${err.message}</div>`;
    }
}

// Show customer details modal on invoice number click
window.showSaleDetails = async function(saleId) {
    const modal = document.getElementById('saleDetailsModal');
    document.getElementById('sdm-body').innerHTML = '<p style="text-align:center; padding: 20px; color: var(--text-muted);">Loading...</p>';
    modal.style.display = 'flex';

    try {
        const res = await axios.get(`${API_URL}/sales/${saleId}`);
        const s = res.data;
        console.log('Fetched Sale Details:', s);

        const itemsHtml = s.items.map(i => `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 10px 0; color: var(--text);">${i.name}</td>
                <td style="padding: 10px 0; text-align: center; color: var(--text-muted);">${i.quantity}</td>
                <td style="padding: 10px 0; text-align: right; color: var(--text-muted);">Rs. ${i.price.toLocaleString()}</td>
                <td style="padding: 10px 0; text-align: right; font-weight: 700; color: var(--accent);">Rs. ${i.total.toLocaleString()}</td>
            </tr>
        `).join('');

        document.getElementById('sdm-body').innerHTML = `
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; color: var(--accent);">#${s.invoiceNumber}</h3>
                    <span style="font-size: 13px; color: var(--text-muted);">${new Date(s.date).toLocaleString()}</span>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; background: rgba(255,255,255,0.03); border-radius: 10px; padding: 16px; margin-bottom: 20px;">
                    <div>
                        <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-bottom: 4px;">Customer Name</div>
                        <div style="font-weight: 700; font-size: 16px;">${s.customerName || 'Walking Customer'}</div>
                    </div>
                    <div>
                        <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-bottom: 4px;">Phone / Address</div>
                        <div style="font-weight: 600; font-size: 15px;">${s.customerPhone || 'N/A'}</div>
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border);">
                            <th style="padding: 8px 0; text-align: left; font-size: 12px; text-transform: uppercase; color: var(--text-muted);">Item</th>
                            <th style="padding: 8px 0; text-align: center; font-size: 12px; text-transform: uppercase; color: var(--text-muted);">Qty</th>
                            <th style="padding: 8px 0; text-align: right; font-size: 12px; text-transform: uppercase; color: var(--text-muted);">Price</th>
                            <th style="padding: 8px 0; text-align: right; font-size: 12px; text-transform: uppercase; color: var(--text-muted);">Total</th>
                        </tr>
                    </thead>
                    <tbody>${itemsHtml}</tbody>
                </table>

                <div style="display: flex; justify-content: flex-end; border-top: 2px solid var(--border); padding-top: 12px;">
                    <div style="text-align: right;">
                        <div style="font-size: 13px; color: var(--text-muted);">Grand Total</div>
                        <div style="font-size: 22px; font-weight: 800; color: var(--accent);">Rs. ${s.totalAmount.toLocaleString()}</div>
                    </div>
                </div>
            </div>

            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button class="btn btn-outline" style="flex: 1; justify-content: center;" onclick="downloadSaleInvoiceJPG('${s._id}'); document.getElementById('saleDetailsModal').style.display='none';">
                    <i class="fas fa-download"></i> Download JPG
                </button>
                <button class="btn btn-outline" style="flex: 1; justify-content: center; border: none; color: var(--text-muted);" onclick="document.getElementById('saleDetailsModal').style.display='none';">
                    Close
                </button>
            </div>
        `;
    } catch (err) {
        document.getElementById('sdm-body').innerHTML = `<p style="color: #ef4444; text-align: center;">Failed to load details: ${err.message}</p>`;
    }
};


async function renderSettings() {
    viewContainer.innerHTML = '<div class="fade-in"><h2>POS Settings</h2><p>Loading settings...</p></div>';
    
    try {
        const res = await axios.get(`${API_URL}/settings`);
        const s = res.data;

        const toggleHtml = (id, label, checked) => `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 8px;">
                <label for="${id}" style="margin: 0; cursor: pointer; color: var(--text); font-weight: 500;">${label}</label>
                <label class="switch">
                    <input type="checkbox" id="${id}" ${checked ? 'checked' : ''}>
                    <span class="slider round"></span>
                </label>
            </div>
        `;

        viewContainer.innerHTML = `
        <div class="fade-in">
            <h2 style="margin-bottom: 24px;">Settings</h2>
            
            <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start;">
                
                <!-- Section 1: Shop Information -->
                <div class="card">
                    <h3 style="margin-bottom: 20px; color: var(--accent);"><i class="fas fa-store"></i> Shop Information</h3>
                    <div class="form-group">
                        <label><i class="fas fa-globe"></i> Store Name (Appears on Online Shop & Invoices)</label>
                        <input type="text" id="s_shopName" value="${s.shopName || ''}" placeholder="Type your shop name here...">
                    </div>
                    <div class="form-group" style="display: flex; gap: 10px; align-items: end;">
                        <div style="flex: 1;">
                            <label>Shop Logo Upload</label>
                            <input type="file" id="s_shopLogoFile" accept="image/*" style="padding: 9px 12px;">
                        </div>
                        ${s.shopLogo ? `<img src="${s.shopLogo}" style="height: 44px; width: 44px; object-fit: cover; border-radius: 8px; border: 1px solid var(--border); background: white;">` : ''}
                    </div>
                    <input type="hidden" id="s_shopLogo" value="${s.shopLogo || ''}">
                    
                    <div class="form-group">
                        <label>Shop Phone Number</label>
                        <input type="text" id="s_shopPhone" value="${s.shopPhone || ''}">
                    </div>
                    <div class="form-group">
                        <label>Shop Address</label>
                        <textarea id="s_shopAddress" rows="2">${s.shopAddress || ''}</textarea>
                    </div>
                    <div class="form-group">
                        <label>Email Address</label>
                        <input type="email" id="s_shopEmail" value="${s.shopEmail || ''}">
                    </div>
                    
                    <div class="btn-group" style="display: flex; gap: 10px; margin-top: 10px;">
                        <button class="btn btn-primary" style="flex: 2; justify-content: center;" onclick="saveSettings()">
                            <i class="fas fa-save"></i> Save Settings
                        </button>
                        <button class="btn btn-outline" style="flex: 1; justify-content: center; border-color: #ef4444; color: #ef4444;" onclick="clearShopInfo()">
                            <i class="fas fa-eraser"></i> Clear
                        </button>
                    </div>
                </div>

                <!-- Section 2: Online Shop Settings -->
                <div class="card">
                    <h3 style="margin-bottom: 20px; color: var(--accent);"><i class="fas fa-globe"></i> Online Shop Settings</h3>
                    
                    ${toggleHtml('s_enableOnlineShop', 'Enable Online Shop', s.enableOnlineShop !== false)}
                    ${toggleHtml('s_showProductImages', 'Show product images', s.showProductImages !== false)}
                    ${toggleHtml('s_showOutOfStock', 'Show out-of-stock products', s.showOutOfStock === true)}
                    ${toggleHtml('s_showWhatsappOrderBtn', 'Show WhatsApp order button', s.showWhatsappOrderBtn !== false)}
                    
                    <div class="form-group" style="margin-top: 20px;">
                        <label>Shop Theme Color</label>
                        <input type="color" id="s_themeColor" value="${s.themeColor || '#22c55e'}" style="height: 50px; padding: 5px; cursor: pointer;">
                    </div>
                    <div class="form-group">
                        <label>Shop Banner Text</label>
                        <input type="text" id="s_bannerMessage" value="${s.bannerMessage || ''}" placeholder="e.g. New Arrival – 20% OFF">
                    </div>
                    
                    <button class="btn btn-primary" style="width: 100%; justify-content: center; margin-top: 10px;" onclick="saveSettings()">
                        <i class="fas fa-save"></i> Save Settings
                    </button>
                </div>

                <!-- Section 3: Invoice Settings -->
                <div class="card">
                    <h3 style="margin-bottom: 20px; color: var(--accent);"><i class="fas fa-file-invoice"></i> Invoice Settings</h3>
                    
                    <div class="grid" style="grid-template-columns: 1fr 1fr; gap: 15px; margin-top: 0;">
                        <div class="form-group">
                            <label>Invoice Prefix</label>
                            <input type="text" id="s_invoicePrefix" value="${s.invoicePrefix || 'QB-'}">
                        </div>
                        <div class="form-group">
                            <label>Currency</label>
                            <input type="text" id="s_currency" value="${s.currency || 'Rs.'}">
                        </div>
                    </div>
                    
                    ${toggleHtml('s_showLogoOnInvoice', 'Show shop logo on invoice', s.showLogoOnInvoice !== false)}
                    ${toggleHtml('s_showAddressOnInvoice', 'Show shop address on invoice', s.showAddressOnInvoice !== false)}
                    ${toggleHtml('s_showPhoneOnInvoice', 'Show phone number on invoice', s.showPhoneOnInvoice !== false)}
                    
                    <button class="btn btn-primary" style="width: 100%; justify-content: center; margin-top: 10px;" onclick="saveSettings()">
                        <i class="fas fa-save"></i> Save Settings
                    </button>
                </div>

                <!-- Section 4: Bank Details -->
                <div class="card">
                    <h3 style="margin-bottom: 20px; color: var(--accent);"><i class="fas fa-university"></i> Bank Details</h3>
                    <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 15px;">These details are shown on the online shop when "Bank Transfer" is selected.</p>
                    
                    <div class="form-group">
                        <label>Bank Name</label>
                        <input type="text" id="s_bankName" value="${s.bankName || ''}">
                    </div>
                    <div class="form-group">
                        <label>Account Name</label>
                        <input type="text" id="s_accountName" value="${s.accountName || ''}">
                    </div>
                    <div class="form-group">
                        <label>Account Number</label>
                        <input type="text" id="s_accountNumber" value="${s.accountNumber || ''}">
                    </div>
                    <div class="form-group">
                        <label>Branch Name</label>
                        <input type="text" id="s_bankBranch" value="${s.bankBranch || ''}">
                    </div>
                    <div class="form-group">
                        <label>Additional Note (Optional)</label>
                        <textarea id="s_bankNote" rows="2" placeholder="e.g. Please send the slip after payment...">${s.bankNote || ''}</textarea>
                    </div>
                    
                    <button class="btn btn-primary" style="width: 100%; justify-content: center; margin-top: 10px;" onclick="saveSettings()">
                        <i class="fas fa-save"></i> Save Settings
                    </button>
                </div>

                <!-- Section 5: System Settings -->
                <div class="card">
                    <h3 style="margin-bottom: 20px; color: var(--accent);"><i class="fas fa-server"></i> System Settings</h3>
                    
                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <button class="btn btn-outline" style="justify-content: center;" onclick="downloadDatabaseBackup()">
                            <i class="fas fa-download"></i> Backup Data
                        </button>
                        
                        <label class="btn btn-outline" style="justify-content: center; margin: 0; cursor: pointer;">
                            <i class="fas fa-upload"></i> Restore Data
                            <input type="file" id="restoreFile" style="display: none;" accept=".json" onchange="restoreDatabase(this)">
                        </label>
                        
                        <button class="btn btn-outline" style="justify-content: center;" onclick="downloadDatabaseBackup()">
                            <i class="fas fa-database"></i> Download Database
                        </button>

                        <hr style="border: none; border-top: 1px solid var(--border); margin: 10px 0;">
                        
                        <button class="btn btn-outline" style="justify-content: center; color: var(--accent); border-color: var(--accent);" onclick="seedSriLankaProducts()">
                            <i class="fas fa-flag"></i> 🇱🇰 Load Sri Lanka Demo Products
                        </button>
                        
                        <button class="btn btn-outline" style="justify-content: center; color: #f59e0b; border-color: #f59e0b;" onclick="clearAllProducts()">
                            <i class="fas fa-eraser"></i> Clear All Products
                        </button>
                        
                        <button class="btn btn-outline" style="justify-content: center; color: #ef4444; border-color: #ef4444;" onclick="resetPosSystem()">
                            <i class="fas fa-power-off"></i> Reset POS System
                        </button>

                        <hr style="border: none; border-top: 1px solid var(--border); margin: 10px 0;">

                        <button class="btn btn-outline" style="justify-content: center; color: var(--text-muted);" onclick="document.getElementById('logoutBtn').click()">
                            <i class="fas fa-sign-out-alt"></i> Logout
                        </button>
                    </div>
                </div>

            </div>
        </div>`;

    } catch (err) {
        viewContainer.innerHTML = `<div class="card">Error loading settings: ${err.message}</div>`;
    }
}

window.saveSettings = async function() {
    try {
        const btn = event.currentTarget;
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        btn.disabled = true;

        let logoUrl = document.getElementById('s_shopLogo').value;
        const fileInput = document.getElementById('s_shopLogoFile');
        if (fileInput && fileInput.files[0]) {
            const formData = new FormData();
            formData.append('image', fileInput.files[0]);
            const uploadRes = await axios.post(`${API_URL}/upload-asset`, formData);
            logoUrl = uploadRes.data.url;
            document.getElementById('s_shopLogo').value = logoUrl;
        }

        const data = {
            shopName: document.getElementById('s_shopName').value,
            shopLogo: logoUrl,
            shopPhone: document.getElementById('s_shopPhone').value,
            whatsappNumber: document.getElementById('s_shopPhone').value,
            shopAddress: document.getElementById('s_shopAddress').value,
            shopEmail: document.getElementById('s_shopEmail').value,
            
            enableOnlineShop: document.getElementById('s_enableOnlineShop').checked,
            showProductImages: document.getElementById('s_showProductImages').checked,
            showOutOfStock: document.getElementById('s_showOutOfStock').checked,
            showWhatsappOrderBtn: document.getElementById('s_showWhatsappOrderBtn').checked,
            themeColor: document.getElementById('s_themeColor').value,
            bannerMessage: document.getElementById('s_bannerMessage').value,
            
            invoicePrefix: document.getElementById('s_invoicePrefix').value.trim(),
            currency: document.getElementById('s_currency').value.trim(),
            showLogoOnInvoice: document.getElementById('s_showLogoOnInvoice').checked,
            showAddressOnInvoice: document.getElementById('s_showAddressOnInvoice').checked,
            showPhoneOnInvoice: document.getElementById('s_showPhoneOnInvoice').checked,

            bankName: document.getElementById('s_bankName').value,
            accountName: document.getElementById('s_accountName').value,
            accountNumber: document.getElementById('s_accountNumber').value,
            bankBranch: document.getElementById('s_bankBranch').value,
            bankNote: document.getElementById('s_bankNote').value,
        };
        
        console.log("Saving Settings Payload:", data);
        await axios.post(`${API_URL}/settings`, data);
        await syncBranding();
        
        btn.innerHTML = '<i class="fas fa-check"></i> Saved!';
        setTimeout(() => {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 2000);
        
    } catch (err) {
        alert('Error updating settings: ' + err.message);
        console.error(err);
    }
};

window.downloadDatabaseBackup = async function() {
    try {
        const res = await axios.get(`${API_URL}/system/backup`);
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(res.data, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `QuickBill_Backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(downloadAnchorNode); 
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    } catch(err) {
        alert("Failed to create backup: " + err.message);
    }
};

window.restoreDatabase = function(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if(confirm("Are you sure you want to restore the database? This will overwrite existing data!")) {
                await axios.post(`${API_URL}/system/restore`, data);
                alert("Database restored successfully!");
                location.reload();
            }
        } catch(err) {
            alert("Invalid backup file or restore failed.");
        }
    };
    reader.readAsText(file);
    input.value = ''; 
};

window.clearAllProducts = async function() {
    if(confirm("DANGER! This will wipe all inventory. Are you sure?")) {
        const word = prompt("Type 'DELETE' to confirm:");
        if (word === 'DELETE') {
            try {
                await axios.delete(`${API_URL}/system/products`);
                alert("All products have been deleted.");
            } catch(e) {
                alert("Failed: " + e.message);
            }
        }
    }
};

window.resetPosSystem = async function() {
    if(confirm("CRITICAL WARNING! This will delete ALL Products, Sales, and Settings. The system will be completely reset. Are you absolutely sure?")) {
         const word = prompt("Type 'RESET' to confirm:");
         if (word === 'RESET') {
             try {
                 await axios.delete(`${API_URL}/system/reset`);
                 alert("System has been reset.");
                 location.reload();
             } catch(e) {
                 alert("Failed: " + e.message);
             }
         }
    }
};

window.seedSriLankaProducts = async function() {
    if (!confirm("🇱🇰 ශ්‍රී ලංකා demo products load කරන්නද?\n\nThis will REPLACE all existing products with Sri Lankan sample products (Dilmah Tea, Munchee Biscuits, Keells Sausages etc) and apply Sri Lankan store settings.\n\nAre you sure?")) return;
    try {
        const res = await axios.post(`${API_URL}/system/seed-srilanka`);
        alert(`✅ ${res.data.count} Sri Lankan products loaded!\n\nShop settings updated with Sri Lankan defaults.`);
        renderSettings(); // Refresh the settings page
        renderProducts(); // Refresh products
    } catch(e) {
        alert('Failed to load Sri Lanka products: ' + e.message);
    }
};


window.clearShopInfo = function() {
    if (confirm('Are you sure you want to clear all shop information?')) {
        document.getElementById('s_shopName').value = '';
        document.getElementById('s_shopPhone').value = '';
        document.getElementById('s_shopAddress').value = '';
        document.getElementById('s_shopEmail').value = '';
        document.getElementById('s_shopLogo').value = '';
        const fileInput = document.getElementById('s_shopLogoFile');
        if (fileInput) fileInput.value = '';
        
        alert('Shop Information cleared locally. Click "Save Settings" to apply changes permanently.');
    }
};

// --- 5. Online Orders View ---
async function renderOnlineOrders() {
    viewContainer.innerHTML = '<div class="fade-in"><h2>Online Orders</h2><p>Loading website orders...</p></div>';
    
    try {
        const res = await axios.get(`${API_URL}/online-orders?t=${Date.now()}`);
        const orders = res.data;
        console.log("Online Orders Fetched:", orders);

        const getStatusColor = (s) => {
            if (s === 'delivered') return '#22c55e';
            if (s === 'confirmed') return '#3b82f6';
            return '#f59e0b'; // pending
        };

        viewContainer.innerHTML = `
        <div class="fade-in">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                <h2>Website Online Orders</h2>
                <button class="btn btn-outline" onclick="renderOnlineOrders()"><i class="fas fa-sync"></i> REFRESH</button>
            </div>

            <div class="card" style="padding: 0; overflow: hidden;">
                <div style="overflow-x: auto;">
                    <table style="width: 100%; border-collapse: collapse; text-align: left;">
                        <thead>
                            <tr style="background: rgba(255,255,255,0.02); border-bottom: 1px solid var(--border);">
                                <th style="padding: 15px;">Order ID</th>
                                <th style="padding: 15px;">Customer</th>
                                <th style="padding: 15px;">Payment</th>
                                <th style="padding: 15px;">Total</th>
                                <th style="padding: 15px;">Status</th>
                                <th style="padding: 15px;">Slip</th>
                                <th style="padding: 15px;">Date</th>
                                <th style="padding: 15px;">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${orders.map(o => `
                                <tr style="border-bottom: 1px solid var(--border);">
                                    <td style="padding: 15px; font-weight: 700; color: var(--accent);">${o.onlineOrderId}</td>
                                    <td style="padding: 15px;">
                                        <div style="font-weight: 600;">${o.customerName}</div>
                                        <div style="font-size: 12px; color: var(--text-muted); max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${o.deliveryAddress}">${o.deliveryAddress}</div>
                                    </td>
                                    <td style="padding: 15px; font-size: 13px;">${o.paymentMethod}</td>
                                    <td style="padding: 15px; font-weight: 700;">Rs. ${o.totalAmount.toLocaleString()}</td>
                                    <td style="padding: 15px;">
                                        <select onchange="updateOrderStatus('${o._id}', this.value)" 
                                            style="padding: 5px 10px; border-radius: 6px; border: 1px solid ${getStatusColor(o.status)}; color: ${getStatusColor(o.status)}; background: transparent; font-weight: 600; cursor: pointer;">
                                            <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
                                            <option value="confirmed" ${o.status === 'confirmed' ? 'selected' : ''}>Confirmed</option>
                                            <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>Delivered</option>
                                        </select>
                                    </td>
                                    <td style="padding: 15px;">
                                        ${o.paymentSlip ? `<a href="${o.paymentSlip}" target="_blank"><img src="${getThumbnailUrl(o.paymentSlip, 50)}" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover; border: 1px solid var(--border);"></a>` : '<span style="color: var(--text-muted); font-size: 12px;">No Slip</span>'}
                                    </td>
                                    <td style="padding: 15px; font-size: 12px; color: var(--text-muted);">${new Date(o.date).toLocaleString()}</td>
                                    <td style="padding: 15px;">
                                        <button class="btn btn-outline" style="padding: 6px 10px; font-size: 12px;" onclick="showOnlineOrderDetails('${o._id}')">DETAILS</button>
                                    </td>
                                </tr>
                            `).join('') || '<tr><td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">No online orders received yet.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>`;
    } catch (err) {
        viewContainer.innerHTML = `<div class="card">Error loading online orders: ${err.message}</div>`;
    }
}

window.updateOrderStatus = async function(id, status) {
    try {
        await axios.patch(`${API_URL}/online-orders/${id}/status`, { status });
        renderOnlineOrders();
    } catch (err) {
        alert('Failed to update status: ' + err.message);
    }
};

window.showOnlineOrderDetails = async function(orderId) {
    const modal = document.getElementById('saleDetailsModal');
    document.getElementById('sdm-body').innerHTML = '<p style="text-align:center; padding: 20px; color: var(--text-muted);">Loading details...</p>';
    modal.style.display = 'flex';

    try {
        const res = await axios.get(`${API_URL}/online-orders`);
        const order = res.data.find(x => x._id === orderId);
        if (!order) throw new Error('Order not found');

        const itemsHtml = order.items.map(i => `
            <tr style="border-bottom: 1px solid var(--border);">
                <td style="padding: 10px 0; color: var(--text);">${i.name}</td>
                <td style="padding: 10px 0; text-align: center; color: var(--text-muted);">${i.quantity}</td>
                <td style="padding: 10px 0; text-align: right; color: var(--text-muted);">Rs. ${i.price.toLocaleString()}</td>
                <td style="padding: 10px 0; text-align: right; font-weight: 700; color: var(--accent);">Rs. ${i.total.toLocaleString()}</td>
            </tr>
        `).join('');

        document.getElementById('sdm-body').innerHTML = `
            <div style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="margin: 0; color: var(--accent); font-size: 20px;">${order.onlineOrderId}</h3>
                    <span style="font-size: 13px; color: var(--text-muted);">${new Date(order.date).toLocaleString()}</span>
                </div>

                <div style="background: rgba(255,255,255,0.03); border-radius: 10px; padding: 16px; margin-bottom: 20px;">
                    <div style="margin-bottom: 10px;">
                        <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-bottom: 4px;">Customer Name</div>
                        <div style="font-weight: 700; font-size: 16px;">${order.customerName}</div>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-bottom: 4px;">Delivery Address</div>
                        <div style="font-weight: 500; font-size: 14px; line-height: 1.4;">${order.deliveryAddress}</div>
                    </div>
                    <div style="display: flex; gap: 20px;">
                        <div>
                            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-bottom: 4px;">Payment Method</div>
                            <div style="font-weight: 600; font-size: 14px;">${order.paymentMethod}</div>
                        </div>
                        <div>
                            <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-bottom: 4px;">Status</div>
                            <div style="font-weight: 700; font-size: 14px; text-transform: capitalize; color: #f59e0b;">${order.status}</div>
                        </div>
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--border);">
                            <th style="padding: 8px 0; text-align: left; font-size: 12px; text-transform: uppercase; color: var(--text-muted);">Item</th>
                            <th style="padding: 8px 0; text-align: center; font-size: 12px; text-transform: uppercase; color: var(--text-muted);">Qty</th>
                            <th style="padding: 8px 0; text-align: right; font-size: 12px; text-transform: uppercase; color: var(--text-muted);">Price</th>
                            <th style="padding: 8px 0; text-align: right; font-size: 12px; text-transform: uppercase; color: var(--text-muted);">Total</th>
                        </tr>
                    </thead>
                    <tbody>${itemsHtml}</tbody>
                </table>

                <div style="display: flex; justify-content: flex-end; border-top: 2px solid var(--border); padding-top: 12px;">
                    <div style="text-align: right;">
                        <div style="font-size: 13px; color: var(--text-muted);">Grand Total</div>
                        <div style="font-size: 22px; font-weight: 800; color: var(--accent);">Rs. ${order.totalAmount.toLocaleString()}</div>
                    </div>
                </div>
                
                ${order.paymentSlip ? `
                    <div style="margin-top: 20px;">
                        <div style="font-size: 11px; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em; margin-bottom: 8px;">Payment Slip</div>
                        <a href="${order.paymentSlip}" target="_blank">
                            <img src="${getThumbnailUrl(order.paymentSlip, 400)}" style="width: 100%; border-radius: 8px; border: 1px solid var(--border);">
                        </a>
                    </div>
                ` : ''}
            </div>

            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button class="btn btn-outline" style="flex: 1; justify-content: center; border: none; color: var(--text-muted);" onclick="document.getElementById('saleDetailsModal').style.display='none';">
                    Close
                </button>
            </div>
        `;
    } catch (err) {
        document.getElementById('sdm-body').innerHTML = `<p style="color: #ef4444; text-align: center;">Error: ${err.message}</p>`;
    }
};
