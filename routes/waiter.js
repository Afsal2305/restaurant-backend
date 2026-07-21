const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateWaiter } = require('../middleware/auth');

router.get('/tables', authenticateWaiter, async (req, res) => {
  try {
    const waiterId = req.user.id;
    const [rows] = await pool.query(
      `SELECT t.* FROM tables_ t 
       INNER JOIN waiter_tables wt ON t.id = wt.table_id 
       WHERE wt.waiter_id = ?`,
      [waiterId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Get waiter tables error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/active-orders', authenticateWaiter, async (req, res) => {
  try {
    const waiterId = req.user.id;
    const [rows] = await pool.query(
      `SELECT o.*, t.table_number FROM orders o 
       INNER JOIN tables_ t ON o.table_id = t.id 
       WHERE o.waiter_id = ? AND o.status = 'active'`,
      [waiterId]
    );
    for (const order of rows) {
      const [items] = await pool.query(
        `SELECT oi.*, m.name as menu_item_name, m.image as menu_item_image, t.name as tax_name 
         FROM order_items oi 
         INNER JOIN menu_items m ON oi.menu_item_id = m.id 
         LEFT JOIN taxes t ON m.tax_id = t.id 
         WHERE oi.order_id = ?`,
        [order.id]
      );
      order.items = items;
    }
    res.json(rows);
  } catch (error) {
    console.error('Get active orders error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/categories', authenticateWaiter, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categories ORDER BY name');
    res.json(rows);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/menu-items', authenticateWaiter, async (req, res) => {
  try {
    const { category_id } = req.query;
    let query = `SELECT m.*, c.name as category_name, t.name as tax_name, t.percentage as tax_percentage 
                 FROM menu_items m 
                 LEFT JOIN categories c ON m.category_id = c.id 
                 LEFT JOIN taxes t ON m.tax_id = t.id`;
    let params = [];
    if (category_id) {
      query += ' WHERE m.category_id = ?';
      params.push(category_id);
    }
    query += ' ORDER BY m.name';
    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Get menu items error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/profile', authenticateWaiter, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, username, image, created_at FROM waiters WHERE id = ?',
      [req.user.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Waiter not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/orders/completed', authenticateWaiter, async (req, res) => {
  try {
    const waiterId = req.user.id;
    const [orders] = await pool.query(
      `SELECT o.*, t.table_number,
              CASE
                WHEN o.order_type IN ('parcel', 'take_away', 'delivery') THEN 'paid'
                WHEN EXISTS (SELECT 1 FROM payments WHERE order_id = o.id AND status = 'paid') THEN 'paid'
                ELSE 'unpaid'
              END as payment_status
       FROM orders o 
       INNER JOIN tables_ t ON o.table_id = t.id 
       WHERE o.waiter_id = ? AND o.status = 'completed' 
       ORDER BY o.created_at DESC`,
      [waiterId]
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
    }
    res.json(orders);
  } catch (error) {
    console.error('Get waiter completed orders error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
