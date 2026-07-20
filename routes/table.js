const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateAdmin } = require('../middleware/auth');

router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { table_number, capacity } = req.body;
    if (!table_number) {
      return res.status(400).json({ error: 'Table number is required' });
    }
    const [existing] = await pool.query('SELECT * FROM tables_ WHERE table_number = ?', [table_number]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'Table number already exists' });
    }
    const [result] = await pool.query(
      'INSERT INTO tables_ (table_number, capacity) VALUES (?, ?)',
      [table_number, capacity || 4]
    );
    res.status(201).json({ message: 'Table created successfully', id: result.insertId });
  } catch (error) {
    console.error('Create table error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tables_ ORDER BY CAST(table_number AS UNSIGNED)');
    res.json(rows);
  } catch (error) {
    console.error('Get tables error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM tables_ WHERE id = ?', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Table not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Get table error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { table_number, capacity } = req.body;
    const [existing] = await pool.query('SELECT * FROM tables_ WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Table not found' });
    }
    await pool.query(
      'UPDATE tables_ SET table_number = ?, capacity = ? WHERE id = ?',
      [table_number || existing[0].table_number, capacity || existing[0].capacity, req.params.id]
    );
    res.json({ message: 'Table updated successfully' });
  } catch (error) {
    console.error('Update table error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM tables_ WHERE id = ?', [req.params.id]);
    res.json({ message: 'Table deleted successfully' });
  } catch (error) {
    console.error('Delete table error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['open', 'ready_to_pay', 'closed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    await pool.query('UPDATE tables_ SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Table status updated' });
  } catch (error) {
    console.error('Update table status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
