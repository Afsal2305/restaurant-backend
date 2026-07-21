const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateAdmin } = require('../middleware/auth');

router.post('/process-table-bill', authenticateAdmin, async (req, res) => {
  try {
    const {
      order_id, table_id, payment_method, cash_amount, upi_amount, card_amount,
      voucher_amount, gift_voucher_code, online_amount, offline_amount,
      delivery_charge, packing_charge, parcel_charge, discount, discount_type,
      round_off
    } = req.body;

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
    let actualSubtotal = 0;
    let actualTax = 0;
    for (const order of orders) {
      actualTotal += parseFloat(order.total || 0);
      actualSubtotal += parseFloat(order.subtotal || 0);
      actualTax += parseFloat(order.tax_amount || 0);
    }

    const discAmt = parseFloat(discount || 0);
    const dc = parseFloat(delivery_charge || 0);
    const pc = parseFloat(packing_charge || 0);
    const parc = parseFloat(parcel_charge || 0);
    const ro = parseFloat(round_off || 0);

    const grandTotal = actualTotal + dc + pc + parc - discAmt + ro;

    const cashAmt = parseFloat(cash_amount || 0);
    const upiAmt = parseFloat(upi_amount || 0);
    const cardAmt = parseFloat(card_amount || 0);
    const voucherAmt = parseFloat(voucher_amount || 0);
    const paidAmount = cashAmt + upiAmt + cardAmt + voucherAmt;

    if (paidAmount < grandTotal) {
      return res.status(400).json({
        error: `Payment amount (₹${paidAmount.toFixed(2)}) is less than the total due (₹${grandTotal.toFixed(2)})`
      });
    }

    if (paidAmount > grandTotal * 1.5) {
      return res.status(400).json({
        error: `Payment amount (₹${paidAmount.toFixed(2)}) exceeds reasonable limit for total (₹${grandTotal.toFixed(2)})`
      });
    }

    const billNumber = `BILL-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const latestUnpaidOrderId = orders.length > 0 ? orders[0].id : order_id;

    await pool.query(
      `INSERT INTO payments (order_id, table_id, online_amount, offline_amount, total, status, type,
        payment_method, cash_amount, upi_amount, card_amount, voucher_amount, gift_voucher_code, bill_number)
       VALUES (?, ?, ?, ?, ?, 'paid', 'table', ?, ?, ?, ?, ?, ?, ?)`,
      [latestUnpaidOrderId, table_id, upiAmt + cardAmt, cashAmt, grandTotal,
       payment_method || 'split', cashAmt, upiAmt, cardAmt, voucherAmt, gift_voucher_code || null, billNumber]
    );

    if (orders.length > 0) {
      for (const order of orders) {
        await pool.query(
          'UPDATE orders SET delivery_charge = ?, packing_charge = ?, parcel_charge = ?, discount = ?, discount_type = ?, round_off = ? WHERE id = ?',
          [dc, pc, parc, discAmt, discount_type || 'fixed', ro, order.id]
        );
      }
    }

    await pool.query("UPDATE tables_ SET status = 'open' WHERE id = ?", [table_id]);

    res.status(201).json({
      message: 'Payment processed successfully',
      total: grandTotal,
      bill_number: billNumber,
      change_due: Math.max(0, paidAmount - grandTotal)
    });
  } catch (error) {
    console.error('Process table bill error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/process-parcel-bill', authenticateAdmin, async (req, res) => {
  try {
    const {
      customer_name, customer_phone, customer_address, items,
      parcel_charge, delivery_charge, packing_charge, discount,
      round_off, payment_method, cash_amount, upi_amount, card_amount, voucher_amount
    } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Items are required' });
    }

    let subtotal = 0;
    for (const item of items) {
      subtotal += parseFloat(item.price) * (item.quantity || 1);
    }

    const parc = parseFloat(parcel_charge || 0);
    const dc = parseFloat(delivery_charge || 0);
    const pc = parseFloat(packing_charge || 0);
    const disc = parseFloat(discount || 0);
    const ro = parseFloat(round_off || 0);
    const grandTotal = subtotal + parc + dc + pc - disc + ro;

    const billNumber = `BILL-${Date.now()}`;
    const cashAmt = parseFloat(cash_amount || 0);
    const upiAmt = parseFloat(upi_amount || 0);
    const cardAmt = parseFloat(card_amount || 0);
    const voucherAmt = parseFloat(voucher_amount || 0);
    const paidTotal = cashAmt + upiAmt + cardAmt + voucherAmt;

    const [result] = await pool.query(
      `INSERT INTO parcel_bills (customer_name, customer_phone, customer_address, items, total,
        parcel_charge, delivery_charge, packing_charge, discount, round_off,
        online_amount, offline_amount, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer_name || 'Walk-in Customer', customer_phone || null, customer_address || null,
       JSON.stringify(items), grandTotal, parc, dc, pc, disc, ro,
       upiAmt + cardAmt, cashAmt, paidTotal >= grandTotal ? 'paid' : 'unpaid']
    );

    res.status(201).json({
      message: 'Parcel bill processed successfully',
      id: result.insertId,
      bill_number: billNumber,
      total: grandTotal
    });
  } catch (error) {
    console.error('Process parcel bill error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/kot-bills/:orderId', authenticateAdmin, async (req, res) => {
  try {
    const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.orderId]);
    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    const order = orderRows[0];

    const [items] = await pool.query(
      `SELECT oi.*, m.name as menu_item_name, m.image as menu_item_image, t.name as tax_name
       FROM order_items oi
       INNER JOIN menu_items m ON oi.menu_item_id = m.id
       LEFT JOIN taxes t ON m.tax_id = t.id
       WHERE oi.order_id = ?`,
      [order.id]
    );

    const [kots] = await pool.query(
      `SELECT k.*,
              (SELECT COUNT(*) FROM kot_items ki WHERE ki.kot_id = k.id) as item_count
       FROM kot k WHERE k.order_id = ? ORDER BY k.created_at DESC`,
      [order.id]
    );

    for (const kot of kots) {
      const [kitems] = await pool.query('SELECT * FROM kot_items WHERE kot_id = ?', [kot.id]);
      kot.items = kitems;
    }

    const [payments] = await pool.query(
      'SELECT * FROM payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1',
      [order.id]
    );

    res.json({
      order,
      items,
      kots,
      payment: payments.length > 0 ? payments[0] : null
    });
  } catch (error) {
    console.error('Get KOT bills error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/ready-to-pay', authenticateAdmin, async (req, res) => {
  try {
    const [tables] = await pool.query(
      "SELECT * FROM tables_ WHERE status = 'ready_to_pay' ORDER BY CAST(table_number AS UNSIGNED)"
    );
    const result = [];
    for (const table of tables) {
      const [orders] = await pool.query(
        `SELECT o.* FROM orders o
         WHERE o.table_id = ? AND o.status = 'completed'
         AND o.id NOT IN (SELECT p.order_id FROM payments p WHERE p.table_id = ? AND p.status = 'paid' AND p.order_id IS NOT NULL)
         ORDER BY o.created_at DESC`,
        [table.id, table.id]
      );
      if (orders.length === 0) continue;
      let allItems = [];
      let subtotalSum = 0;
      let taxSum = 0;
      let totalSum = 0;
      for (const order of orders) {
        const [items] = await pool.query(
          `SELECT oi.*, m.name as menu_item_name, m.image as menu_item_image
           FROM order_items oi
           INNER JOIN menu_items m ON oi.menu_item_id = m.id
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
      result.push({
        table: { id: table.id, table_number: table.table_number, capacity: table.capacity },
        order: { subtotal: subtotalSum, tax_amount: taxSum, total: totalSum },
        items: allItems,
      });
    }
    res.json(result);
  } catch (error) {
    console.error('Get ready to pay tables error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/payment-methods', authenticateAdmin, async (req, res) => {
  res.json({
    methods: [
      { id: 'cash', name: 'Cash', icon: 'cash' },
      { id: 'upi', name: 'UPI', icon: 'smartphone' },
      { id: 'card', name: 'Card', icon: 'credit-card' },
      { id: 'split', name: 'Split Payment', icon: 'split' },
      { id: 'voucher', name: 'Gift Voucher', icon: 'gift' },
      { id: 'multiple', name: 'Multiple Payment', icon: 'layers' },
    ]
  });
});

router.get('/history', authenticateAdmin, async (req, res) => {
  try {
    const { from, to, type } = req.query;
    let conditions = [];
    let params = [];

    if (from) {
      conditions.push('p.created_at >= ?');
      params.push(from + ' 00:00:00');
    }
    if (to) {
      conditions.push('p.created_at <= ?');
      params.push(to + ' 23:59:59');
    }
    if (type && type !== 'all') {
      conditions.push('p.type = ?');
      params.push(type);
    }

    let query = `SELECT p.*, t.table_number FROM payments p
                 LEFT JOIN tables_ t ON p.table_id = t.id`;
    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY p.created_at DESC LIMIT 100';

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    console.error('Get payment history error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
