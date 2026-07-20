const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateAdmin } = require('../middleware/auth');

router.post('/bill', authenticateAdmin, async (req, res) => {
  try {
    const { customer_name, items, online_amount, offline_amount } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' });
    }
    let total = 0;
    for (const item of items) {
      total += parseFloat(item.price) * (item.quantity || 1);
    }
    const online = parseFloat(online_amount || 0);
    const offline = parseFloat(offline_amount || 0);
    const paymentTotal = online + offline;
    const paymentStatus = paymentTotal >= total ? 'paid' : 'unpaid';
    const [result] = await pool.query(
      'INSERT INTO parcel_bills (customer_name, items, total, online_amount, offline_amount, payment_status) VALUES (?, ?, ?, ?, ?, ?)',
      [customer_name || 'Walk-in Customer', JSON.stringify(items), total, online, offline, paymentStatus]
    );
    res.status(201).json({ message: 'Parcel bill created', id: result.insertId });
  } catch (error) {
    console.error('Create parcel bill error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/bills', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM parcel_bills ORDER BY created_at DESC');
    const parsed = rows.map(row => ({
      ...row,
      items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items
    }));
    res.json(parsed);
  } catch (error) {
    console.error('Get parcel bills error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/bill/:id', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM parcel_bills WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Parcel bill not found' });
    }
    const bill = rows[0];
    bill.items = typeof bill.items === 'string' ? JSON.parse(bill.items) : bill.items;
    res.json(bill);
  } catch (error) {
    console.error('Get parcel bill error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/bill/:id/pay', authenticateAdmin, async (req, res) => {
  try {
    const { online_amount, offline_amount } = req.body;
    const [existing] = await pool.query('SELECT * FROM parcel_bills WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Parcel bill not found' });
    }
    const online = parseFloat(online_amount || existing[0].online_amount);
    const offline = parseFloat(offline_amount || existing[0].offline_amount);
    const total = online + offline;
    const status = total >= existing[0].total ? 'paid' : 'unpaid';
    await pool.query(
      'UPDATE parcel_bills SET online_amount = ?, offline_amount = ?, payment_status = ? WHERE id = ?',
      [online, offline, status, req.params.id]
    );
    res.json({ message: 'Payment updated' });
  } catch (error) {
    console.error('Update parcel payment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
