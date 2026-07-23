const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET 
});

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// MongoDB Connection configuration for Serverless
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/quickbill';

const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) return;
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000 // Timeout after 5s instead of 30s
    });
    console.log('MongoDB Connected to:', MONGO_URI.includes('@') ? MONGO_URI.split('@')[1].split('/')[0] : 'localhost');
  } catch (err) {
    console.error('CRITICAL: MongoDB connection error:', err);
  }
};

// Middleware to ensure DB connection before handling API routes
app.use('/api', async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    res.status(500).json({ error: 'Database connection failed: ' + err.message });
  }
});

// --- Schemas & Models ---

const productSchema = new mongoose.Schema({
  name: String,
  price: Number,
  image: String,
  size: String, // S, M, L, XL
  color: String,
  stock: { type: Number, default: 0 },
  isFeatured: { type: Boolean, default: false },
  category: String
});

const Product = mongoose.model('Product', productSchema);

const saleSchema = new mongoose.Schema({
  invoiceNumber: String,
  customerName: { type: String, default: 'Walking Customer' },
  customerPhone: { type: String, default: '' },
  deliveryAddress: { type: String, default: '' },
  source: { type: String, default: 'pos' }, // 'pos' or 'online'
  onlineOrderId: { type: String, default: '' },
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      name: String,
      quantity: Number,
      price: Number,
      total: Number
    }
  ],
  totalAmount: Number,
  totalProfit: Number,
  date: { type: Date, default: Date.now }
});

const Sale = mongoose.model('Sale', saleSchema);

const settingsSchema = new mongoose.Schema({
  shopName: { type: String, default: 'Wasana Supermarket & Retail' },
  shopLogo: { type: String, default: '' },
  shopPhone: { type: String, default: '011 234 5678' },
  whatsappNumber: { type: String, default: '077 123 4567' },
  shopAddress: { type: String, default: 'No. 120, Galle Road, Colombo 03, Sri Lanka' },
  shopEmail: { type: String, default: 'info@wasanasuper.lk' },
  showLogoOnInvoice: { type: Boolean, default: true },
  showPhoneOnInvoice: { type: Boolean, default: true },

  enableOnlineShop: { type: Boolean, default: true },
  showProductImages: { type: Boolean, default: true },
  showOutOfStock: { type: Boolean, default: false },
  showWhatsappOrderBtn: { type: Boolean, default: true },
  themeColor: { type: String, default: '#00a86b' },
  bannerMessage: { type: String, default: 'දිවයින පුරා බෙදාහැරීම් (Islandwide Delivery) | Cash on Delivery Available' },

  invoicePrefix: { type: String, default: 'QB-' },
  currency: { type: String, default: 'Rs.' },
  autoInvoiceNumber: { type: Boolean, default: true },
  showAddressOnInvoice: { type: Boolean, default: true },

  // Keep old fields
  logo: { type: String, default: '' },
  coverImage: { type: String, default: '' },
  facebookUrl: { type: String, default: 'https://facebook.com' },
  instagramUrl: { type: String, default: 'https://instagram.com' },
  aboutText: { type: String, default: 'Welcome to Wasana Supermarket! We provide high quality products across Sri Lanka with fast islandwide delivery.' },

  // Bank Details (for online shop bank transfer)
  bankName: { type: String, default: 'Commercial Bank of Ceylon' },
  accountName: { type: String, default: 'Wasana Supermarket (Pvt) Ltd' },
  accountNumber: { type: String, default: '1000 458 921' },
  bankBranch: { type: String, default: 'Kollupitiya Branch' },
  bankNote: { type: String, default: 'Please upload your bank payment slip to confirm your order.' }
});

const Settings = mongoose.model('Settings', settingsSchema);

const reviewSchema = new mongoose.Schema({
  name: String,
  rating: Number,
  comment: String,
  date: { type: Date, default: Date.now }
});

const Review = mongoose.model('Review', reviewSchema);

// --- Online Orders (separate from POS sales) ---
const onlineOrderSchema = new mongoose.Schema({
  onlineOrderId: { type: String, required: true },
  customerName: { type: String, default: '' },
  deliveryAddress: { type: String, default: '' },
  paymentMethod: { type: String, default: 'Cash on Delivery (COD)' },
  paymentSlip: { type: String, default: '' }, // Cloudinary URL of uploaded slip
  items: [
    {
      productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
      name: String,
      quantity: Number,
      price: Number,
      total: Number
    }
  ],
  totalAmount: Number,
  status: { type: String, default: 'pending' }, // pending / confirmed / delivered
  date: { type: Date, default: Date.now }
});

const OnlineOrder = mongoose.model('OnlineOrder', onlineOrderSchema);

// --- File Upload Setup ---
const uploadDir = process.env.NODE_ENV === 'production' || process.env.VERCEL 
  ? os.tmpdir() 
  : path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// --- API Routes ---

// 1. Auth (Simple simulation as requested)
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin123' && password === 'admin123') {
    res.json({ success: true, message: 'Logged in successfully' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
});

