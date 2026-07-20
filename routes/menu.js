const express = require('express');
const router = express.Router();
const { pool } = require('../config/db');
const { authenticateAdmin } = require('../middleware/auth');
const upload = require('../config/upload');

router.post('/', authenticateAdmin, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Image upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { name, price, category_id, tax_id } = req.body;
    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required' });
    }
    const image = req.file ? '/uploads/' + req.file.filename : null;
    const [result] = await pool.query(
      'INSERT INTO menu_items (name, price, image, category_id, tax_id) VALUES (?, ?, ?, ?, ?)',
      [name, price, image, category_id || null, tax_id || null]
    );
    res.status(201).json({ message: 'Menu item created successfully', id: result.insertId });
  } catch (error) {
    console.error('Create menu item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.*, c.name as category_name, t.name as tax_name, t.percentage as tax_percentage 
       FROM menu_items m 
       LEFT JOIN categories c ON m.category_id = c.id 
       LEFT JOIN taxes t ON m.tax_id = t.id 
       ORDER BY m.name`
    );
    res.json(rows);
  } catch (error) {
    console.error('Get menu items error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/public', async (req, res) => {
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
    console.error('Get public menu error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/:id', authenticateAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT m.*, c.name as category_name, t.name as tax_name, t.percentage as tax_percentage 
       FROM menu_items m 
       LEFT JOIN categories c ON m.category_id = c.id 
       LEFT JOIN taxes t ON m.tax_id = t.id 
       WHERE m.id = ?`,
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    res.json(rows[0]);
  } catch (error) {
    console.error('Get menu item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/:id', authenticateAdmin, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Image upload failed' });
    }
    next();
  });
}, async (req, res) => {
  try {
    const { name, price, category_id, tax_id } = req.body;
    const [existing] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [req.params.id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    let query = 'UPDATE menu_items SET name = ?, price = ?, category_id = ?, tax_id = ?';
    let params = [
      name || existing[0].name,
      price || existing[0].price,
      category_id !== undefined ? (category_id || null) : existing[0].category_id,
      tax_id !== undefined ? (tax_id || null) : existing[0].tax_id
    ];
    if (req.file) {
      query += ', image = ?';
      params.push('/uploads/' + req.file.filename);
    }
    query += ' WHERE id = ?';
    params.push(req.params.id);
    await pool.query(query, params);
    res.json({ message: 'Menu item updated successfully' });
  } catch (error) {
    console.error('Update menu item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM menu_items WHERE id = ?', [req.params.id]);
    res.json({ message: 'Menu item deleted successfully' });
  } catch (error) {
    console.error('Delete menu item error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
