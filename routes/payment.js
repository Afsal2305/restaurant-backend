const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateAdmin } = require('../middleware/auth');

router.get('/ready-tables', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT t.* FROM tables_ t WHERE t.status = 'ready_to_pay' ORDER BY CAST(t.table_number AS UNSIGNED)"
    );
    res.json(rows);
  } catch (error) {
    console.error('Get ready tables error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/table-bill/:tableId', authenticateAdmin, async (req, res) => {
  try {
    const { tableId } = req.params;
    const [tableRows] = await pool.query('SELECT * FROM tables_ WHERE id = ?', [tableId]);
    if (tableRows.length === 0) {
      return res.status(404).json({ error: 'Table not found' });
    }
    const [orders] = await pool.query(
      `SELECT o.* FROM orders o
       WHERE o.table_id = ? AND o.status = 'completed'
       AND o.id NOT IN (SELECT p.order_id FROM payments p WHERE p.table_id = ? AND p.status = 'paid' AND p.order_id IS NOT NULL)
       ORDER BY o.created_at DESC`,
      [tableId, tableId]
    );
    if (orders.length === 0) {
      return res.status(404).json({ error: 'No completed orders found for this table' });
    }
    const latestOrder = orders[0];
    let allItems = [];
    let subtotalSum = 0;
    let taxSum = 0;
    let totalSum = 0;
    for (const order of orders) {
      const [items] = await pool.query(
        `SELECT oi.*, m.name as menu_item_name, t.name as tax_name 
         FROM order_items oi 
         INNER JOIN menu_items m ON oi.menu_item_id = m.id 
         LEFT JOIN taxes t ON m.tax_id = t.id 
         WHERE oi.order_id = ?`,
        [order.id]
      );
      for (const item of items) {
        const existing = allItems.find(i => i.menu_item_id === item.menu_item_id);
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          allItems.push({ ...item });
        }
      }
      subtotalSum += parseFloat(order.subtotal || 0);
      taxSum += parseFloat(order.tax_amount || 0);
      totalSum += parseFloat(order.total || 0);
    }
    const [paymentRows] = await pool.query(
      'SELECT * FROM payments WHERE table_id = ? ORDER BY created_at DESC LIMIT 1',
      [tableId]
    );
    res.json({
      table: tableRows[0],
      order: { ...latestOrder, subtotal: subtotalSum, tax_amount: taxSum, total: totalSum },
      items: allItems,
      payment: paymentRows.length > 0 ? paymentRows[0] : null
    });
  } catch (error) {
    console.error('Get table bill error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/process', authenticateAdmin, async (req, res) => {
  try {
    const { order_id, table_id, online_amount, offline_amount } = req.body;
    if (!order_id || !table_id) {
      return res.status(400).json({ error: 'Order ID and table ID are required' });
    }

    const [orders] = await pool.query(
      `SELECT o.* FROM orders o
       WHERE o.table_id = ? AND o.status = 'completed'
       AND o.id NOT IN (SELECT p.order_id FROM payments p WHERE p.table_id = ? AND p.status = 'paid' AND p.order_id IS NOT NULL)`,
      [table_id, table_id]
    );
    let actualTotal = 0;
    for (const order of orders) {
      actualTotal += parseFloat(order.total || 0);
    }

    const paidAmount = parseFloat(online_amount || 0) + parseFloat(offline_amount || 0);
    if (paidAmount < actualTotal) {
      return res.status(400).json({
        error: `Payment amount (₹${paidAmount.toFixed(2)}) is less than the total due (₹${actualTotal.toFixed(2)})`
      });
    }
    if (paidAmount > actualTotal * 1.5) {
      return res.status(400).json({
        error: `Payment amount (₹${paidAmount.toFixed(2)}) exceeds reasonable limit for total (₹${actualTotal.toFixed(2)})`
      });
    }

    const latestUnpaidOrderId = orders.length > 0 ? orders[0].id : order_id;
    const [result] = await pool.query(
      `INSERT INTO payments (order_id, table_id, online_amount, offline_amount, total, status, type) 
       VALUES (?, ?, ?, ?, ?, 'paid', 'table')`,
      [latestUnpaidOrderId, table_id, online_amount || 0, offline_amount || 0, paidAmount]
    );

    await pool.query("UPDATE tables_ SET status = 'open' WHERE id = ?", [table_id]);
    res.status(201).json({ message: 'Payment processed successfully', total: paidAmount, id: result.insertId });
  } catch (error) {
    console.error('Process payment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, t.table_number FROM payments p 
       LEFT JOIN tables_ t ON p.table_id = t.id 
       WHERE p.type = 'table' 
       ORDER BY p.created_at DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/parcel-bills', authenticateAdmin, async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT o.*, w.name as waiter_name
       FROM orders o
       LEFT JOIN waiters w ON o.waiter_id = w.id
       WHERE o.order_type = 'parcel' AND o.status = 'completed'
       AND o.id NOT IN (SELECT order_id FROM payments WHERE status = 'paid' AND order_id IS NOT NULL)
       ORDER BY o.created_at DESC`
    );
    for (const order of orders) {
      const [items] = await pool.query(
        `SELECT oi.*, m.name as menu_item_name, m.image as menu_item_image
         FROM order_items oi
         INNER JOIN menu_items m ON oi.menu_item_id = m.id
         WHERE oi.order_id = ?`,
        [order.id]
      );
      order.items = items;
    }
    res.json(orders);
  } catch (error) {
    console.error('Get parcel bills error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/all-tables', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT t.*,
        COALESCE(bills.bill_total, 0) AS bill_total,
        lo.id AS lo_id, lo.subtotal AS lo_subtotal, lo.tax_amount AS lo_tax_amount,
        lo.total AS lo_total, lo.created_at AS lo_created_at,
        p.id AS p_id, p.total AS p_total, p.online_amount AS p_online_amount,
        p.offline_amount AS p_offline_amount, p.status AS p_status,
        p.created_at AS p_created_at
      FROM tables_ t
      LEFT JOIN (
        SELECT table_id, SUM(total) AS bill_total
        FROM orders
        WHERE status = 'completed'
        AND id NOT IN (SELECT order_id FROM payments WHERE status = 'paid' AND order_id IS NOT NULL)
        GROUP BY table_id
      ) bills ON bills.table_id = t.id
      LEFT JOIN (
        SELECT o1.* FROM orders o1
        WHERE o1.status = 'completed'
        AND o1.id NOT IN (SELECT order_id FROM payments WHERE status = 'paid' AND order_id IS NOT NULL)
        AND o1.id = (
          SELECT o2.id FROM orders o2
          WHERE o2.table_id = o1.table_id AND o2.status = 'completed'
          AND o2.id NOT IN (SELECT order_id FROM payments WHERE status = 'paid' AND order_id IS NOT NULL)
          ORDER BY o2.created_at DESC LIMIT 1
        )
      ) lo ON lo.table_id = t.id
      LEFT JOIN (
        SELECT p1.* FROM payments p1
        WHERE p1.id = (SELECT MAX(p2.id) FROM payments p2 WHERE p2.table_id = p1.table_id)
      ) p ON p.table_id = t.id
      ORDER BY CAST(t.table_number AS UNSIGNED)`
    );
    const result = rows.map(row => ({
      id: row.id,
      table_number: row.table_number,
      capacity: row.capacity,
      status: row.status,
      reservation_name: row.reservation_name,
      reservation_time: row.reservation_time,
      merged_with: row.merged_with,
      created_at: row.created_at,
      bill_total: row.bill_total,
      latest_order: row.lo_id ? {
        id: row.lo_id, subtotal: row.lo_subtotal, tax_amount: row.lo_tax_amount,
        total: row.lo_total, created_at: row.lo_created_at
      } : null,
      payment: row.p_id ? {
        id: row.p_id, total: row.p_total, online_amount: row.p_online_amount,
        offline_amount: row.p_offline_amount, status: row.p_status, created_at: row.p_created_at
      } : null
    }));
    res.json(result);
  } catch (error) {
    console.error('Get all tables with payment info error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
