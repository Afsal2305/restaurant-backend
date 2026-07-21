const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { authenticateAdmin, authenticateWaiter } = require('../middleware/auth');

const authenticateAny = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role === 'admin' || decoded.role === 'waiter') {
      req.user = decoded;
      return next();
    }
    return res.status(403).json({ error: 'Access denied. Invalid role.' });
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

router.post('/', authenticateAny, async (req, res) => {
  try {
    const { table_id, items, order_type, customer_name, customer_phone, customer_address,
            delivery_charge, packing_charge, parcel_charge, notes, instructions, delivery_boy } = req.body;
    const waiter_id = req.user.id || req.user.userId;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' });
    }

    const orderType = order_type || 'dine_in';

    if (table_id && orderType === 'dine_in') {
      const [tableRows] = await pool.query('SELECT * FROM tables_ WHERE id = ?', [table_id]);
      if (tableRows.length === 0) {
        return res.status(404).json({ error: 'Table not found' });
      }
    }

    let orderId;
    if (table_id && orderType === 'dine_in') {
      const [activeOrders] = await pool.query(
        "SELECT * FROM orders WHERE table_id = ? AND status = 'active'",
        [table_id]
      );
      if (activeOrders.length > 0) {
        orderId = activeOrders[0].id;
      }
    }

    if (!orderId) {
      const [orderResult] = await pool.query(
        `INSERT INTO orders (table_id, waiter_id, status, order_type, customer_name, customer_phone, customer_address,
          delivery_charge, packing_charge, parcel_charge, instructions, delivery_boy)
         VALUES (?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [table_id || null, waiter_id, orderType, customer_name || null, customer_phone || null,
         customer_address || null, parseFloat(delivery_charge || 0), parseFloat(packing_charge || 0),
         parseFloat(parcel_charge || 0), notes || instructions || null, delivery_boy || null]
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
      const price = parseFloat(item.price) || parseFloat(mi.price);
      const taxPct = mi.tax_pct || 0;
      const [existingRows] = await pool.query(
        'SELECT id, quantity FROM order_items WHERE order_id = ? AND menu_item_id = ?',
        [orderId, item.menu_item_id]
      );
      if (existingRows.length > 0) {
        await pool.query(
          'UPDATE order_items SET quantity = quantity + ?, price = ?, tax_percentage = ?, notes = ?, variant_name = ?, addon_names = ? WHERE id = ?',
          [item.quantity || 1, price, taxPct, item.notes || null, item.variant_name || null,
           item.addon_names ? JSON.stringify(item.addon_names) : null, existingRows[0].id]
        );
      } else {
        await pool.query(
          `INSERT INTO order_items (order_id, menu_item_id, quantity, price, tax_percentage, notes, variant_name, addon_names)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [orderId, item.menu_item_id, item.quantity || 1, price, taxPct, item.notes || null,
           item.variant_name || null, item.addon_names ? JSON.stringify(item.addon_names) : null]
        );
      }
    }

    const [calcResult] = await pool.query(
      'SELECT SUM(quantity * price) as subtotal, SUM(quantity * price * tax_percentage / 100) as tax_amount FROM order_items WHERE order_id = ?',
      [orderId]
    );
    const subtotal = parseFloat(calcResult[0].subtotal) || 0;
    const taxAmount = parseFloat(calcResult[0].tax_amount) || 0;
    const dc = parseFloat(delivery_charge || 0);
    const pc = parseFloat(packing_charge || 0);
    const parc = parseFloat(parcel_charge || 0);
    const total = subtotal + taxAmount + dc + pc + parc;

    await pool.query(
      'UPDATE orders SET subtotal = ?, tax_amount = ?, total = ? WHERE id = ?',
      [subtotal, taxAmount, total, orderId]
    );

    if (table_id && orderType === 'dine_in') {
      await pool.query("UPDATE tables_ SET status = 'occupied' WHERE id = ?", [table_id]);
    }

    res.status(201).json({ message: 'Order placed successfully', order_id: orderId });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Server error', details: error.message });
  }
});

