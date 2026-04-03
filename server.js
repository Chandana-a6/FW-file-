const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// GET all products with their latest firmware
app.get('/api/products', (req, res) => {
    const query = `
        SELECT p.id, p.name, 
               (SELECT f.version FROM firmwares f WHERE f.product_id = p.id ORDER BY f.upload_date DESC LIMIT 1) as latest_version,
               (SELECT f.upload_date FROM firmwares f WHERE f.product_id = p.id ORDER BY f.upload_date DESC LIMIT 1) as latest_date
        FROM products p
    `;
    db.all(query, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// POST add new product
app.post('/api/products', (req, res) => {
    const { name } = req.body;
    if (!name) {
        return res.status(400).json({ error: "Product name is required" });
    }
    
    const query = `INSERT INTO products (name) VALUES (?)`;
    db.run(query, [name], function(err) {
        if (err) {
            if (err.message.includes('UNIQUE constraint failed')) {
                return res.status(400).json({ error: "Product already exists" });
            }
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ id: this.lastID, name });
    });
});

// GET firmware history for a product
app.get('/api/products/:id/firmwares', (req, res) => {
    const productId = req.params.id;
    const query = `SELECT * FROM firmwares WHERE product_id = ? ORDER BY upload_date DESC`;
    
    db.all(query, [productId], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.json(rows);
    });
});

// POST upload firmware
app.post('/api/products/:id/firmwares', upload.single('firmware'), (req, res) => {
    const productId = req.params.id;
    const { version } = req.body;
    const file = req.file;

    if (!version || !file) {
        return res.status(400).json({ error: "Version and firmware file are required" });
    }

    const query = `INSERT INTO firmwares (product_id, version, file_name, file_path) VALUES (?, ?, ?, ?)`;
    db.run(query, [productId, version, file.originalname, file.filename], function(err) {
        if (err) {
            return res.status(500).json({ error: err.message });
        }
        res.status(201).json({ 
            id: this.lastID, 
            product_id: productId, 
            version, 
            file_name: file.originalname 
        });
    });
});

// GET download a firmware
app.get('/api/firmwares/download/:id', (req, res) => {
    const firmwareId = req.params.id;
    const query = `SELECT file_path, file_name FROM firmwares WHERE id = ?`;
    
    db.get(query, [firmwareId], (err, row) => {
        if (err || !row) {
            return res.status(404).json({ error: "Firmware not found" });
        }
        const filePath = path.join(uploadsDir, row.file_path);
        if (fs.existsSync(filePath)) {
            res.download(filePath, row.file_name);
        } else {
            res.status(404).json({ error: "File not found on disk" });
        }
    });
});

// DELETE product and its firmwares
app.delete('/api/products/:id', (req, res) => {
    const productId = req.params.id;
    db.all(`SELECT file_path FROM firmwares WHERE product_id = ?`, [productId], (err, rows) => {
        if (!err && rows) {
            rows.forEach(row => {
                const fp = path.join(uploadsDir, row.file_path);
                if (fs.existsSync(fp)) fs.unlinkSync(fp);
            });
        }
        
        db.run(`DELETE FROM firmwares WHERE product_id = ?`, [productId], (err2) => {
            if (err2) return res.status(500).json({ error: err2.message });
            db.run(`DELETE FROM products WHERE id = ?`, [productId], function(err3) {
                if (err3) return res.status(500).json({ error: err3.message });
                res.json({ success: true });
            });
        });
    });
});

// DELETE a specific firmware file
app.delete('/api/firmwares/:id', (req, res) => {
    const firmwareId = req.params.id;
    db.get(`SELECT file_path FROM firmwares WHERE id = ?`, [firmwareId], (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Firmware not found" });
        
        const fp = path.join(uploadsDir, row.file_path);
        if (fs.existsSync(fp)) fs.unlinkSync(fp);
        
        db.run(`DELETE FROM firmwares WHERE id = ?`, [firmwareId], function(delErr) {
            if (delErr) return res.status(500).json({ error: delErr.message });
            res.json({ success: true });
        });
    });
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
