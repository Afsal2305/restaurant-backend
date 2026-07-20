const express = require('express');
const cors = require('cors');
const path = require('path');
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

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

app.get('/api/health', (req, res) => {
  res.json({ message: 'Hotel Management System API is running' });
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