router.get('/table/:tableId', authenticateAny, async (req, res) => {
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
      `SELECT oi.*, m.name as menu_item_name, m.image as menu_item_image, m.food_type,
              t.name as tax_name, t.percentage as tax_percentage
       FROM order_items oi
       INNER JOIN menu_items m ON oi.menu_item_id = m.id
       LEFT JOIN taxes t ON m.tax_id = t.id
       WHERE oi.order_id = ?`,
      [order.id]
    );
    const [kots] = await pool.query(
      "SELECT * FROM kot WHERE order_id = ? ORDER BY created_at DESC",
      [order.id]
    );
    res.json({ order, items, kots });
  } catch (error) {
    console.error('Get table order error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:orderId', authenticateAny, async (req, res) => {
  try {
    const { items, customer_name, customer_phone, customer_address, notes, delivery_boy,
            expected_delivery_time, hold } = req.body;
    const { orderId } = req.params;

    const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (customer_name !== undefined || customer_phone !== undefined || customer_address !== undefined ||
        notes !== undefined || delivery_boy !== undefined || expected_delivery_time !== undefined || hold !== undefined) {
      await pool.query(
        `UPDATE orders SET customer_name = COALESCE(?, customer_name), customer_phone = COALESCE(?, customer_phone),
         customer_address = COALESCE(?, customer_address), instructions = COALESCE(?, instructions),
         delivery_boy = COALESCE(?, delivery_boy), expected_delivery_time = COALESCE(?, expected_delivery_time),
         hold = COALESCE(?, hold)
         WHERE id = ?`,
        [customer_name, customer_phone, customer_address, notes, delivery_boy, expected_delivery_time, hold, orderId]
      );
    }

    if (items && Array.isArray(items)) {
      for (const item of items) {
        if (item.delete) {
          await pool.query('DELETE FROM order_items WHERE id = ? AND order_id = ?', [item.id, orderId]);
        } else if (item.id) {
          await pool.query(
            'UPDATE order_items SET quantity = ?, notes = ?, variant_name = ?, addon_names = ? WHERE id = ? AND order_id = ?',
            [item.quantity, item.notes || null, item.variant_name || null,
             item.addon_names ? JSON.stringify(item.addon_names) : null, item.id, orderId]
          );
        } else {
          const [menuItem] = await pool.query(
            'SELECT m.*, t.percentage as tax_pct FROM menu_items m LEFT JOIN taxes t ON m.tax_id = t.id WHERE m.id = ?',
            [item.menu_item_id]
          );
          if (menuItem.length > 0) {
            await pool.query(
              `INSERT INTO order_items (order_id, menu_item_id, quantity, price, tax_percentage, notes, variant_name, addon_names)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [orderId, item.menu_item_id, item.quantity || 1, menuItem[0].price, menuItem[0].tax_pct || 0,
               item.notes || null, item.variant_name || null,
               item.addon_names ? JSON.stringify(item.addon_names) : null]
            );
          }
        }
      }
    }

    const [calcResult] = await pool.query(
      'SELECT SUM(quantity * price) as subtotal, SUM(quantity * price * tax_percentage / 100) as tax_amount FROM order_items WHERE order_id = ?',
      [orderId]
    );
    const subtotal = parseFloat(calcResult[0].subtotal) || 0;
    const taxAmount = parseFloat(calcResult[0].tax_amount) || 0;
    await pool.query(
      'UPDATE orders SET subtotal = ?, tax_amount = ?, total = ? WHERE id = ?',
      [subtotal, taxAmount, subtotal + taxAmount, orderId]
    );

    res.json({ message: 'Order updated successfully' });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/complete/:orderId', authenticateAny, async (req, res) => {
  try {
    const { orderId } = req.params;
    const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    await pool.query("UPDATE orders SET status = 'completed' WHERE id = ?", [orderId]);
    const tableId = orderRows[0].table_id;
    if (tableId) {
      await pool.query("UPDATE tables_ SET status = 'ready_to_pay' WHERE id = ?", [tableId]);
    }
    res.json({ message: 'Order completed. Ready for payment.' });
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
       LEFT JOIN tables_ t ON o.table_id = t.id
       LEFT JOIN waiters w ON o.waiter_id = w.id
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
      `SELECT o.*, t.table_number, w.name as waiter_name,
              CASE
                WHEN o.order_type IN ('parcel', 'take_away', 'delivery') THEN 'paid'
                WHEN EXISTS (SELECT 1 FROM payments WHERE order_id = o.id AND status = 'paid') THEN 'paid'
                ELSE 'unpaid'
              END as payment_status
       FROM orders o
       LEFT JOIN tables_ t ON o.table_id = t.id
       LEFT JOIN waiters w ON o.waiter_id = w.id
       WHERE o.status = 'completed'
       ORDER BY o.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Get completed orders error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/all', authenticateAdmin, async (req, res) => {
  try {
    const { status, order_type, from, to, search } = req.query;
    let query = `SELECT o.*, t.table_number, w.name as waiter_name
                 FROM orders o
                 LEFT JOIN tables_ t ON o.table_id = t.id
                 LEFT JOIN waiters w ON o.waiter_id = w.id
                 WHERE 1=1`;
    let params = [];

    if (status) { query += ' AND o.status = ?'; params.push(status); }
    if (order_type) { query += ' AND o.order_type = ?'; params.push(order_type); }
    if (from) { query += ' AND o.created_at >= ?'; params.push(from + ' 00:00:00'); }
    if (to) { query += ' AND o.created_at <= ?'; params.push(to + ' 23:59:59'); }
    if (search) {
      query += ' AND (o.customer_name LIKE ? OR o.customer_phone LIKE ? OR t.table_number LIKE ? OR o.id LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    query += ' ORDER BY o.created_at DESC LIMIT 100';
    const [rows] = await pool.query(query, params);

    for (const order of rows) {
      const [items] = await pool.query(
        `SELECT oi.*, m.name as menu_item_name, m.image as menu_item_image
         FROM order_items oi
         INNER JOIN menu_items m ON oi.menu_item_id = m.id
         WHERE oi.order_id = ?`,
        [order.id]
      );
      order.items = items;
      const [payments] = await pool.query(
        'SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1',
        [order.id]
      );
      order.payment = payments.length > 0 ? payments[0] : null;
    }
    res.json(rows);
  } catch (error) {
    console.error('Get all orders error:', error);
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
       LEFT JOIN tables_ t ON o.table_id = t.id
       LEFT JOIN waiters w ON o.waiter_id = w.id
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

router.get('/:orderId', authenticateAny, async (req, res) => {
  try {
    const { orderId } = req.params;
    const [orderRows] = await pool.query(
      `SELECT o.*, t.table_number, w.name as waiter_name
       FROM orders o
       LEFT JOIN tables_ t ON o.table_id = t.id
       LEFT JOIN waiters w ON o.waiter_id = w.id
       WHERE o.id = ?`,
      [orderId]
    );
    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderRows[0];
    const [items] = await pool.query(
      `SELECT oi.*, m.name as menu_item_name, m.image as menu_item_image, m.food_type
       FROM order_items oi
       INNER JOIN menu_items m ON oi.menu_item_id = m.id
       WHERE oi.order_id = ?`,
      [orderId]
    );
    order.items = items;
    const [kots] = await pool.query(
      "SELECT * FROM kot WHERE order_id = ? ORDER BY created_at DESC",
      [orderId]
    );
    order.kots = kots;
    res.json(order);
  } catch (error) {
    console.error('Get order by ID error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
