const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const { createTables } = require('./config/db');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const waiterRoutes = require('./routes/waiter');
const tableRoutes = require('./routes/table');
const categoryRoutes = require('./routes/category');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/order');
const paymentRoutes = require('./routes/payment');
const dashboardRoutes = require('./routes/dashboard');
const parcelRoutes = require('./routes/parcel');
const taxRoutes = require('./routes/tax');
const kitchenRoutes = require('./routes/kitchen');
const settingsRoutes = require('./routes/settings');
const billingRoutes = require('./routes/billing');
const printerRoutes = require('./routes/printer');

const app = express();

app.use(helmet());
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/auth', authLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/waiter', waiterRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/parcel', parcelRoutes);
app.use('/api/taxes', taxRoutes);
app.use('/api/kitchen', kitchenRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/printer', printerRoutes);

app.get('/api/health', (req, res) => {
  res.json({ message: 'Hotel Management System API is running' });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const PORT = process.env.PORT || 5000;

createTables().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
