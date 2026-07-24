const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
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

  try {
    const [menu] = await pool.query('SELECT id, price FROM menu_items LIMIT 50');
    const [tables] = await pool.query('SELECT id FROM tables_');
    const [waiters] = await pool.query('SELECT id FROM waiters');

    if (menu.length === 0 || tables.length === 0) {
      console.log('Need menu items and tables first. Run seed_full.js if needed.');
      return;
    }

    console.log(`Found ${menu.length} menu items, ${tables.length} tables, ${waiters.length} waiters`);

    // Check if data already exists
    const [existing] = await pool.query('SELECT COUNT(*) as c FROM orders');
    if (existing[0].c > 0) {
      console.log(`Already have ${existing[0].c} orders. Skipping seed.`);
      return;
    }

    const now = new Date();
    let orderId = null;

    for (let day = 30; day >= 0; day--) {
      const ordersToday = 3 + Math.floor(Math.random() * 5);

      for (let o = 0; o < ordersToday; o++) {
        const table = tables[Math.floor(Math.random() * tables.length)];
        const waiter = waiters.length > 0 ? waiters[Math.floor(Math.random() * waiters.length)] : { id: 1 };
        const itemCount = 2 + Math.floor(Math.random() * 4);
        let subtotal = 0;

        const date = new Date(now);
        date.setDate(date.getDate() - day);
        date.setHours(9 + Math.floor(Math.random() * 12));
        date.setMinutes(Math.floor(Math.random() * 60));
        date.setSeconds(0);

        const isCompleted = day < 28 || Math.random() > 0.2;
        const status = isCompleted ? 'completed' : 'active';
        const orderType = Math.random() > 0.3 ? 'dine_in' : 'parcel';

        const [order] = await pool.query(
          'INSERT INTO orders (table_id, waiter_id, status, subtotal, tax_amount, total, order_type, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?)',
          [table.id, waiter.id, status, orderType, date, date]
        );
        orderId = order.insertId;
        const items = [];

        const usedItems = new Set();
        for (let i = 0; i < itemCount; i++) {
          let item;
          let attempts = 0;
          do {
            item = menu[Math.floor(Math.random() * menu.length)];
            attempts++;
          } while (usedItems.has(item.id) && attempts < 20);
          usedItems.add(item.id);
          const qty = 1 + Math.floor(Math.random() * 3);
          const price = parseFloat(item.price);
          subtotal += price * qty;
          items.push([orderId, item.id, qty, price, 0, date]);
        }

        for (const item of items) {
          await pool.query(
            'INSERT IGNORE INTO order_items (order_id, menu_item_id, quantity, price, tax_percentage, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            item
          );
        }

        const tax = parseFloat((subtotal * 0.05).toFixed(2));
        const total = parseFloat((subtotal + tax).toFixed(2));

        await pool.query(
          'UPDATE orders SET subtotal = ?, tax_amount = ?, total = ? WHERE id = ?',
          [subtotal, tax, total, orderId]
        );

        if (isCompleted) {
          const paymentDate = new Date(date);
          paymentDate.setMinutes(paymentDate.getMinutes() + 15 + Math.floor(Math.random() * 30));
          const cashAmount = Math.random() > 0.5 ? total : 0;
          const upiAmount = cashAmount > 0 ? 0 : total;
          const methods = ['cash', 'upi', 'card'];
          const method = methods[Math.floor(Math.random() * methods.length)];

          await pool.query(
            'INSERT INTO payments (order_id, table_id, online_amount, offline_amount, total, status, type, payment_method, cash_amount, upi_amount, card_amount, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [orderId, table.id, method === 'upi' ? total : 0, method === 'cash' ? total : 0, total, 'paid', orderType === 'parcel' ? 'parcel' : 'table', method,
             method === 'cash' ? total : 0, method === 'upi' ? total : 0, method === 'card' ? total : 0, paymentDate]
          );
        }

        if (day === 0 && o === 0) {
          process.stdout.write(`Seeding: day ${30 - day}/${30}...\r`);
        }
      }
    }

    const [orderCount] = await pool.query('SELECT COUNT(*) as c FROM orders');
    const [paymentCount] = await pool.query("SELECT COUNT(*) as c FROM payments WHERE status = 'paid'");
    const [earnings] = await pool.query("SELECT COALESCE(SUM(total),0) as t FROM payments WHERE status = 'paid'");
    console.log(`\nDone! Created ${orderCount[0].c} orders, ${paymentCount[0].c} paid payments, total earnings: ₹${parseFloat(earnings[0].t).toFixed(2)}`);

  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    await pool.end();
  }
})();
