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

router.get('/all-tables', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM tables_ ORDER BY CAST(table_number AS UNSIGNED)'
    );
    const result = [];
    for (const table of rows) {
      const [orders] = await pool.query(
        `SELECT o.* FROM orders o
         WHERE o.table_id = ? AND o.status = 'completed'
         AND o.id NOT IN (SELECT p.order_id FROM payments p WHERE p.table_id = ? AND p.status = 'paid' AND p.order_id IS NOT NULL)
         ORDER BY o.created_at DESC`,
        [table.id, table.id]
      );
      const [payments] = await pool.query(
        'SELECT * FROM payments WHERE table_id = ? ORDER BY created_at DESC LIMIT 1',
        [table.id]
      );
      let billTotal = 0;
      for (const order of orders) {
        billTotal += parseFloat(order.total || 0);
      }
      result.push({
        ...table,
        latest_order: orders.length > 0 ? orders[0] : null,
        payment: payments.length > 0 ? payments[0] : null,
        bill_total: billTotal
      });
    }
    res.json(result);
  } catch (error) {
    console.error('Get all tables with payment info error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
