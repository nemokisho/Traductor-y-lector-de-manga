import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import multer from "multer";
import { GoogleGenAI } from "@google/genai";
import Database from "better-sqlite3";

const dbPath = path.join(process.cwd(), "library.db");
const mangasDir = path.join(process.cwd(), "mangas");

if (!fs.existsSync(mangasDir)) {
  fs.mkdirSync(mangasDir, { recursive: true });
}

const sqlite = new Database(dbPath);

// Initialize DB
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS manga (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    cover TEXT NOT NULL,
    page_count INTEGER NOT NULL,
    zip_data BLOB,
    collection_id INTEGER,
    file_path TEXT,
    file_size INTEGER, -- Added size column
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(collection_id) REFERENCES collections(id) ON DELETE SET NULL
  );

  -- Migration: Add columns if they don't exist
`);

try {
  sqlite.exec("ALTER TABLE manga ADD COLUMN collection_id INTEGER");
} catch (e) {
  // Column already exists
}

try {
  sqlite.exec("ALTER TABLE manga ADD COLUMN file_path TEXT");
} catch (e) {
  // Column already exists
}

try {
  sqlite.exec("ALTER TABLE manga ADD COLUMN file_size INTEGER");
} catch (e) {
  // Column already exists
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware para JSON con límite aumentado para imágenes base64
  app.use(express.json({ limit: '50mb' }));
  
  // Configuración de multer (memoria temporal para el ZIP)
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 } // 100MB limit
  });

  // API Routes para Colecciones
  app.get("/api/collections", (req, res) => {
    try {
      const rows = sqlite.prepare("SELECT * FROM collections ORDER BY name ASC").all();
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Error al leer colecciones" });
    }
  });

  app.post("/api/collections", (req, res) => {
    try {
      const { name } = req.body;
      const info = sqlite.prepare("INSERT INTO collections (name) VALUES (?)").run(name);
      res.json({ id: info.lastInsertRowid });
    } catch (error) {
      if ((error as any).code === 'SQLITE_CONSTRAINT') {
        return res.status(400).json({ error: "La colección ya existe" });
      }
      res.status(500).json({ error: "Error al crear colección" });
    }
  });

  app.delete("/api/collections/:id", (req, res) => {
    try {
      sqlite.prepare("DELETE FROM collections WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Error al eliminar colección" });
    }
  });

  // API Routes para Biblioteca
  app.get("/api/library", (req, res) => {
    try {
      const { collectionId } = req.query;
      let query = "SELECT id, name, cover, page_count, collection_id, file_path, file_size, created_at FROM manga";
      const params = [];
      
      if (collectionId) {
        query += " WHERE collection_id = ?";
        params.push(collectionId);
      }
      
      query += " ORDER BY created_at DESC";
      const rows = sqlite.prepare(query).all(...params);
      res.json(rows);
    } catch (error) {
      res.status(500).json({ error: "Error al leer biblioteca" });
    }
  });

  app.post("/api/library", upload.single('zipFile'), (req, res) => {
    try {
      const { name, cover, count, collectionId, filePath } = req.body;
      let buffer: Buffer;
      
      if (req.file) {
        buffer = req.file.buffer;
      } else if (req.body.zipData) {
        buffer = Buffer.from(req.body.zipData, 'base64');
      } else {
        return res.status(400).json({ error: "Falta el archivo ZIP" });
      }

      // Save metadata to DB first (without the BLOB for new entries)
      const info = sqlite.prepare("INSERT INTO manga (name, cover, page_count, collection_id, file_path, file_size) VALUES (?, ?, ?, ?, ?, ?)").run(
        name, 
        cover, 
        parseInt(count), 
        collectionId ? parseInt(collectionId) : null,
        filePath || null,
        buffer.length
      );
      
      const mangaId = info.lastInsertRowid;
      
      // Save the ZIP file to the filesystem
      const internalPath = path.join(mangasDir, `${mangaId}.zip`);
      fs.writeFileSync(internalPath, buffer);

      res.json({ id: mangaId });
    } catch (error) {
      console.error("Error al guardar en biblioteca:", error);
      res.status(500).json({ error: "Error al guardar en biblioteca" });
    }
  });

  app.get("/api/library/:id", (req, res) => {
    try {
      const { id } = req.params;
      const internalPath = path.join(mangasDir, `${id}.zip`);
      
      if (fs.existsSync(internalPath)) {
        res.set('Content-Type', 'application/zip');
        return res.sendFile(internalPath);
      }

      // Fallback to DB for old entries
      const row = sqlite.prepare("SELECT zip_data FROM manga WHERE id = ?").get(id) as any;
      if (!row || !row.zip_data) return res.status(404).send("Not found");
      
      res.set('Content-Type', 'application/zip');
      res.send(row.zip_data);
    } catch (error) {
      console.error("Error reading manga file:", error);
      res.status(500).send("Error reading storage");
    }
  });

  app.delete("/api/library/:id", (req, res) => {
    try {
      const { id } = req.params;
      
      // Delete from filesystem
      const internalPath = path.join(mangasDir, `${id}.zip`);
      if (fs.existsSync(internalPath)) {
        fs.unlinkSync(internalPath);
      }

      // Delete from metadata DB
      sqlite.prepare("DELETE FROM manga WHERE id = ?").run(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error al eliminar manga:", error);
      res.status(500).json({ error: "Error al eliminar manga" });
    }
  });

  // Configuración de Vite como middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor de Manga Translator corriendo en http://localhost:${PORT}`);
  });
}

startServer();
