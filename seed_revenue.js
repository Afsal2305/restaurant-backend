const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 1,
    queueLimit: 0
  });

  // Check existing paid payments date range
  const [existing] = await pool.query(
    "SELECT MIN(DATE_FORMAT(created_at,'%Y-%m-%d')) as first, MAX(DATE_FORMAT(created_at,'%Y-%m-%d')) as last, COUNT(*) as cnt FROM payments WHERE status = 'paid'"
  );
  console.log(`Existing paid payments: ${existing[0].cnt} rows, from ${existing[0].first} to ${existing[0].last}`);

  // Only seed if there's little historical data (≤ 2 days with data)
  const [dayCount] = await pool.query(
    "SELECT COUNT(DISTINCT DATE_FORMAT(created_at,'%Y-%m-%d')) as days FROM payments WHERE status = 'paid'"
  );
  if (dayCount[0].days > 5) {
    console.log(`Already have ${dayCount[0].days} days of data, skipping seed.`);
    pool.end();
    return;
  }

  // Get existing tables to reference
  const [tables] = await pool.query('SELECT id FROM tables_ ORDER BY id');
  if (tables.length === 0) {
    console.log('No tables found, seed some tables first.');
    pool.end();
    return;
  }

  // Seed data for last 30 days (excluding today which already has data)
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;

  // Base revenue pattern with weekday/weekend variation
  const dayRevenuePattern = [
    { dow: 0, min: 5500, max: 9500 },  // Sunday
    { dow: 1, min: 2800, max: 5200 },  // Monday
    { dow: 2, min: 3000, max: 5500 },  // Tuesday
    { dow: 3, min: 3200, max: 5800 },  // Wednesday
    { dow: 4, min: 3500, max: 6200 },  // Thursday
    { dow: 5, min: 4500, max: 8000 },  // Friday
    { dow: 6, min: 6000, max: 11000 }, // Saturday
  ];

  let inserted = 0;

  for (let i = 30; i >= 1; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const dateStr = `${y}-${m}-${day}`;

    if (dateStr === todayStr) continue; // skip today (already has live data)

    const dow = d.getDay();
    const pattern = dayRevenuePattern[dow];
    const dailyTotal = Math.floor(pattern.min + Math.random() * (pattern.max - pattern.min));

    // Create 2-5 orders for this day
    const numOrders = 2 + Math.floor(Math.random() * 4);
    let dayRevenue = 0;
    let orderIds = [];

    for (let o = 0; o < numOrders; o++) {
      // Pick random table
      const table = tables[Math.floor(Math.random() * tables.length)];

      // Random time during the day (10 AM - 10 PM)
      const hour = 10 + Math.floor(Math.random() * 12);
      const minute = Math.floor(Math.random() * 60);
      const second = Math.floor(Math.random() * 60);
      const orderCreated = `${dateStr} ${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:${String(second).padStart(2,'0')}`;

      // Order total (share of daily total)
      const orderTotal = o < numOrders - 1
        ? Math.floor((dailyTotal / numOrders) * (0.5 + Math.random() * 0.5))
        : dailyTotal - dayRevenue;
      dayRevenue += orderTotal;

      // Insert order
      const [orderResult] = await pool.query(
        `INSERT INTO orders (table_id, waiter_id, status, subtotal, tax_amount, total, created_at, updated_at)
         VALUES (?, 1, 'completed', ?, 0, ?, ?, ?)`,
        [table.id, orderTotal, orderTotal, orderCreated, orderCreated]
      );
      const orderId = orderResult.insertId;
      orderIds.push(orderId);

      // Insert payment (5 minutes after order)
      const payCreated = `${dateStr} ${String(hour).padStart(2,'0')}:${String((minute + 5) % 60).padStart(2,'0')}:${String(second).padStart(2,'0')}`;

      await pool.query(
        `INSERT INTO payments (order_id, table_id, online_amount, offline_amount, total, status, type, created_at)
         VALUES (?, ?, ?, ?, ?, 'paid', 'table', ?)`,
        [orderId, table.id, Math.floor(orderTotal * 0.6), orderTotal - Math.floor(orderTotal * 0.6), orderTotal, payCreated]
      );
      inserted++;
    }
  }

  console.log(`Seeded ${inserted} payments across the last 30 days.`);
  console.log('Revenue trend should now display a populated chart.');

  pool.end();
})();
