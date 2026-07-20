const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateWaiter, authenticateAdmin } = require('../middleware/auth');

router.post('/', authenticateWaiter, async (req, res) => {
  try {
    const { table_id, items } = req.body;
    const waiter_id = req.user.id;
    if (!table_id || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Table ID and items are required' });
    }

    const [tableRows] = await pool.query('SELECT * FROM tables_ WHERE id = ?', [table_id]);
    if (tableRows.length === 0) {
      return res.status(404).json({ error: 'Table not found' });
    }

    const [activeOrders] = await pool.query(
      "SELECT * FROM orders WHERE table_id = ? AND status = 'active'",
      [table_id]
    );

    let orderId;
    if (activeOrders.length > 0) {
      orderId = activeOrders[0].id;
    } else {
      const [orderResult] = await pool.query(
        'INSERT INTO orders (table_id, waiter_id, status) VALUES (?, ?, ?)',
        [table_id, waiter_id, 'active']
      );
      orderId = orderResult.insertId;
    }

    for (const item of items) {
      const [menuItem] = await pool.query(
        'SELECT m.*, t.percentage as tax_pct FROM menu_items m LEFT JOIN taxes t ON m.tax_id = t.id WHERE m.id = ?',
        [item.menu_item_id]
      );
      if (menuItem.length === 0) continue;
      const mi = menuItem[0];
      const price = mi.price;
      const taxPct = mi.tax_pct || 0;
      const [existingRows] = await pool.query(
        'SELECT id, quantity FROM order_items WHERE order_id = ? AND menu_item_id = ?',
        [orderId, item.menu_item_id]
      );
      if (existingRows.length > 0) {
        await pool.query(
          'UPDATE order_items SET quantity = ?, price = ?, tax_percentage = ? WHERE id = ?',
          [item.quantity || 1, price, taxPct, existingRows[0].id]
        );
      } else {
        await pool.query(
          'INSERT INTO order_items (order_id, menu_item_id, quantity, price, tax_percentage) VALUES (?, ?, ?, ?, ?)',
          [orderId, item.menu_item_id, item.quantity || 1, price, taxPct]
        );
      }
    }

    const [calcResult] = await pool.query(
      'SELECT SUM(quantity * price) as subtotal, SUM(quantity * price * tax_percentage / 100) as tax_amount FROM order_items WHERE order_id = ?',
      [orderId]
    );
    const subtotal = parseFloat(calcResult[0].subtotal) || 0;
    const taxAmount = parseFloat(calcResult[0].tax_amount) || 0;
    const total = subtotal + taxAmount;
    await pool.query(
      'UPDATE orders SET subtotal = ?, tax_amount = ?, total = ? WHERE id = ?',
      [subtotal, taxAmount, total, orderId]
    );

    res.status(201).json({ message: 'Order placed successfully', order_id: orderId });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/table/:tableId', authenticateWaiter, async (req, res) => {
  try {
    const { tableId } = req.params;
    const [orders] = await pool.query(
      "SELECT * FROM orders WHERE table_id = ? AND status = 'active' ORDER BY created_at DESC",
      [tableId]
    );
    if (orders.length === 0) {
      return res.json({ order: null, items: [] });
    }
    const order = orders[0];
    const [items] = await pool.query(
      `SELECT oi.*, m.name as menu_item_name, m.image as menu_item_image, t.name as tax_name 
       FROM order_items oi 
       INNER JOIN menu_items m ON oi.menu_item_id = m.id 
       LEFT JOIN taxes t ON m.tax_id = t.id 
       WHERE oi.order_id = ?`,
      [order.id]
    );
    res.json({ order, items });
  } catch (error) {
    console.error('Get table order error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/complete/:orderId', authenticateWaiter, async (req, res) => {
  try {
    const { orderId } = req.params;
    const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    await pool.query("UPDATE orders SET status = 'completed' WHERE id = ?", [orderId]);
    const tableId = orderRows[0].table_id;
    await pool.query("UPDATE tables_ SET status = 'ready_to_pay' WHERE id = ?", [tableId]);
    res.json({ message: 'Order completed. Table is ready for payment.' });
  } catch (error) {
    console.error('Complete order error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/active', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.*, t.table_number, w.name as waiter_name 
       FROM orders o 
       INNER JOIN tables_ t ON o.table_id = t.id 
       INNER JOIN waiters w ON o.waiter_id = w.id 
       WHERE o.status = 'active' 
       ORDER BY o.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Get active orders error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/completed', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT o.*, t.table_number, w.name as waiter_name 
       FROM orders o 
       INNER JOIN tables_ t ON o.table_id = t.id 
       INNER JOIN waiters w ON o.waiter_id = w.id 
       WHERE o.status = 'completed' 
       ORDER BY o.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Get completed orders error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:orderId/items', authenticateAdmin, async (req, res) => {
  try {
    const [items] = await pool.query(
      `SELECT oi.*, m.name as menu_item_name, t.name as tax_name 
       FROM order_items oi 
       INNER JOIN menu_items m ON oi.menu_item_id = m.id 
       LEFT JOIN taxes t ON m.tax_id = t.id 
       WHERE oi.order_id = ?`,
      [req.params.orderId]
    );
    res.json(items);
  } catch (error) {
    console.error('Get order items error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/completed/full', authenticateAdmin, async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT o.*, t.table_number, w.name as waiter_name 
       FROM orders o 
       INNER JOIN tables_ t ON o.table_id = t.id 
       INNER JOIN waiters w ON o.waiter_id = w.id 
       WHERE o.status = 'completed' 
       ORDER BY o.created_at DESC`
    );
    for (const order of orders) {
      const [items] = await pool.query(
        `SELECT oi.*, m.name as menu_item_name, t.name as tax_name 
         FROM order_items oi 
         INNER JOIN menu_items m ON oi.menu_item_id = m.id 
         LEFT JOIN taxes t ON m.tax_id = t.id 
         WHERE oi.order_id = ?`,
        [order.id]
      );
      order.items = items;
      const [payments] = await pool.query(
        'SELECT * FROM payments WHERE order_id = ?',
        [order.id]
      );
      order.payment = payments.length > 0 ? payments[0] : null;
    }
    res.json(orders);
  } catch (error) {
    console.error('Get full completed orders error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