// 2. Products
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    const { name, price, size, color, stock, category, isFeatured } = req.body;
    let imageUrl = '';
    
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'quickbill/products'
      });
      imageUrl = result.secure_url;
      fs.unlinkSync(req.file.path); // remove temp file
    }
    
    const newProduct = new Product({
      name,
      price: parseFloat(price),
      image: imageUrl,
      size,
      color,
      stock: parseInt(stock),
      category,
      isFeatured: isFeatured === 'true' || isFeatured === true
    });
    await newProduct.save();
    res.json(newProduct);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', upload.single('image'), async (req, res) => {
  try {
    const { name, price, size, color, stock, category, isFeatured } = req.body;
    const updateData = {
      name,
      price: parseFloat(price),
      size,
      color,
      stock: parseInt(stock),
      category,
      isFeatured: isFeatured === 'true' || isFeatured === true
    };
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, {
        folder: 'quickbill/products'
      });
      updateData.image = result.secure_url;
      fs.unlinkSync(req.file.path); // remove temp file
    }
    const updated = await Product.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Billing & Sales
// Get a single sale by ID (for re-generating invoice JPG)
app.get('/api/sales/:id', async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ error: 'Sale not found' });
    res.json(sale);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/sales', async (req, res) => {
  try {
    const { items, totalAmount, customerName, customerPhone, deliveryAddress, source, onlineOrderId } = req.body;
    console.log('Incoming Sale Request:', { customerName, customerPhone, source, itemsCount: items.length });
    
    // 1. Generate Invoice Number based on settings
    const settings = await Settings.findOne();
    const prefix = settings ? (settings.invoicePrefix || 'QB') : 'QB';
    const count = await Sale.countDocuments({ source: { $ne: 'online' } });
    const invoiceNumber = `${prefix}${String(count + 1).padStart(5, '0')}`;
    
    const totalProfit = totalAmount * 0.3; 

    const newSale = new Sale({
      invoiceNumber,
      customerName: customerName || 'Walking Customer',
      customerPhone: customerPhone || '',
      deliveryAddress: deliveryAddress || '',
      source: source || 'pos',
      onlineOrderId: onlineOrderId || '',
      items,
      totalAmount,
      totalProfit
    });

    // Update stock levels
    for (const item of items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity }
      });
    }

    await newSale.save();
    res.json(newSale);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/summary', async (req, res) => {
  try {
    const sales = await Sale.find({ source: { $ne: 'online' } });
    const totalSales = sales.reduce((sum, s) => sum + s.totalAmount, 0);
    const totalProfit = sales.reduce((sum, s) => sum + s.totalProfit, 0);
    
    const products = await Product.find();
    const lowStock = products.filter(p => p.stock < 10);
    
    // Mock best selling (could be aggregated properly)
    const bestSelling = products.slice(0, 3); 

    res.json({
      totalSales,
      totalProfit,
      lowStockCount: lowStock.length,
      totalItems: products.length,
      bestSelling
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reports/daily', async (req, res) => {
    try {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const sales = await Sale.find({ 
          date: { $gte: startOfDay },
          source: { $ne: 'online' }
        });
        res.json(sales);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Settings & Shop Generation
app.get('/api/settings', async (req, res) => {
  let settings = await Settings.findOne();
  if (!settings) {
    settings = new Settings();
    await settings.save();
  }
  res.json(settings);
});

app.post('/api/settings', async (req, res) => {
  let settings = await Settings.findOne();
  if (!settings) settings = new Settings();
  
  Object.keys(req.body).forEach(key => {
    // Explicitly allow bank fields and others in schema
    if ((settingsSchema.paths[key] || key.startsWith('bank') || key.includes('Account')) && key !== '_id' && key !== '__v') {
      settings[key] = req.body[key];
    }
  });

  await settings.save();
  res.json(settings);
});

// System Data Endpoints
app.get('/api/system/backup', async (req, res) => {
  try {
    const products = await Product.find();
    const sales = await Sale.find();
    const settings = await Settings.findOne();
    res.json({ products, sales, settings });
  } catch(err) {
    res.status(500).json({error: err.message});
  }
});

app.post('/api/system/restore', async (req, res) => {
    try {
        const { products, sales, settings } = req.body;
        if (products) {
            await Product.deleteMany({});
            await Product.insertMany(products);
        }
        if (sales) {
            await Sale.deleteMany({});
            await Sale.insertMany(sales);
        }
        if (settings) {
            await Settings.deleteMany({});
            const s = new Settings(settings);
            await s.save();
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/system/products', async (req, res) => {
  try {
    await Product.deleteMany({});
    res.json({success: true});
  } catch(err) {
    res.status(500).json({error: err.message});
  }
});

app.delete('/api/system/reset', async (req, res) => {
  try {
    await Product.deleteMany({});
    await Sale.deleteMany({});
    await Settings.deleteMany({});
    res.json({success: true});
  } catch(err) {
    res.status(500).json({error: err.message});
  }
});

// Seed Sri Lanka Products Route
app.post('/api/system/seed-srilanka', async (req, res) => {
  try {
    const slProducts = [
      { name: "Dilmah Premium Ceylon Tea 100g", price: 450, stock: 50, category: "Groceries & Tea", isFeatured: true, image: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500" },
      { name: "Munchee Super Cream Cracker 125g", price: 190, stock: 100, category: "Biscuits & Bakery", isFeatured: true, image: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?w=500" },
      { name: "Maliban Chocolate Biscuits 100g", price: 160, stock: 80, category: "Biscuits & Bakery", isFeatured: false, image: "https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?w=500" },
      { name: "Keells Chicken Sausages 500g", price: 980, stock: 40, category: "Frozen & Meat", isFeatured: true, image: "https://images.unsplash.com/photo-1528825871115-3581a5387919?w=500" },
      { name: "MD Mixed Fruit Jam 300g", price: 520, stock: 35, category: "Groceries & Spreads", isFeatured: false, image: "https://images.unsplash.com/photo-1598153346810-860daafc16c4?w=500" },
      { name: "Kothmale Pasteurized Fresh Milk 1L", price: 480, stock: 30, category: "Dairy & Beverages", isFeatured: true, image: "https://images.unsplash.com/photo-1563636619-e9143da7973b?w=500" },
      { name: "Samaposha Nutritional Cereal 200g", price: 210, stock: 75, category: "Breakfast & Health", isFeatured: true, image: "https://images.unsplash.com/photo-1517456793572-1d8efd6dc135?w=500" },
      { name: "Anchor Full Cream Milk Powder 400g", price: 1050, stock: 45, category: "Dairy & Beverages", isFeatured: true, image: "https://images.unsplash.com/photo-1550583724-b2692b85b150?w=500" },
      { name: "Sri Lanka Suwandel Traditional Rice 1kg", price: 340, stock: 60, category: "Rice & Grains", isFeatured: false, image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500" }
    ];

    await Product.deleteMany({});
    const inserted = await Product.insertMany(slProducts);
    
    // Also set default Sri Lankan settings
    let settings = await Settings.findOne();
    if (!settings) settings = new Settings();
    settings.shopName = 'Wasana Supermarket & Retail';
    settings.shopPhone = '011 234 5678';
    settings.whatsappNumber = '077 123 4567';
    settings.shopAddress = 'No. 120, Galle Road, Colombo 03, Sri Lanka';
    settings.currency = 'Rs.';
    settings.bannerMessage = 'දිවයින පුරා බෙදාහැරීම් (Islandwide Delivery) | Cash on Delivery Available';
    await settings.save();

    res.json({ success: true, count: inserted.length, products: inserted });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// New Upload Route for Shop Assets
app.post('/api/upload-asset', upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).send('No file uploaded.');
  try {
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: 'quickbill/assets'
    });
    fs.unlinkSync(req.file.path); // remove temp file
    res.json({ url: result.secure_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Online Orders (separate from POS sales - no invoice)
app.post('/api/online-orders', upload.single('paymentSlip'), async (req, res) => {
  try {
    const { onlineOrderId, customerName, deliveryAddress, paymentMethod, totalAmount, items } = req.body;
    console.log('Online Order Received:', { onlineOrderId, customerName, paymentMethod });
    const parsedItems = typeof items === 'string' ? JSON.parse(items) : items;

    let slipUrl = '';
    if (req.file) {
      const result = await cloudinary.uploader.upload(req.file.path, { folder: 'quickbill/slips' });
      slipUrl = result.secure_url;
      fs.unlinkSync(req.file.path);
    }

    // Deduct stock
    for (const item of parsedItems) {
      if (item.productId) {
        await Product.findByIdAndUpdate(item.productId, { $inc: { stock: -item.quantity } });
      }
    }

    const order = new OnlineOrder({
      onlineOrderId,
      customerName,
      deliveryAddress,
      paymentMethod,
      paymentSlip: slipUrl,
      items: parsedItems,
      totalAmount: parseFloat(totalAmount),
      status: 'pending'
    });
    console.log('Final Online Order Object:', order);
    await order.save();
    console.log('✅ Online Order Saved to DB:', order._id);
    res.json(order);
  } catch (err) {
    console.error('❌ Error Saving Online Order:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/online-orders', async (req, res) => {
  try {
    const orders = await OnlineOrder.find().sort({ date: -1 });
    console.log('Fetching Online Orders. Count:', orders.length);
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/online-orders/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    const order = await OnlineOrder.findByIdAndUpdate(req.params.id, { status }, { new: true });
    res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Reviews

app.get('/api/reviews', async (req, res) => {
  try {
    const reviews = await Review.find().sort({ date: -1 }).limit(5);
    res.json(reviews);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { name, rating, comment } = req.body;
    const newReview = new Review({ name, rating: parseInt(rating), comment });
    await newReview.save();
    res.json(newReview);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

module.exports = app;
