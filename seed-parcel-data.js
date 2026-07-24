const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0
});

const customers = [
  { name: 'Rahul Sharma', phone: '9876543210' },
  { name: 'Priya Patel', phone: '9876543211' },
  { name: 'Amit Singh', phone: '9876543212' },
  { name: 'Sneha Reddy', phone: '9876543213' },
  { name: 'Vikram Joshi', phone: '9876543214' },
  { name: 'Ananya Gupta', phone: '9876543215' },
  { name: 'Arun Nair', phone: '9876543216' },
  { name: 'Divya Menon', phone: '9876543217' },
  { name: 'Karthik Iyer', phone: '9876543218' },
  { name: 'Meera Rao', phone: '9876543219' },
];

const items = [
  { name: 'Butter Chicken', price: 350, qty: [1, 2] },
  { name: 'Biryani', price: 280, qty: [1, 2] },
  { name: 'Paneer Tikka', price: 250, qty: [1, 2] },
  { name: 'Dal Makhani', price: 220, qty: [1] },
  { name: 'Naan Basket', price: 120, qty: [1, 2, 3] },
  { name: 'Chicken Curry', price: 300, qty: [1, 2] },
  { name: 'Veg Fried Rice', price: 180, qty: [1] },
  { name: 'Gobi Manchurian', price: 160, qty: [1] },
  { name: 'Tandoori Chicken', price: 400, qty: [1] },
  { name: 'Fish Curry', price: 320, qty: [1] },
];

const amounts = [420, 580, 850, 1250, 690, 980, 360, 720, 1100, 450, 820, 630, 540, 940, 760];
const methods = ['cash', 'upi', 'card', 'split'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateItems() {
  const count = Math.floor(Math.random() * 4) + 2;
  const selected = [];
  const used = new Set();
  for (let i = 0; i < count; i++) {
    const item = pick(items);
    if (!used.has(item.name)) {
      used.add(item.name);
      selected.push({
        menu_item_name: item.name,
        quantity: pick(item.qty),
        price: item.price,
      });
    }
  }
  return selected;
}

async function seed() {
  const connection = await pool.getConnection();
  try {
    const [existing] = await connection.query(
      "SELECT COUNT(*) as cnt FROM payments WHERE type = 'parcel' AND status = 'paid'"
    );
    if (existing[0].cnt > 5) {
      console.log(`Parcel dummy data already exists (${existing[0].cnt} records). Skipping seed.`);
      return;
    }

    console.log('Seeding parcel dummy data...');

    const now = new Date();
    let inserted = 0;

    for (let dayOffset = 45; dayOffset >= 1; dayOffset--) {
      const date = new Date(now);
      date.setDate(date.getDate() - dayOffset);
      date.setHours(11 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60), 0, 0);

      if (Math.random() > 0.55) continue;

      const customer = pick(customers);
      const total = pick(amounts);
      const cashAmt = Math.random() > 0.5 ? total : 0;
      const upiAmt = cashAmt > 0 ? 0 : total;
      const method = cashAmt > 0 ? 'cash' : 'upi';
      const billNumber = `BILL-P-${date.getTime()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      await connection.query(
        `INSERT INTO payments (order_id, total, status, type, payment_method, cash_amount, upi_amount, bill_number, created_at)
         VALUES (NULL, ?, 'paid', 'parcel', ?, ?, ?, ?, ?)`,
        [total, method, cashAmt, upiAmt, billNumber, date]
      );
      inserted++;
    }

    const dayOffsets = [50, 48, 42, 38, 35, 28, 22, 18, 12, 8, 5, 3];
    for (const dayOffset of dayOffsets) {
      const date = new Date(now);
      date.setDate(date.getDate() - dayOffset);
      date.setHours(12 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 60), 0, 0);

      const customer = pick(customers);
      const total = pick(amounts);
      const parsedItems = JSON.stringify(generateItems());

      await connection.query(
        `INSERT INTO parcel_bills (customer_name, customer_phone, items, total, online_amount, offline_amount, payment_status, created_at)
         VALUES (?, ?, ?, ?, 0, ?, 'paid', ?)`,
        [customer.name, customer.phone, parsedItems, total, total, date]
      );
      inserted++;
    }

    console.log(`Inserted ${inserted} dummy parcel payment records.`);
  } catch (error) {
    console.error('Seed error:', error);
  } finally {
    connection.release();
    await pool.end();
  }
}

seed().then(() => {
  console.log('Seed script completed.');
  process.exit(0);
});
